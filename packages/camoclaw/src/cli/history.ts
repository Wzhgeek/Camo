import { sessionManager, type StoredMessage } from "./sessions.js";

export interface CLIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

export class History {
  private messages: CLIChatMessage[] = [];
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.load();
  }

  get sid(): string { return this.sessionId; }

  private load(): void {
    const rows = sessionManager.loadMessages(this.sessionId);
    this.messages = rows.map(r => this.fromRow(r));
  }

  push(msg: CLIChatMessage): void {
    this.messages.push(msg);
    sessionManager.appendMessage(
      this.sessionId,
      msg.role,
      msg.content,
      msg.tool_calls ? JSON.stringify(msg.tool_calls) : undefined,
    );
  }

  pop(): CLIChatMessage | undefined { return this.messages.pop(); }

  clear(): void {
    sessionManager.clearMessages(this.sessionId);
    this.messages = [];
  }

  forLLM(limit = 20): CLIChatMessage[] { return this.messages.slice(-limit); }

  get length(): number { return this.messages.length; }

  undoLast(): number {
    while (this.messages.length > 0 && this.messages[this.messages.length - 1].role !== "user") {
      this.messages.pop();
    }
    if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === "user") {
      this.messages.pop();
      // Persist undo by clearing and re-appending
      sessionManager.clearMessages(this.sessionId);
      for (const m of this.messages) {
        sessionManager.appendMessage(this.sessionId, m.role, m.content,
          m.tool_calls ? JSON.stringify(m.tool_calls) : undefined);
      }
      return 1;
    }
    return 0;
  }

  compact(keepRecent = 8): { before: number; after: number } {
    const before = this.messages.length;
    if (before <= keepRecent + 2) return { before, after: before };

    const older = this.messages.slice(0, -keepRecent);
    const recent = this.messages.slice(-keepRecent);
    const summaryLines = older
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map(m => `${m.role}: ${m.content.replace(/\s+/g, " ").slice(0, 220)}`);
    const summary: CLIChatMessage = {
      role: "system",
      content: [
        "以下是已压缩的早期上下文摘要，供后续对话参考：",
        ...summaryLines,
      ].join("\n"),
    };

    this.messages = [summary, ...recent];
    sessionManager.clearMessages(this.sessionId);
    for (const m of this.messages) {
      sessionManager.appendMessage(
        this.sessionId,
        m.role,
        m.content,
        m.tool_calls ? JSON.stringify(m.tool_calls) : undefined,
      );
    }
    return { before, after: this.messages.length };
  }

  getTokenEstimate(): number {
    let total = 0;
    for (const m of this.messages) {
      total += m.content.length;
      if (m.tool_calls) total += JSON.stringify(m.tool_calls).length;
    }
    return Math.ceil(total / 3.5);
  }

  private fromRow(r: StoredMessage): CLIChatMessage {
    return {
      role: r.role as CLIChatMessage["role"],
      content: r.content,
      tool_calls: r.toolCalls ? JSON.parse(r.toolCalls) : undefined,
    };
  }
}
