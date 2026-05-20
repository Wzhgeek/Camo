import { defineStore } from "pinia";
import { ref } from "vue";
import { useSettingsStore } from "./settingsStore";
import { OpenAICompatibleProvider } from "../core/llm/openaiCompatible";
import { OllamaProvider } from "../core/llm/ollama";
import type { LLMProvider, ChatMessage as LLMChatMessage } from "../core/llm/types";
import { parseReminderFromText } from "../core/reminder/parser";
import { reminderService } from "../core/reminder/reminderService";
import type { ReminderInput, ReminderType, ScheduleKind } from "../core/reminder/types";
import { useReminderStore } from "./reminderStore";

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

const SESSIONS_KEY = "camo.chat.sessions";
const MSG_PREFIX = "camo.chat.msg.";

function createMessage(role: ChatRole, content: string): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
}

function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]"); } catch { return []; }
}

function saveSessions(list: Session[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
}

function loadMessages(sessionId: string): ChatMessage[] {
  try { return JSON.parse(localStorage.getItem(MSG_PREFIX + sessionId) || "[]"); } catch { return []; }
}

function saveMessages(sessionId: string, msgs: ChatMessage[]) {
  localStorage.setItem(MSG_PREFIX + sessionId, JSON.stringify(msgs));
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
    if (sessions.value.length === 0) createSession("新对话");
    if (!activeSessionId.value) activeSessionId.value = sessions.value[0].id;
    if (messages.value.length === 0) {
      const loaded = loadMessages(activeSessionId.value);
      if (loaded.length > 0) {
        messages.value = loaded;
      } else {
        const welcome = createMessage("assistant", "你好，我是 Camo。可以问我问题，也可以让我设置提醒。");
        messages.value = [welcome];
        saveMessages(activeSessionId.value, messages.value);
      }
    }
  }

  function createSession(title?: string) {
    const now = new Date().toISOString();
    const session: Session = { id: crypto.randomUUID(), title: title || "新对话", createdAt: now, updatedAt: now };
    sessions.value.unshift(session);
    saveSessions(sessions.value);
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
      saveMessages(id, messages.value);
    }
  }

  function deleteSession(id: string) {
    localStorage.removeItem(MSG_PREFIX + id);
    sessions.value = sessions.value.filter((s) => s.id !== id);
    saveSessions(sessions.value);
    if (activeSessionId.value === id) {
      if (sessions.value.length === 0) createSession("新对话");
      else switchSession(sessions.value[0].id);
    }
  }

  function clearMessages() {
    const welcome = createMessage("assistant", "对话已清除。有什么可以帮你的？");
    messages.value = [welcome];
    saveMessages(activeSessionId.value, messages.value);
  }

  function pushMessage(role: ChatRole, content: string) {
    const msg = createMessage(role, content);
    messages.value.push(msg);
    saveMessages(activeSessionId.value, messages.value);
    updateSessionTime();
    return msg;
  }

  function updateSessionTime() {
    const now = new Date().toISOString();
    const s = sessions.value.find((s) => s.id === activeSessionId.value);
    if (s) { s.updatedAt = now; saveSessions(sessions.value); }
  }

  function stopResponse() {
    if (abortController) { abortController.abort(); abortController = null; }
  }

  function buildAndCreateReminder(action: any) {
    const kind: ScheduleKind = action.scheduleKind || "once";
    let payload: Record<string, unknown>;
    if (kind === "daily") {
      payload = { time: action.time };
    } else if (kind === "interval") {
      payload = { intervalMinutes: Number(action.intervalMinutes) };
    } else {
      payload = { runAt: action.triggerAt };
    }
    const validTypes: ReminderType[] = ["normal", "water", "exercise"];
    const input: ReminderInput = {
      title: action.title || "提醒",
      type: validTypes.includes(action.type) ? action.type : "normal",
      scheduleKind: kind,
      schedulePayload: payload,
      enabled: true,
    };
    const created = reminderService.create(input);
    useReminderStore().refreshReminders();
    return created;
  }

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isResponding.value) return;

    pushMessage("user", trimmed);
    isResponding.value = true;
    const provider = buildProvider();

    if (!provider) {
      const isReminderRequest = /提醒|喝水|运动|训练|定时|闹钟/.test(trimmed);
      if (isReminderRequest) {
        const created = reminderService.create(parseReminderFromText(trimmed));
        useReminderStore().refreshReminders();
        pushMessage("assistant", `已记下：${created.title}`);
      } else {
        pushMessage("assistant", "请先在设置中配置 LLM（右键 → 设置）。");
      }
      llmPhase.value = "idle";
      isResponding.value = false;
      return;
    }

    try {
      const settingsStore = useSettingsStore();
      const nowStr = new Date().toLocaleString("zh-CN");
      const systemPrompt = `${settingsStore.settings.systemPrompt}

当前时间：${nowStr}

如果用户想要创建提醒，请在回复末尾单独一行输出以下 JSON（不加代码块，必须单行）：
{"__action":"create_reminder","title":"提醒标题","type":"normal","scheduleKind":"once","triggerAt":"2024-01-15T14:30:00"}

scheduleKind 与必填字段：
- once（一次性）：triggerAt（ISO8601，如 2024-01-15T14:30:00）
- daily（每天）：time（如 14:30）
- interval（循环）：intervalMinutes（分钟数，如 60）
type 可选：normal / water / exercise`;

      const history: LLMChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...messages.value.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const streamMsg = createMessage("assistant", "");
      messages.value.push(streamMsg);
      const idx = messages.value.length - 1;
      let thinkingStarted = false;
      let contentStarted = false;
      let rawBuffer = "";
      let jsonDetected = false;
      let reminderCreated = false;
      abortController = new AbortController();

      const reply = await provider.chatStream(history, {
        onToken(token) {
          if (!contentStarted) {
            contentStarted = true;
            messages.value[idx].isThinking = false;
            llmPhase.value = "answering";
          }
          rawBuffer += token;
          if (!jsonDetected) {
            const actionStart = rawBuffer.indexOf('{"__action"');
            if (actionStart !== -1) {
              jsonDetected = true;
              messages.value[idx].content = rawBuffer.slice(0, actionStart).trimEnd();
            } else {
              messages.value[idx].content += token;
            }
          } else if (!reminderCreated) {
            const jsonStart = rawBuffer.indexOf('{"__action"');
            const candidate = rawBuffer.slice(jsonStart);
            const closingIdx = candidate.indexOf('}');
            if (closingIdx !== -1) {
              try {
                const action = JSON.parse(candidate.slice(0, closingIdx + 1));
                if (action.__action === "create_reminder") {
                  reminderCreated = true;
                  const created = buildAndCreateReminder(action);
                  const pre = messages.value[idx].content;
                  messages.value[idx].content = pre
                    ? `${pre}\n\n⏰ 已设置提醒：${created.title}`
                    : `⏰ 已设置提醒：${created.title}`;
                }
              } catch {}
            }
          }
        },
        onThinking(token) {
          if (!thinkingStarted) {
            thinkingStarted = true;
            messages.value[idx].isThinking = true;
            llmPhase.value = "thinking";
          }
          messages.value[idx].thinking = (messages.value[idx].thinking || "") + token;
        },
      }, abortController.signal);

      if (!reminderCreated) {
        const finalReply = reply || "（无回复）";
        const actionMatch = finalReply.match(/\{"__action"\s*:\s*"create_reminder"[^}]*\}/);
        if (actionMatch) {
          try {
            const action = JSON.parse(actionMatch[0]);
            const created = buildAndCreateReminder(action);
            const clean = finalReply.replace(actionMatch[0], "").replace(/\n{3,}/g, "\n\n").trim();
            messages.value[idx].content = clean || `⏰ 已设置提醒：${created.title}`;
          } catch {
            messages.value[idx].content = finalReply;
          }
        } else if (!messages.value[idx].content) {
          messages.value[idx].content = finalReply;
        }
      }

      messages.value[idx].isThinking = false;
      saveMessages(activeSessionId.value, messages.value);
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
      saveSessions(sessions.value);
    }
  }

  ensureSession();

  return {
    sessions, activeSessionId, messages, isResponding, llmPhase,
    sendMessage, stopResponse, createSession, switchSession, deleteSession, clearMessages,
  };
});
