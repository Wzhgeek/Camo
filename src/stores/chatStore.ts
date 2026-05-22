import { defineStore } from "pinia";
import { ref } from "vue";
import { useSettingsStore } from "./settingsStore";
import { OpenAICompatibleProvider } from "../core/llm/openaiCompatible";
import { OllamaProvider } from "../core/llm/ollama";
import type { LLMProvider, ChatMessage as LLMChatMessage, Tool } from "../core/llm/types";
import { parseReminderFromText } from "../core/reminder/parser";
import { reminderService } from "../core/reminder/reminderService";
import type { ReminderInput, ReminderType, ScheduleKind } from "../core/reminder/types";
import { useReminderStore } from "./reminderStore";
import { useAffectionStore } from "./affectionStore";
import type { StickyNoteConfig } from "./settingsStore";

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

const TOOL_CREATE_REMINDER = "create_reminder";
const TOOL_CREATE_NOTE = "create_note";
const TOOL_START_FOCUS = "start_focus";

const CAMO_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: TOOL_CREATE_REMINDER,
      description: "创建提醒。提醒有触发时间，到点会弹出通知。用于：定时提醒、X分钟后提醒、每天X点提醒、喝水提醒、运动提醒。不要用于纯文字记录/便签/备忘。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "提醒标题" },
          type: { type: "string", enum: ["normal", "water", "exercise"], description: "提醒类型" },
          scheduleKind: { type: "string", enum: ["once", "daily", "interval"], description: "once=一次性, daily=每天, interval=循环间隔" },
          triggerAt: { type: "string", description: "一次性提醒的ISO8601时间，如 2024-01-15T14:30:00" },
          time: { type: "string", description: "每天提醒的时间点，如 14:30" },
          intervalMinutes: { type: "number", description: "循环提醒的间隔分钟数" },
        },
        required: ["title", "scheduleKind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_CREATE_NOTE,
      description: "创建桌面便签。便签是始终显示在桌面的静态文字，没有提醒/时间属性。用于：写便签、记便签、记一段文字、备忘一段话。不要用于带时间要求的提醒。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "便签内容" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: TOOL_START_FOCUS,
      description: "开始专注模式（番茄钟），启动倒计时。用于：开始专注、番茄钟、专注XX分钟、我要专注等。",
      parameters: {
        type: "object",
        properties: {
          duration: { type: "number", description: "专注分钟数，不填则使用默认设置" },
        },
      },
    },
  },
];

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

  function buildAndCreateNote(action: any) {
    const settingsStore = useSettingsStore();
    const note: StickyNoteConfig = {
      id: crypto.randomUUID(),
      text: action.text || "便签",
      enabled: true,
    };
    settingsStore.settings.stickyNotes.push(note);
    try {
      // 直接传完整数据，不依赖跨窗口 settings sync 时序
      localStorage.setItem("camo:command", JSON.stringify({
        cmd: "create-note",
        note: { id: note.id, text: note.text, enabled: true },
        t: Date.now(),
      }));
    } catch {}
    return note;
  }

  function triggerStartFocus(action: any) {
    const settingsStore = useSettingsStore();
    const duration = Number(action.duration) || settingsStore.settings.focusDuration || 25;
    if (action.duration) {
      settingsStore.settings.focusDuration = duration;
    }
    try {
      // 直接传 duration，不依赖跨窗口 settings sync 时序
      localStorage.setItem("camo:command", JSON.stringify({
        cmd: "start-focus",
        duration,
        t: Date.now(),
      }));
    } catch {}
  }

  function executeToolCall(tc: { function: { name: string; arguments: string } }, msgIdx: number, textOverride?: string) {
    try {
      const args = JSON.parse(tc.function.arguments || "{}");
      const pre = textOverride ?? messages.value[msgIdx].content;
      if (tc.function.name === TOOL_CREATE_REMINDER) {
        const created = buildAndCreateReminder(args);
        messages.value[msgIdx].content = pre
          ? `${pre}\n\n⏰ 已设置提醒：${created.title}`
          : `⏰ 已设置提醒：${created.title}`;
      } else if (tc.function.name === TOOL_CREATE_NOTE) {
        const note = buildAndCreateNote(args);
        messages.value[msgIdx].content = pre
          ? `${pre}\n\n📝 已添加便签：${note.text.slice(0, 20)}`
          : `📝 已添加便签：${note.text.slice(0, 20)}`;
      } else if (tc.function.name === TOOL_START_FOCUS) {
        triggerStartFocus(args);
        const mins = args.duration || useSettingsStore().settings.focusDuration;
        messages.value[msgIdx].content = pre
          ? `${pre}\n\n🎯 已开始 ${mins} 分钟专注模式`
          : `🎯 已开始 ${mins} 分钟专注模式`;
      }
    } catch (e) {
      console.warn("[executeToolCall] failed", e);
    }
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
      const affectionStore = useAffectionStore();
      const nowStr = new Date().toLocaleString("zh-CN");
      const isOllama = settingsStore.settings.llm.provider === "ollama";

      // Ollama doesn't support tool calling → embed JSON protocol in system prompt
      const ollamaProtocol = isOllama ? `

如果用户想要执行操作，请在回复末尾单独一行输出 JSON（不加代码块，必须单行）：

1. 创建提醒：
{"__action":"create_reminder","title":"提醒标题","type":"normal","scheduleKind":"once","triggerAt":"2024-01-15T14:30:00"}
scheduleKind: once/daily/interval, type: normal/water/exercise

2. 写便签：
{"__action":"create_note","text":"便签内容"}

3. 开始专注：
{"__action":"start_focus","duration":25}` : "";

      const systemPrompt = `${affectionStore.context}\n\n${settingsStore.settings.systemPrompt}\n\n当前时间：${nowStr}${ollamaProtocol}`;

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
      let actionHandled = false;
      abortController = new AbortController();

      // Ollama text-parsing state
      let rawBuffer = "";
      let jsonDetected = false;

      const reply = await provider.chatStream(history, {
        onToken(token) {
          if (!contentStarted) {
            contentStarted = true;
            messages.value[idx].isThinking = false;
            llmPhase.value = "answering";
          }
          if (isOllama) {
            rawBuffer += token;
            if (!jsonDetected) {
              const actionStart = rawBuffer.indexOf('{"__action"');
              if (actionStart !== -1) {
                jsonDetected = true;
                messages.value[idx].content = rawBuffer.slice(0, actionStart).trimEnd();
              } else {
                messages.value[idx].content += token;
              }
            } else if (!actionHandled) {
              const jsonStart = rawBuffer.indexOf('{"__action"');
              const candidate = rawBuffer.slice(jsonStart);
              const closingIdx = candidate.indexOf('}');
              if (closingIdx !== -1) {
                try {
                  const action = JSON.parse(candidate.slice(0, closingIdx + 1));
                  if (action.__action) {
                    actionHandled = true;
                    executeToolCall({ function: { name: action.__action, arguments: JSON.stringify(action) } }, idx);
                  }
                } catch {}
              }
            }
          } else {
            messages.value[idx].content += token;
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
        onToolCalls(toolCalls) {
          actionHandled = true;
          for (const tc of toolCalls) executeToolCall(tc, idx);
        },
      }, abortController.signal, isOllama ? undefined : CAMO_TOOLS);

      // Fallback: Ollama may not stream JSON properly — check full reply
      if (!actionHandled && isOllama) {
        const finalReply = reply || "（无回复）";
        const actionMatch = finalReply.match(/\{"__action"\s*:\s*"(create_reminder|create_note|start_focus)"[^}]*\}/);
        if (actionMatch) {
          try {
            const action = JSON.parse(actionMatch[0]);
            const clean = finalReply.replace(actionMatch[0], "").replace(/\n{3,}/g, "\n\n").trim();
            actionHandled = true;
            executeToolCall({ function: { name: action.__action, arguments: JSON.stringify(action) } }, idx, clean || undefined);
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
      affectionStore.adjust("user_message", 1);
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
