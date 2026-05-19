import type { ChatMessage, LLMProvider, StreamCallbacks } from "./types";

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.7, stream: false }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM 请求失败: ${response.status} ${text}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  async chatStream(messages: ChatMessage[], callbacks: StreamCallbacks, signal?: AbortSignal): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.7, stream: true }),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM 请求失败: ${response.status} ${text}`);
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
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const obj = JSON.parse(line.slice(6));
            const token = obj.choices?.[0]?.delta?.content ?? "";
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
