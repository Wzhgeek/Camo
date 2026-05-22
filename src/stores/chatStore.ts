import { defineStore } from "pinia";
import { ref } from "vue";
import { useSettingsStore } from "./settingsStore";
import { OpenAICompatibleProvider } from "../core/llm/openaiCompatible";
import { OllamaProvider } from "../core/llm/ollama";
import type { LLMProvider, ChatMessage as LLMChatMessage } from "../core/llm/types";
import { parseReminderFromText } from "../core/reminder/parser";
import { reminderService } from "../core/reminder/reminderService";
import { useReminderStore } from "./reminderStore";
import { useAffectionStore } from "./affectionStore";
import { useSkillStore } from "./skillStore";
import { AgentLoop } from "../core/agent/loop";
import { PermissionManager } from "../core/agent/permissions";
import type { AgentCallbacks } from "../core/agent/loop";
import { toolRegistry } from "../core/tools/registry";
import type { ToolCall } from "../core/llm/types";

// Ensure all tools are registered
import "../core/tools/definitions/app";
import "../core/tools/definitions/file";
import "../core/tools/definitions/skill";
import "../core/tools/definitions/shell";
import "../core/tools/definitions/clipboard";
import "../core/tools/definitions/screen";
import "../core/tools/definitions/input";

export type ChatRole = "user" | "assistant";
export type LLMPhase = "idle" | "thinking" | "answering" | "done";

export interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error" | "awaiting_confirm";
  confirmResolver?: (allowed: boolean) => void;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  thinking?: string;
  isThinking?: boolean;
  toolCalls?: ToolCallDisplay[];
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

let globalPermissions = new PermissionManager();

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
      const skillStore = useSkillStore();
      const nowStr = new Date().toLocaleString("zh-CN");

      // Match skill from user message
      const skill = skillStore.matchAndSetActive(trimmed);
      const skillContext = skill
        ? `\n\n当前激活的 Skill：${skill.title}\nSkill 说明：${skill.description}\n${skill.prompt}`
        : "";

      const systemPrompt = `${affectionStore.context}\n\n${settingsStore.settings.systemPrompt}${skillContext}\n\n当前时间：${nowStr}`;

      const history: LLMChatMessage[] = messages.value
        .slice(-20)
        .filter(m => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Get tools for the matched skill
      const skillTools = skill ? skill.tools : toolRegistry.listNames();

      const streamMsg = createMessage("assistant", "");
      messages.value.push(streamMsg);
      const idx = messages.value.length - 1;
      let thinkingStarted = false;
      let contentStarted = false;
      abortController = new AbortController();

      const callbacks: AgentCallbacks = {
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
            messages.value[idx].isThinking = true;
            llmPhase.value = "thinking";
          }
          messages.value[idx].thinking = (messages.value[idx].thinking || "") + token;
        },
        onToolCallStart(tc: ToolCall) {
          const display: ToolCallDisplay = {
            id: tc.id,
            name: tc.function.name,
            arguments: (() => { try { return JSON.parse(tc.function.arguments || "{}"); } catch { return {}; } })(),
            status: "running",
          };
          if (!messages.value[idx].toolCalls) messages.value[idx].toolCalls = [];
          messages.value[idx].toolCalls.push(display);
          saveMessages(activeSessionId.value, messages.value);
        },
        onToolCallResult(tc: ToolCall, result: string) {
          const tcs = messages.value[idx].toolCalls;
          if (tcs) {
            const display = tcs.find(d => d.id === tc.id);
            if (display) {
              display.result = result;
              display.status = result.startsWith("Error") ? "error" : "done";
            }
          }
          saveMessages(activeSessionId.value, messages.value);
        },
        onReasoningContent(_token: string) {
          // DeepSeek reasoning_content is handled internally by AgentLoop
          // No UI display needed
        },
        async onToolConfirmRequest(toolName: string, args: Record<string, unknown>): Promise<boolean> {
          const display: ToolCallDisplay = {
            id: `confirm_${Date.now()}`,
            name: toolName,
            arguments: args,
            status: "awaiting_confirm",
          };
          if (!messages.value[idx].toolCalls) messages.value[idx].toolCalls = [];
          messages.value[idx].toolCalls.push(display);
          saveMessages(activeSessionId.value, messages.value);
          return new Promise((resolve) => {
            display.confirmResolver = resolve;
          });
        },
      };

      const agent = new AgentLoop(provider, globalPermissions, callbacks);
      await agent.run(trimmed, {
        systemPrompt,
        history,
        tools: skillTools,
      }, abortController.signal);

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

  /** Resolve a pending tool confirmation from the UI */
  function resolveToolConfirm(toolCallId: string, allowed: boolean) {
    const last = messages.value[messages.value.length - 1];
    if (last?.toolCalls) {
      const tc = last.toolCalls.find(t => t.id === toolCallId);
      if (tc?.confirmResolver) {
        tc.status = allowed ? "running" : "error";
        tc.result = allowed ? undefined : "用户拒绝执行";
        tc.confirmResolver(allowed);
        delete tc.confirmResolver;
        saveMessages(activeSessionId.value, messages.value);
      }
    }
  }

  ensureSession();

  return {
    sessions, activeSessionId, messages, isResponding, llmPhase,
    sendMessage, stopResponse, createSession, switchSession, deleteSession, clearMessages,
    resolveToolConfirm,
  };
});
