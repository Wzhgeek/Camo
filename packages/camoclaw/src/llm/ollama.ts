import type { ChatMessage, LLMProvider, StreamCallbacks, Tool, ToolCall } from "./types.js";

interface OllamaToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

export class OllamaProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[], tools?: Tool[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const body: Record<string, unknown> = { model: this.model, messages, stream: false };
    if (tools?.length) body.tools = tools;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Ollama 请求失败: ${response.status} ${text}`);
    }
    const data = await response.json();
    const msg = data.message;
    if (msg?.tool_calls?.length) {
      const calls: ToolCall[] = (msg.tool_calls as OllamaToolCall[]).map((tc) => ({
        id: tc.id ?? `${tc.function?.name ?? "tool"}_${Date.now()}`,
        type: "function" as const,
        function: {
          name: tc.function?.name ?? "",
          arguments: typeof tc.function?.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments ?? {}),
        },
      }));
      return JSON.stringify(calls);
    }
    return msg?.content ?? "";
  }

  async chatStream(messages: ChatMessage[], callbacks: StreamCallbacks, signal?: AbortSignal, tools?: Tool[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/chat`;
    const body: Record<string, unknown> = { model: this.model, messages, stream: true };
    if (tools?.length) body.tools = tools;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Ollama 请求失败: ${response.status} ${text}`);
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";
    // Accumulate tool calls from streamed NDJSON lines
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();
    let hasToolCalls = false;
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
            const msg = obj.message;
            if (!msg) continue;
            // Check for tool calls in the streamed message
            const toolCallsChunk = msg.tool_calls as OllamaToolCall[] | undefined;
            if (toolCallsChunk) {
              hasToolCalls = true;
              for (let i = 0; i < toolCallsChunk.length; i++) {
                const tc = toolCallsChunk[i];
                const existing = toolCallMap.get(i);
                if (existing) {
                  if (tc.function?.arguments) {
                    existing.args += typeof tc.function.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments);
                  }
                } else {
                  toolCallMap.set(i, {
                    id: tc.id ?? `${tc.function?.name ?? "tool"}_${Date.now()}`,
                    name: tc.function?.name ?? "",
                    args: typeof tc.function?.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function?.arguments ?? {}),
                  });
                }
              }
            }
            const thinking = msg.thinking ?? "";
            const token = msg.content ?? "";
            if (thinking && callbacks.onThinking) callbacks.onThinking(thinking);
            if (token) { full += token; callbacks.onToken(token); }
          } catch { /* skip malformed lines */ }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    if (hasToolCalls && callbacks.onToolCalls && toolCallMap.size > 0) {
      const calls: ToolCall[] = Array.from(toolCallMap.values()).map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args },
      }));
      callbacks.onToolCalls(calls);
    }
    return full;
  }
}
