import type { ChatMessage, LLMProvider, StreamCallbacks, Tool } from "./types";

export class OllamaProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[], _tools?: Tool[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Ollama 请求失败: ${response.status} ${text}`);
    }
    const data = await response.json();
    return data.message?.content ?? "";
  }

  async chatStream(messages: ChatMessage[], callbacks: StreamCallbacks, signal?: AbortSignal, _tools?: Tool[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Ollama 请求失败: ${response.status} ${text}`);
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";
    try {
      while (true) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            const thinking = obj.message?.thinking ?? "";
            const token = obj.message?.content ?? "";
            if (thinking && callbacks.onThinking) callbacks.onThinking(thinking);
            if (token) { full += token; callbacks.onToken(token); }
          } catch {}
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return full;
  }
}
