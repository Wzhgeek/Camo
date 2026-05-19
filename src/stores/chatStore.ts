import { defineStore } from "pinia";
import { ref } from "vue";
import { useSettingsStore } from "./settingsStore";
import { OpenAICompatibleProvider } from "../core/llm/openaiCompatible";
import { OllamaProvider } from "../core/llm/ollama";
import type { LLMProvider, ChatMessage as LLMChatMessage } from "../core/llm/types";
import { detectIntent } from "../core/agent/intent";
import { parseReminderFromText } from "../core/reminder/parser";
import { reminderService } from "../core/reminder/reminderService";
import { dbAll, dbRun } from "../core/storage/database";

export type ChatRole = "user" | "assistant";
export type LLMPhase = "idle" | "thinking" | "answering" | "done";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  thinking?: string;
  isThinking?: boolean;
  createdAt: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function persistMessage(sessionId: string, msg: ChatMessage) {
  try {
    dbRun(
      "INSERT INTO chat_messages (id, session_id, role, content, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [msg.id, sessionId, msg.role, msg.content, msg.thinking || null, msg.createdAt],
    );
  } catch {}
}

function loadSessions(): Session[] {
  try {
    const rows = dbAll<any>("SELECT * FROM sessions ORDER BY updated_at DESC");
    if (rows.length > 0) return rows.map((r: any) => ({
      id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  } catch {}
  return [];
}

function loadMessages(sessionId: string): ChatMessage[] {
  try {
    const rows = dbAll<any>(
      "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId],
    );
    if (rows.length > 0) return rows.map((r: any) => ({
      id: r.id, role: r.role, content: r.content,
      thinking: r.thinking || undefined, createdAt: r.created_at,
    }));
  } catch {}
  return [];
}

function buildProvider(): LLMProvider | null {
  const { settings } = useSettingsStore();
  const { llm } = settings;
  if (!llm.baseUrl || !llm.model) return null;
  if (llm.provider === "ollama") return new OllamaProvider(llm.baseUrl, llm.model);
  return new OpenAICompatibleProvider(llm.baseUrl, llm.apiKey, llm.model);
}

export const useChatStore = defineStore("chat", () => {
  const sessions = ref<Session[]>(loadSessions());
  const activeSessionId = ref<string>("");
  const messages = ref<ChatMessage[]>([]);
  const isResponding = ref(false);
  const llmPhase = ref<LLMPhase>("idle");
  let abortController: AbortController | null = null;

  function ensureSession() {
    if (sessions.value.length === 0) {
      createSession("新对话");
    }
    if (!activeSessionId.value) {
      activeSessionId.value = sessions.value[0].id;
    }
    if (messages.value.length === 0) {
      const loaded = loadMessages(activeSessionId.value);
      if (loaded.length > 0) {
        messages.value = loaded;
      } else {
        const welcome = createMessage("assistant", "你好，我是 Camo。可以问我问题，也可以让我设置提醒。");
        messages.value = [welcome];
        persistMessage(activeSessionId.value, welcome);
      }
    }
  }

  function createSession(title?: string) {
    const now = new Date().toISOString();
    const session: Session = {
      id: crypto.randomUUID(),
      title: title || "新对话",
      createdAt: now,
      updatedAt: now,
    };
    try {
      dbRun("INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [session.id, session.title, session.createdAt, session.updatedAt]);
    } catch {}
    sessions.value.unshift(session);
    switchSession(session.id);
    return session;
  }

  function switchSession(id: string) {
    activeSessionId.value = id;
    const loaded = loadMessages(id);
    if (loaded.length > 0) {
      messages.value = loaded;
    } else {
      const welcome = createMessage("assistant", "你好，我是 Camo。可以问我问题，也可以让我设置提醒。");
      messages.value = [welcome];
      persistMessage(id, welcome);
    }
  }

  function deleteSession(id: string) {
    try {
      dbRun("DELETE FROM chat_messages WHERE session_id = ?", [id]);
      dbRun("DELETE FROM sessions WHERE id = ?", [id]);
    } catch {}
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeSessionId.value === id) {
      if (sessions.value.length === 0) createSession("新对话");
      else switchSession(sessions.value[0].id);
    }
  }

  function clearMessages() {
    try {
      dbRun("DELETE FROM chat_messages WHERE session_id = ?", [activeSessionId.value]);
    } catch {}
    const welcome = createMessage("assistant", "对话已清除。有什么可以帮你的？");
    messages.value = [welcome];
    persistMessage(activeSessionId.value, welcome);
  }

  function pushMessage(role: ChatRole, content: string) {
    const msg = createMessage(role, content);
    messages.value.push(msg);
    persistMessage(activeSessionId.value, msg);
    updateSessionTime();
    return msg;
  }

  function updateSessionTime() {
    const now = new Date().toISOString();
    const s = sessions.value.find((s) => s.id === activeSessionId.value);
    if (s) s.updatedAt = now;
    try { dbRun("UPDATE sessions SET updated_at = ? WHERE id = ?", [now, activeSessionId.value]); } catch {}
  }

  function stopResponse() {
    if (abortController) { abortController.abort(); abortController = null; }
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isResponding.value) return;

    pushMessage("user", trimmed);
    isResponding.value = true;

    try {
      const intent = detectIntent(trimmed);
      if (intent === "create_reminder") {
        const input = parseReminderFromText(trimmed);
        const created = reminderService.create(input);
        pushMessage("assistant", `已记下：${created.title}`);
        llmPhase.value = "done";
        isResponding.value = false;
        return;
      }

      const provider = buildProvider();
      if (!provider) {
        pushMessage("assistant", "请先在设置中配置 LLM（右键 → 设置）。");
        llmPhase.value = "idle";
        isResponding.value = false;
        return;
      }

      const settingsStore = useSettingsStore();
      const history: LLMChatMessage[] = [
        { role: "system", content: settingsStore.settings.systemPrompt },
        ...messages.value.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const streamMsg = createMessage("assistant", "");
      streamMsg.thinking = "";
      messages.value.push(streamMsg);
      const idx = messages.value.length - 1;
      messages.value[idx].isThinking = true;
      let thinkingStarted = false;
      let contentStarted = false;
      abortController = new AbortController();

      const reply = await provider.chatStream(history, {
        onToken(token) {
          if (!contentStarted) {
            contentStarted = true;
            messages.value[idx].isThinking = false;
            llmPhase.value = "answering";
          }
          messages.value[idx].content += token;
        },
        onThinking(token) {
          if (!thinkingStarted) {
            thinkingStarted = true;
            llmPhase.value = "thinking";
          }
          messages.value[idx].thinking = (messages.value[idx].thinking || "") + token;
        },
      }, abortController.signal);

      messages.value[idx].content = reply || "（无回复）";
      persistMessage(activeSessionId.value, messages.value[idx]);
      updateSessionTitle(trimmed);
    } catch (err: any) {
      if (err.name === "AbortError") {
        const idx = messages.value.length - 1;
        if (messages.value[idx]?.role === "assistant") {
          messages.value[idx].isThinking = false;
          if (!messages.value[idx].content) messages.value[idx].content = "（已停止）";
        }
      } else {
        pushMessage("assistant", `出错了：${err.message || "未知错误"}`);
      }
    } finally {
      abortController = null;
      isResponding.value = false;
      llmPhase.value = "idle";
    }
  }

  function updateSessionTitle(firstMsg: string) {
    const s = sessions.value.find((s) => s.id === activeSessionId.value);
    if (s && s.title === "新对话") {
      s.title = firstMsg.slice(0, 20) + (firstMsg.length > 20 ? "..." : "");
      try { dbRun("UPDATE sessions SET title = ? WHERE id = ?", [s.title, s.id]); } catch {}
    }
  }

  ensureSession();

  return {
    sessions, activeSessionId, messages, isResponding, llmPhase,
    sendMessage, stopResponse, createSession, switchSession, deleteSession, clearMessages,
  };
});
