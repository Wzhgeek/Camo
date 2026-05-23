import type { LLMProvider, ChatMessage, ToolCall } from "../llm/types.js";
import { toolRegistry } from "../tools/registry.js";
import { PermissionManager } from "./permissions.js";

export interface AgentCallbacks {
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  onReasoningContent?: (token: string) => void;
  onToolCallStart?: (toolCall: ToolCall) => void;
  onToolCallResult?: (toolCall: ToolCall, result: string) => void;
  onToolConfirmRequest?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

export interface AgentContext {
  systemPrompt: string;
  history: ChatMessage[];
  tools?: string[];
}

const MAX_ROUNDS = 10;

export class AgentLoop {
  constructor(
    private readonly provider: LLMProvider,
    private readonly permissions: PermissionManager,
    private readonly callbacks: AgentCallbacks,
  ) {}

  /** Collect all tools that the PermissionManager switch allows */
  getAllowedTools(): string[] {
    return toolRegistry.listNames().filter(
      (name) => this.permissions.check(name) !== "deny"
    );
  }

  async run(userMessage: string, context: AgentContext, signal?: AbortSignal): Promise<string> {
    const tools = context.tools ?? toolRegistry.listNames();
    const schemas = toolRegistry.getSchemas(tools);

    const messages: ChatMessage[] = [
      { role: "system", content: context.systemPrompt },
      ...context.history,
      { role: "user", content: userMessage },
    ];

    let finalContent = "";
    let round = 0;

    while (round < MAX_ROUNDS) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      round++;

      let roundContent = "";
      let roundReasoning = "";
      const roundToolCalls: ToolCall[] = [];

      const passTools = round < MAX_ROUNDS ? schemas : undefined;

      const reply = await this.provider.chatStream(
        messages,
        {
          onToken: (token) => {
            roundContent += token;
            finalContent += token;
            this.callbacks.onToken(token);
          },
          onThinking: (token) => {
            this.callbacks.onThinking?.(token);
          },
          onReasoningContent: (token) => {
            roundReasoning += token;
            this.callbacks.onReasoningContent?.(token);
          },
          onToolCalls: (tcs) => {
            for (const tc of tcs) roundToolCalls.push(tc);
          },
        },
        signal,
        passTools,
      );

      if (roundToolCalls.length === 0) {
        finalContent = finalContent || reply;
        break;
      }

      // Add assistant message with tool calls, preserving reasoning_content for DeepSeek
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: roundContent || "",
        tool_calls: roundToolCalls,
      };
      if (roundReasoning) {
        assistantMsg.reasoning_content = roundReasoning;
      }
      messages.push(assistantMsg);

      // Execute each tool call
      for (const tc of roundToolCalls) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const toolName = tc.function.name;
        this.callbacks.onToolCallStart?.(tc);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch { /* invalid JSON, proceed with empty args */ }

        // Permission check
        const action = this.permissions.check(toolName);
        let result: string;
        if (action === "deny") {
          result = `Error: 工具 "${toolName}" 已被用户禁用`;
        } else if (action === "ask" && this.callbacks.onToolConfirmRequest) {
          const allowed = await this.callbacks.onToolConfirmRequest(toolName, args);
          if (!allowed) {
            result = `Error: 用户拒绝了 "${toolName}" 的执行请求`;
          } else {
            result = await toolRegistry.execute(toolName, args);
          }
        } else {
          result = await toolRegistry.execute(toolName, args);
        }

        this.callbacks.onToolCallResult?.(tc, result);

        // Add tool result message
        const toolMsg: ChatMessage = {
          role: "tool",
          content: result,
          tool_call_id: tc.id,
          name: toolName,
        };
        messages.push(toolMsg);
      }
    }

    if (round >= MAX_ROUNDS && !finalContent) {
      // Max rounds reached, make one final call without tools
      finalContent = await this.provider.chat(messages, undefined);
      this.callbacks.onToken(finalContent);
    }

    return finalContent;
  }
}
