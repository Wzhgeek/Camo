import type { ChatMessage, LLMProvider, StreamCallbacks, Tool, ToolCall } from "./types";

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[], tools?: Tool[]): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.model, messages, temperature: 0.7, stream: false,
    };
    if (tools?.length) body.tools = tools;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM 请求失败: ${response.status} ${text}`);
    }
    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (msg?.tool_calls?.length) {
      const tc = msg.tool_calls as ToolCall[];
      return JSON.stringify(tc.map((t) => ({
        name: t.function.name,
        arguments: JSON.parse(t.function.arguments || "{}"),
      })));
    }
    return msg?.content ?? "";
  }

  async chatStream(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
    tools?: Tool[],
  ): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.model, messages, temperature: 0.7, stream: true,
    };
    if (tools?.length) {
      body.tools = tools;
      body.tool_choice = "auto";
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM 请求失败: ${response.status} ${text}`);
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let reasoningContent = "";
    const toolCallAccumulator: Map<number, { id: string; name: string; args: string }> = new Map();
    let hasToolCalls = false;

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
            const delta = obj.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.tool_calls?.length) {
              hasToolCalls = true;
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallAccumulator.has(idx)) {
                  toolCallAccumulator.set(idx, {
                    id: tc.id ?? "",
                    name: tc.function?.name ?? "",
                    args: tc.function?.arguments ?? "",
                  });
                } else {
                  const entry = toolCallAccumulator.get(idx)!;
                  if (tc.id) entry.id = tc.id;
                  if (tc.function?.name) entry.name = tc.function.name;
                  if (tc.function?.arguments) entry.args += tc.function.arguments;
                }
              }
            }

            const reasoningToken = delta.reasoning_content ?? "";
            if (reasoningToken) {
              reasoningContent += reasoningToken;
              callbacks.onReasoningContent?.(reasoningToken);
            }
            const token = delta.content ?? "";
            if (token) { full += token; callbacks.onToken(token); }
          } catch {}
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    // Emit accumulated tool calls
    if (hasToolCalls && callbacks.onToolCalls) {
      const parsed: ToolCall[] = [];
      for (const [, entry] of toolCallAccumulator) {
        if (entry.name) {
          parsed.push({
            id: entry.id || crypto.randomUUID(),
            type: "function",
            function: { name: entry.name, arguments: entry.args || "{}" },
          });
        }
      }
      if (parsed.length > 0) callbacks.onToolCalls(parsed);
    }

    return full;
  }
}
