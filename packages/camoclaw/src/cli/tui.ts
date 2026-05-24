import blessed from "neo-blessed";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { AppState, type AppMode } from "./status.js";
import { History } from "./history.js";
import { sessionManager } from "./sessions.js";
import { loadConfig, saveConfig, type CamoConfig } from "./config.js";
import {
  composerHint,
  confirmHint,
  displayWidth,
  ellipsize,
  error,
  formatEvent,
  getContextWindow,
  progressBar,
  statusLine,
  stripAnsi,
  stripTags,
  toolHiddenSummary,
  trustContent,
  welcomeContent,
  type ComposerState,
  type ConversationEvent,
} from "./renderer.js";
import { handleCommand, type CommandContext, getCustomSystemPrompt, getCommandNames, getRecentCommands } from "./commands.js";
import { allowCommand, extractCommandPrefix, loadAllowlist } from "./commandAllowlist.js";
import { setSkillDB, skillService } from "../skill/skillService.js";
import { setCamoclawFS, syncSkillsFromDisk } from "../skill/fsSync.js";
import { matchSkill } from "../skill/matcher.js";
import { nodeDB } from "../storage/node.js";
import { AgentLoop, ToolPermissionDeniedError } from "../agent/loop.js";
import { PermissionManager } from "../agent/permissions.js";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible.js";
import { OllamaProvider } from "../llm/ollama.js";
import type { LLMProvider, ChatMessage } from "../llm/types.js";
import type { AgentCallbacks } from "../agent/loop.js";
import type { Widgets } from "blessed";

const SKILLS_DIR = join(homedir(), ".camoclaw", "skills");
const TRUSTED_WORKSPACES_PATH = join(homedir(), ".camoclaw", "trusted-workspaces.json");
const MIN_COMPOSER_HEIGHT = 5;
const MAX_COMPOSER_HEIGHT = 12;
const INPUT_VERTICAL_CHROME = 3;
const PLACEHOLDERS = [
  'Try "edit src/main.ts to add logging"',
  'Try "review this repository"',
  'Try "explain how this module works"',
  'Try "find where reminders are scheduled"',
  'Try "write tests for the parser"',
  'Try "fix the TypeScript errors"',
  'Try "summarize recent git changes"',
  'Try "search for TODOs"',
  'Try "rename this function safely"',
  'Try "add a CLI command"',
  'Try "inspect package scripts"',
  'Try "trace this bug from the error"',
  'Try "make a small refactor plan"',
  'Try "compare these two files"',
  'Try "find unused exports"',
  'Try "update the README usage"',
  'Try "create a new skill"',
  'Try "list files changed today"',
  'Try "run the project checks"',
  'Try "open the config path"',
  'Try "generate release notes"',
  'Try "explain this stack trace"',
  'Try "convert this JSON schema"',
  'Try "find all calls to this API"',
  'Try "add input validation"',
  'Try "make this UI denser"',
  'Try "check mode behavior"',
  'Try "show current permissions"',
  'Try "install a skill by slug"',
  'Try "plan a safe migration"',
  'Try "debug why this command fails"',
  'Try "write a shell helper"',
  'Try "inspect memory usage"',
  'Try "clean up duplicate code"',
  'Try "document this workflow"',
  'Try "verify tool calling support"',
  'Try "switch to plan mode"',
  'Try "ask before every tool call"',
  'Try "read AGENTS.md"',
  'Try "find command completions"',
];
const EXIT_COMMANDS = ["exit", "/exit", "quit", "/quit"];
const CHAT_MODES: AppMode[] = ["chat", "plan"];
const AGENT_MODES: AppMode[] = ["agent", "ask"];
const MODE_ORDER: AppMode[] = ["plan", "agent", "ask"];
const MIN_RENDER_MS = 50;
const MODE_LABELS: Record<AppMode, string> = {
  plan: "计划模式",
  agent: "完全代理模式",
  ask: "询问模式",
  chat: "聊天模式",
  shell: "Shell 模式",
};

interface CommandSuggestion {
  name: string;
  description: string;
}

const COMMAND_SUGGESTIONS: CommandSuggestion[] = [
  { name: "help", description: "查看所有命令和快捷键" },
  { name: "mode", description: "切换 plan / agent / ask / chat / shell 模式" },
  { name: "model", description: "查看或切换当前模型" },
  { name: "config", description: "查看或修改 CLI 配置" },
  { name: "skills", description: "浏览、安装或删除 Skill" },
  { name: "skill", description: "手动切换 Skill 或恢复自动匹配" },
  { name: "system", description: "查看、设置或重置系统提示词" },
  { name: "permissions", description: "查看或设置工具权限规则" },
  { name: "status", description: "显示当前模型、模式、Skill 和 token 估算" },
  { name: "sessions", description: "列出保存的会话" },
  { name: "save", description: "保存当前会话标题" },
  { name: "clear", description: "清空当前对话" },
  { name: "undo", description: "撤销最近一轮对话" },
  { name: "reset", description: "重置会话和自定义系统提示词" },
  { name: "compact", description: "压缩上下文" },
  { name: "version", description: "显示 CamoClaw 版本" },
  { name: "exit", description: "退出 CamoClaw" },
  { name: "quit", description: "退出 CamoClaw" },
];

interface TuiRuntime {
  screen: Widgets.Screen;
  conversation: Widgets.BoxElement;
  composer: Widgets.BoxElement;
  input: Widgets.BoxElement & {
    getValue(): string;
    setValue(value: string): void;
    clearValue(): void;
  };
  hint: Widgets.BoxElement;
  meta: Widgets.BoxElement;
  state: AppState;
  history: History;
  composerState: ComposerState;
  events: ConversationEvent[];
  permissions: PermissionManager;
  currentAbort?: AbortController;
  confirmResolver?: (allowed: boolean) => void;
  confirmMessage?: string;
  confirmMode: ConfirmMode;
  scrollLocked: boolean;
  ctrlCPressed: boolean;
  lastEscTime: number;
  renderQueued: boolean;
  toolCallsExpanded: boolean;
  commandPopupOpen: boolean;
  commandPopup?: Widgets.BoxElement;
  commandMatches: CommandSuggestion[];
  commandSelected: number;
  placeholderIndex: number;
  placeholderTimer?: NodeJS.Timeout;
  pasteBlocks: Map<string, string>;
  pasteSeq: number;
  pasteGuardUntil: number;
  inputValue: string;
}

type ConfirmResult = "once" | "always" | "deny";
type ConfirmMode = "none" | "simple" | "tool";
type PlanDecision = "execute" | "revise" | "abandon";

const MODEL_OPTIONS: Record<string, string[]> = {
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
  claude: ["claude-sonnet-4-6", "claude-haiku-4-5"],
  ollama: ["qwen3:latest", "llama3.1:latest"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro"],
  kimi: ["moonshot-v1-8k", "moonshot-v1-32k"],
};

const MODE_CHOICES: Array<{ mode: AppMode; label: string; description: string }> = [
  { mode: "plan", label: "Plan", description: "只生成计划，确认后再执行" },
  { mode: "agent", label: "Agent", description: "允许 Camo 使用工具完成任务" },
  { mode: "ask", label: "Ask", description: "纯问答，不调用工具" },
  { mode: "chat", label: "Chat", description: "普通聊天，不调用工具" },
  { mode: "shell", label: "Shell", description: "直接执行输入的 shell 命令" },
];

/** Shared popup selector: arrow keys to pick, enter to confirm, esc to cancel */
function selectPopup<T>(
  runtime: TuiRuntime,
  items: T[],
  opts: {
    bottom?: number; left?: number; right?: number; height?: number;
    borderFg?: string;
    render: (item: T, selected: boolean) => string;
    onSelect: (item: T) => void;
    onCancel: () => void;
  },
) {
  let selected = 0;
  const N = items.length;
  const popup = blessed.box({
    parent: runtime.screen,
    bottom: opts.bottom ?? MIN_COMPOSER_HEIGHT + 1,
    left: opts.left ?? 2,
    right: opts.right ?? 2,
    height: opts.height ?? N + 2,
    border: "line",
    style: { border: { fg: opts.borderFg ?? "yellow" }, fg: "white" },
    tags: true,
  } as Widgets.BoxOptions);

  function draw() {
    popup.setContent(items.map((item, i) => opts.render(item, i === selected)).join("\n"));
    if (!runtime.scrollLocked) runtime.conversation.setScrollPerc(100);
    runtime.screen.render();
  }

  const handlers: Array<{ target: any; keys: string[]; fn: (...args: any[]) => void }> = [];
  function bind(target: any, key: string | string[], fn: (...args: any[]) => void) {
    const keys = Array.isArray(key) ? key : [key];
    handlers.push({ target, keys, fn });
    target.key(keys, fn);
  }

  for (const target of [runtime.screen, runtime.input, runtime.screen.program]) {
    bind(target, ["up"], () => { selected = selected > 0 ? selected - 1 : N - 1; draw(); });
    bind(target, ["down"], () => { selected = selected < N - 1 ? selected + 1 : 0; draw(); });
    bind(target, ["enter"], () => { cleanup(); opts.onSelect(items[selected]); });
    bind(target, ["escape"], () => { cleanup(); opts.onCancel(); });
  }

  function cleanup() {
    runtime.screen.remove(popup);
    for (const h of handlers) {
      for (const key of h.keys) h.target.unkey?.(key, h.fn);
    }
  }

  draw();
  runtime.input.focus();
}

export async function runTUI(initialConfig: CamoConfig) {
  const state = new AppState();
  state.setModel(initialConfig.model);

  setSkillDB(nodeDB);
  skillService.ensureBuiltins();
  setCamoclawFS({
    ensureDir: async () => { mkdirSync(SKILLS_DIR, { recursive: true }); return SKILLS_DIR; },
    listDirs: async () => {
      const { readdirSync } = await import("node:fs");
      try { return readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
      catch { return []; }
    },
    readFile: async (path: string) => { const { readFileSync } = await import("node:fs"); try { return readFileSync(path, "utf-8"); } catch { return ""; } },
    writeFile: async (path: string, content: string) => { const { mkdirSync, writeFileSync } = await import("node:fs"); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content, "utf-8"); },
    deleteDir: async (name: string) => { const { rmSync } = await import("node:fs"); rmSync(join(SKILLS_DIR, name), { recursive: true, force: true }); },
  });

  await syncSkillsFromDisk();
  const skills = skillService.list();
  const defaultSkill = skills.find(s => s.name === "general");

  const lastSession = sessionManager.getLast();
  const session = lastSession ?? sessionManager.create(state.model);
  const history = new History(session.id);
  const permissions = new PermissionManager(initialConfig.permissionPreset as "strict" | "normal" | "lax" || "normal");
  const runtime = createRuntime(state, history, permissions);
  startPlaceholderCarousel(runtime);
  const ctx: CommandContext = {
    state,
    history,
    config: initialConfig,
    permissions,
    refreshConfig() {
      const fresh = loadConfig();
      Object.assign(this.config, fresh);
      this.state.setModel(this.config.model);
    },
    refreshSkills() { skillService.ensureBuiltins(); },
    print(msg) { appendSystem(runtime, stripTags(stripAnsi(msg))); },
  };

  bindKeys(runtime, ctx);
  bindInput(runtime, ctx);

  if (!isWorkspaceTrusted(process.cwd())) {
    appendEvent(runtime, { type: "system", content: trustContent(process.cwd()), raw: true });
    const trusted = await requestConfirm(runtime, "Enter 确认信任 · N/Esc 退出");
    if (!trusted) closeRuntime(runtime, 0);
    trustWorkspace(process.cwd());
    runtime.events = [];
    runtime.composerState = "input";
    runtime.confirmMessage = undefined;
  }

  if (lastSession && sessionManager.countMessages(session.id) > 0) {
    appendSystem(runtime, `已恢复上次会话 (${history.length} 条消息)`);
  } else {
    appendEvent(runtime, {
      type: "system",
      content: welcomeContent(state.model, defaultSkill?.title ?? "通用助手", process.cwd()),
      raw: true,
    });
  }

  render(runtime);
  runtime.input.focus();
}

function createRuntime(state: AppState, history: History, permissions: PermissionManager): TuiRuntime {
  const screen = blessed.screen({
    smartCSR: false,
    fullUnicode: true,
    forceUnicode: true,
    autoPadding: true,
    title: "CamoClaw",
    dockBorders: true,
    mouse: true,
  } as Widgets.IScreenOptions & { mouse: boolean });

  const conversation = blessed.box({
    top: 0,
    left: 0,
    right: 0,
    bottom: MIN_COMPOSER_HEIGHT,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    padding: { left: 1, right: 1, top: 1, bottom: 1 },
    style: {
      fg: "white",
    },
  } as Widgets.BoxOptions);

  const composer = blessed.box({
    bottom: 0,
    left: 0,
    right: 0,
    height: MIN_COMPOSER_HEIGHT,
    border: "line",
    style: {
      fg: "white",
      border: { fg: "magenta" },
    },
  } as Widgets.BoxOptions);

  const hint = blessed.box({
    parent: composer,
    top: 0,
    left: 1,
    right: 1,
    height: 1,
    tags: false,
    style: { fg: "magenta" },
  } as Widgets.BoxOptions);

  const input = blessed.box({
    parent: composer,
    top: 1,
    left: 1,
    right: 1,
    height: 2,
    keys: true,
    mouse: true,
    tags: false,
    style: {
      fg: "white",
      focus: { fg: "white" },
    },
  } as Widgets.BoxOptions) as TuiRuntime["input"];
  input.getValue = () => (input as unknown as { value: string }).value || "";
  input.setValue = (value: string) => {
    (input as unknown as { value: string }).value = value;
    input.setContent(value);
  };
  input.clearValue = () => input.setValue("");
  input.setValue("");

  const meta = blessed.box({
    parent: composer,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    tags: true,
    style: { fg: "white" },
  } as Widgets.BoxOptions);

  screen.append(conversation);
  screen.append(composer);

  return {
    screen,
    conversation,
    composer,
    input,
    hint,
    meta,
    state,
    history,
    composerState: "input",
    events: [],
    permissions,
    confirmMode: "none",
    scrollLocked: false,
    ctrlCPressed: false,
    lastEscTime: 0,
    renderQueued: false,
    toolCallsExpanded: false,
    commandPopupOpen: false,
    commandMatches: [],
    commandSelected: 0,
    placeholderIndex: 0,
    pasteBlocks: new Map(),
    pasteSeq: 0,
    pasteGuardUntil: 0,
    inputValue: "",
  };
}

function bindInput(runtime: TuiRuntime, ctx: CommandContext) {
  runtime.input.on("submit", () => {
    submitComposer(runtime, ctx);
  });

  runtime.input.on("cancel", () => {
    setInputValue(runtime, "");
    hideCommandPopup(runtime);
    queueRender(runtime);
  });
}

function submitComposer(runtime: TuiRuntime, ctx: CommandContext) {
  if (runtime.commandPopupOpen || runtime.composerState !== "input") return;
  const raw = expandPasteBlocks(runtime, runtime.input.getValue()).replace(/\n$/, "");
  runtime.input.clearValue();
  runtime.inputValue = "";
  runtime.pasteBlocks.clear();
  updateComposerLayout(runtime);
  hideCommandPopup(runtime);
  // Defer to next tick so deferred renders from clearValue/updateComposerLayout
  // finish before the popup is created, avoiding render conflicts.
  setTimeout(() => handleLine(runtime, ctx, raw), 0);
}

function showToolConfirm(runtime: TuiRuntime, toolName: string, toolArgs?: Record<string, unknown>, allowAlways = true): Promise<ConfirmResult> {
  const cmdPrefix = toolArgs ? extractCommandPrefix(toolArgs) : "";
  const options: ConfirmResult[] = allowAlways ? ["once", "always", "deny"] : ["once", "deny"];
  const labels: Record<ConfirmResult, string> = {
    once: "Yes — 仅本次允许",
    always: cmdPrefix
      ? `Yes, always for "${cmdPrefix}" — 之后该命令前缀自动允许`
      : `Yes, always for "${toolName}" — 之后自动允许`,
    deny: "No — 拒绝并退出本次回答",
  };

  const prevState = runtime.composerState;
  const prevMsg = runtime.confirmMessage;
  const prevMode = runtime.confirmMode;
  runtime.composerState = "confirming";
  runtime.confirmMode = "tool";
  runtime.confirmMessage = "↑↓ 选择 · Enter 确认 · Esc 拒绝";
  queueRender(runtime);

  return new Promise((resolve) => {
    selectPopup(runtime, options, {
      height: 5,
      borderFg: "yellow",
      render: (v, sel) => (sel ? "> " : "  ") + labels[v],
      onSelect: (v) => {
        runtime.composerState = prevState;
        runtime.confirmMessage = prevMsg;
        runtime.confirmMode = prevMode;
        resolve(v);
      },
      onCancel: () => {
        runtime.composerState = prevState;
        runtime.confirmMessage = prevMsg;
        runtime.confirmMode = prevMode;
        resolve("deny");
      },
    });
  });
}

function showPlanDecision(runtime: TuiRuntime): Promise<PlanDecision> {
  const options: PlanDecision[] = ["execute", "revise", "abandon"];
  const labels: Record<PlanDecision, string> = {
    execute: "执行计划 — 切换到 agent，并临时同意全部工具命令",
    revise: "修改计划 — 回到输入框，告诉 Camo 怎么改",
    abandon: "放弃 — 不执行这个计划",
  };

  runtime.composerState = "confirming";
  runtime.confirmMode = "tool";
  runtime.confirmMessage = "选择下一步 · Enter 确认 · Esc 放弃";
  queueRender(runtime);

  return new Promise((resolve) => {
    selectPopup(runtime, options, {
      height: 5,
      borderFg: "cyan",
      render: (v, sel) => (sel ? "> " : "  ") + labels[v],
      onSelect: (v) => {
        runtime.composerState = "input";
        runtime.confirmMessage = undefined;
        runtime.confirmMode = "none";
        resolve(v);
      },
      onCancel: () => {
        runtime.composerState = "input";
        runtime.confirmMessage = undefined;
        runtime.confirmMode = "none";
        resolve("abandon");
      },
    });
  });
}

function chooseMode(runtime: TuiRuntime): Promise<AppMode | null> {
  runtime.composerState = "confirming";
  runtime.confirmMode = "tool";
  runtime.confirmMessage = "选择模式 · ↑↓ 移动 · Enter 确认 · Esc 取消";

  return new Promise((resolve) => {
    selectPopup(runtime, MODE_CHOICES, {
      height: MODE_CHOICES.length + 2,
      borderFg: "cyan",
      render: (item, selected) => {
        const mark = item.mode === runtime.state.mode ? "●" : " ";
        const cursor = selected ? "{cyan-fg}›{/cyan-fg}" : " ";
        return `${cursor} ${mark} {bold}${item.label.padEnd(6)}{/bold} {#8b949e-fg}${item.description}{/#8b949e-fg}`;
      },
      onSelect: (item) => {
        runtime.composerState = "input";
        runtime.confirmMode = "none";
        runtime.confirmMessage = undefined;
        resolve(item.mode);
      },
      onCancel: () => {
        runtime.composerState = "input";
        runtime.confirmMode = "none";
        runtime.confirmMessage = undefined;
        resolve(null);
      },
    });
  });
}

function chooseModel(runtime: TuiRuntime, ctx: CommandContext): Promise<string | null> {
  const providerModels = MODEL_OPTIONS[ctx.config.provider] ?? [];
  const models = Array.from(new Set([ctx.config.model, ...providerModels].filter(Boolean)));
  runtime.composerState = "confirming";
  runtime.confirmMode = "tool";
  runtime.confirmMessage = "选择模型 · ↑↓ 移动 · Enter 确认 · Esc 取消";

  return new Promise((resolve) => {
    selectPopup(runtime, models, {
      height: Math.min(models.length + 2, 10),
      borderFg: "cyan",
      render: (model, selected) => {
        const mark = model === ctx.config.model ? "●" : " ";
        const cursor = selected ? "{cyan-fg}›{/cyan-fg}" : " ";
        return `${cursor} ${mark} ${model}`;
      },
      onSelect: (model) => {
        runtime.composerState = "input";
        runtime.confirmMode = "none";
        runtime.confirmMessage = undefined;
        resolve(model);
      },
      onCancel: () => {
        runtime.composerState = "input";
        runtime.confirmMode = "none";
        runtime.confirmMessage = undefined;
        resolve(null);
      },
    });
  });
}

function bindKeys(runtime: TuiRuntime, ctx?: CommandContext) {
  runtime.screen.key(["C-c"], () => handleCtrlC(runtime));
  runtime.input.key(["C-c"], () => handleCtrlC(runtime));
  runtime.screen.program.key(["C-c"], () => handleCtrlC(runtime));

  runtime.screen.key(["C-l"], () => {
    runtime.scrollLocked = false;
    queueRender(runtime);
  });

  runtime.screen.key(["pageup", "C-u"], () => scrollConversation(runtime, -Math.max(3, Math.floor(runtime.screen.rows / 2))));
  runtime.screen.key(["pagedown", "C-d"], () => scrollConversation(runtime, Math.max(3, Math.floor(runtime.screen.rows / 2))));
  runtime.screen.key(["home"], () => { runtime.conversation.setScroll(0); runtime.scrollLocked = true; queueRender(runtime); });
  runtime.screen.key(["end"], () => { runtime.scrollLocked = false; queueRender(runtime); });

  const allowConfirm = () => {
    if (runtime.composerState === "confirming" && runtime.confirmMode === "simple") resolveConfirm(runtime, true);
  };
  const denyConfirm = () => {
    if (runtime.composerState === "confirming" && runtime.confirmMode === "simple") resolveConfirm(runtime, false);
  };
  runtime.screen.key(["y", "Y", "1", "enter"], allowConfirm);
  runtime.screen.program.key(["y", "Y", "1", "enter"], allowConfirm);
  runtime.screen.key(["n", "N", "2", "escape"], denyConfirm);
  runtime.screen.program.key(["n", "N", "2", "escape"], denyConfirm);

  runtime.conversation.on("wheelup", () => scrollConversation(runtime, -3));
  runtime.conversation.on("wheeldown", () => scrollConversation(runtime, 3));
  runtime.screen.on("resize", () => queueRender(runtime));
  runtime.screen.on("destroy", () => { runtime.currentAbort?.abort(); });

  runtime.screen.key(["C-z"], () => {
    appendSystem(runtime, "终端挂起在 fullscreen TUI 中不可用，使用 Ctrl+C 退出。");
    runtime.input.focus();
  });

  function cycleMode() {
    const idx = MODE_ORDER.indexOf(runtime.state.mode);
    const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    runtime.state.setMode(next);
    appendSystem(runtime, `已切换到 ${MODE_LABELS[next]}`);
    queueRender(runtime);
  }
  runtime.screen.key(["S-tab", "backtab"], cycleMode);
  runtime.screen.program.key(["S-tab", "backtab"], cycleMode);

  // Ctrl+O: toggle tool call expansion
  const toggleToolExpansion = () => {
    runtime.toolCallsExpanded = !runtime.toolCallsExpanded;
    queueRender(runtime);
  };
  runtime.screen.key(["C-o"], toggleToolExpansion);
  runtime.input.key(["C-o"], toggleToolExpansion);
  runtime.screen.program.key(["C-o"], toggleToolExpansion);

  runtime.screen.key(["escape"], () => handleEsc(runtime));
  runtime.input.key(["escape"], () => handleEsc(runtime));
  runtime.screen.program.key(["escape"], () => handleEsc(runtime));

  runtime.input.key(["up"], () => {
    if (!runtime.commandPopupOpen || runtime.commandMatches.length === 0) return;
    runtime.commandSelected = runtime.commandSelected > 0 ? runtime.commandSelected - 1 : runtime.commandMatches.length - 1;
    renderCommandPopup(runtime);
  });
  runtime.input.key(["down"], () => {
    if (!runtime.commandPopupOpen || runtime.commandMatches.length === 0) return;
    runtime.commandSelected = runtime.commandSelected < runtime.commandMatches.length - 1 ? runtime.commandSelected + 1 : 0;
    renderCommandPopup(runtime);
  });
  runtime.input.key(["tab"], () => {
    if (runtime.commandPopupOpen) {
      acceptCommandPopup(runtime);
      return;
    }
    updateCommandPopup(runtime);
  });

  installComposerInputBehavior(runtime, ctx);
}

function handleCtrlC(runtime: TuiRuntime) {
  if (runtime.composerState === "confirming") {
    resolveConfirm(runtime, false);
    return;
  }
  if (runtime.state.status === "thinking" && runtime.currentAbort) {
    runtime.currentAbort.abort();
    appendSystem(runtime, "已取消当前请求");
    runtime.state.setStatus("idle");
    runtime.composerState = "input";
    runtime.input.focus();
    queueRender(runtime);
    return;
  }
  if (runtime.ctrlCPressed) closeRuntime(runtime, 0);
  runtime.ctrlCPressed = true;
  appendSystem(runtime, "再按一次 Ctrl+C 退出");
  runtime.input.focus();
  setTimeout(() => { runtime.ctrlCPressed = false; }, 2000);
}

function handleEsc(runtime: TuiRuntime) {
  if (runtime.commandPopupOpen) {
    hideCommandPopup(runtime);
    queueRender(runtime);
    return;
  }
  if (runtime.composerState === "confirming") return;
  const now = Date.now();
  if (runtime.state.status === "thinking") {
    runtime.currentAbort?.abort();
    runtime.state.setStatus("idle");
    runtime.composerState = "input";
    appendSystem(runtime, "已取消当前请求");
    queueRender(runtime);
    return;
  }
  const val = runtime.input.getValue();
  if (val && now - runtime.lastEscTime < 500) {
    setInputValue(runtime, "");
    appendSystem(runtime, "已清空输入框");
  } else if (val) {
    appendSystem(runtime, "再按一次 Esc 清空输入框");
  }
  runtime.lastEscTime = now;
  queueRender(runtime);
}

function scrollConversation(runtime: TuiRuntime, offset: number) {
  runtime.conversation.scroll(offset);
  try { runtime.scrollLocked = runtime.conversation.getScrollPerc() < 95; }
  catch { runtime.scrollLocked = true; }
  queueRender(runtime);
}

function inputLines(runtime: TuiRuntime): number {
  const value = runtime.input.getValue() || "";
  const width = Math.max(20, Number(runtime.input.width) || Number(runtime.screen.cols) - 4);
  return value.split("\n").reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(displayWidth(line) / Math.max(1, width - 2)));
  }, 0);
}

function updateComposerLayout(runtime: TuiRuntime) {
  const wantedInputHeight = Math.min(MAX_COMPOSER_HEIGHT - INPUT_VERTICAL_CHROME, Math.max(2, inputLines(runtime)));
  const composerHeight = Math.min(MAX_COMPOSER_HEIGHT, Math.max(MIN_COMPOSER_HEIGHT, wantedInputHeight + INPUT_VERTICAL_CHROME));
  runtime.composer.height = composerHeight;
  runtime.conversation.bottom = composerHeight;
  runtime.input.height = Math.max(2, composerHeight - INPUT_VERTICAL_CHROME);
  if (runtime.commandPopupOpen) positionCommandPopup(runtime);
}

function commandSuggestionsFor(value: string): CommandSuggestion[] {
  if (!/^\/[^\s]*$/.test(value)) return [];
  const partial = value.slice(1).toLowerCase();
  const builtIns = COMMAND_SUGGESTIONS.filter(s => getCommandNames().includes(s.name));
  const known = new Set(builtIns.map(s => s.name));
  const userCommands = getCommandNames()
    .filter(name => !known.has(name))
    .map(name => ({ name, description: "自定义命令" }));
  const recent = getRecentCommands()
    .map(name => [...builtIns, ...userCommands].find(s => s.name === name) ?? { name, description: "最近使用" });
  const source = partial ? [...builtIns, ...userCommands] : [...recent, ...builtIns, ...userCommands];
  const seen = new Set<string>();
  return source
    .filter(item => item.name.toLowerCase().startsWith(partial))
    .filter(item => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .slice(0, 8);
}

function positionCommandPopup(runtime: TuiRuntime) {
  if (!runtime.commandPopup) return;
  const height = Math.max(3, Math.min(10, runtime.commandMatches.length + 2));
  runtime.commandPopup.height = height;
  runtime.commandPopup.bottom = (Number(runtime.composer.height) || MIN_COMPOSER_HEIGHT) + 1;
}

function renderCommandPopup(runtime: TuiRuntime) {
  if (!runtime.commandPopup) return;
  const content = runtime.commandMatches.map((item, idx) => {
    const active = idx === runtime.commandSelected;
    const prefix = active ? "{cyan-fg}›{/cyan-fg}" : " ";
    const name = active ? `{bold}/` + item.name + "{/bold}" : `/${item.name}`;
    return `${prefix} ${name.padEnd(18)} {#9ca3af-fg}${ellipsize(item.description, 88)}{/#9ca3af-fg}`;
  }).join("\n");
  runtime.commandPopup.setContent(content);
  runtime.screen.render();
}

function showCommandPopup(runtime: TuiRuntime, matches: CommandSuggestion[]) {
  runtime.commandMatches = matches;
  runtime.commandSelected = Math.min(runtime.commandSelected, Math.max(0, matches.length - 1));
  if (!runtime.commandPopup) {
    runtime.commandPopup = blessed.box({
      parent: runtime.screen,
      left: 0,
      right: 0,
      bottom: (Number(runtime.composer.height) || MIN_COMPOSER_HEIGHT) + 1,
      height: Math.min(10, matches.length + 2),
      tags: true,
      style: { fg: "white", bg: "default", border: { fg: "cyan" } },
      border: "line",
      padding: { left: 1, right: 1 },
    } as Widgets.BoxOptions);
  }
  runtime.commandPopupOpen = true;
  positionCommandPopup(runtime);
  renderCommandPopup(runtime);
}

function hideCommandPopup(runtime: TuiRuntime) {
  runtime.commandPopupOpen = false;
  runtime.commandMatches = [];
  runtime.commandSelected = 0;
  if (runtime.commandPopup) {
    runtime.screen.remove(runtime.commandPopup);
    runtime.commandPopup = undefined;
  }
}

function updateCommandPopup(runtime: TuiRuntime) {
  if (runtime.composerState !== "input") return;
  const matches = commandSuggestionsFor(runtime.input.getValue());
  if (matches.length === 0) {
    hideCommandPopup(runtime);
    return;
  }
  showCommandPopup(runtime, matches);
}

function acceptCommandPopup(runtime: TuiRuntime): boolean {
  if (!runtime.commandPopupOpen || runtime.commandMatches.length === 0) return false;
  const selected = runtime.commandMatches[runtime.commandSelected] ?? runtime.commandMatches[0];
  setInputValue(runtime, `/${selected.name} `);
  hideCommandPopup(runtime);
  updateComposerLayout(runtime);
  runtime.input.focus();
  queueRender(runtime);
  return true;
}

function expandPasteBlocks(runtime: TuiRuntime, value: string): string {
  let expanded = value;
  for (const [marker, text] of runtime.pasteBlocks) {
    expanded = expanded.split(marker).join(text);
  }
  return expanded;
}

function installComposerInputBehavior(runtime: TuiRuntime, ctx?: CommandContext) {
  runtime.screen.program.on("data", (data: Buffer | string) => {
    const text = data.toString();
    const bracketed = text.match(/\x1b\[200~([\s\S]*?)\x1b\[201~/);
    const shouldCompact = bracketed || text.includes("\n") || text.length > 24;
    if (shouldCompact && runtime.composerState === "input") {
      const pasted = bracketed ? bracketed[1] : text;
      runtime.pasteGuardUntil = Date.now() + 250;
      compactPastedText(runtime, pasted);
    }
  });

  runtime.screen.program.on("keypress", (ch: string, key: any) => {
    if (runtime.composerState !== "input") return;
    const inPaste = Date.now() < runtime.pasteGuardUntil;
    if (inPaste) return;

    if (runtime.commandPopupOpen && key?.name === "enter") {
      if (isExactSlashCommand(runtime.inputValue)) {
        hideCommandPopup(runtime);
        if (ctx) submitComposer(runtime, ctx);
      } else {
        acceptCommandPopup(runtime);
      }
      return;
    }

    if ((key?.name === "enter" || key?.name === "linefeed") && !key.shift && !inPaste) {
      if (ctx) submitComposer(runtime, ctx);
      return;
    }

    if ((key?.name === "enter" && key.shift) || key?.name === "linefeed") {
      appendInput(runtime, "\n");
      hideCommandPopup(runtime);
      return;
    }

    if (key?.name === "backspace") {
      removeLastInputChar(runtime);
      updateCommandPopup(runtime);
      return;
    }

    if (key?.name === "tab") {
      if (runtime.commandPopupOpen) acceptCommandPopup(runtime);
      else updateCommandPopup(runtime);
      return;
    }

    if (key?.name === "escape" || key?.ctrl || key?.meta) return;
    if (typeof ch === "string" && ch && !/^[\x00-\x08\x0b-\x1f\x7f]$/.test(ch)) {
      appendInput(runtime, ch);
      updateCommandPopup(runtime);
    }
  });
}

function isExactSlashCommand(value: string): boolean {
  const match = value.match(/^\/([^\s]+)$/);
  return !!match && getCommandNames().includes(match[1]);
}

function setInputValue(runtime: TuiRuntime, value: string) {
  runtime.inputValue = value;
  runtime.input.setValue(value);
  updateComposerLayout(runtime);
  queueRender(runtime);
}

function appendInput(runtime: TuiRuntime, text: string) {
  setInputValue(runtime, runtime.inputValue + text);
}

function removeLastInputChar(runtime: TuiRuntime) {
  const chars = Array.from(runtime.inputValue);
  chars.pop();
  setInputValue(runtime, chars.join(""));
}

function compactPastedText(runtime: TuiRuntime, pastedText: string) {
  pastedText = pastedText.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
  if (!pastedText) return;
  const lines = pastedText.split(/\r?\n/);
  const marker = `[Pasted text #${++runtime.pasteSeq} +${Math.max(0, lines.length - 1)} lines]`;
  runtime.pasteBlocks.set(marker, pastedText);
  setInputValue(runtime, runtime.inputValue + marker);
  hideCommandPopup(runtime);
}

function closeRuntime(runtime: TuiRuntime, code: number) {
  runtime.currentAbort?.abort();
  if (runtime.placeholderTimer) clearInterval(runtime.placeholderTimer);
  hideCommandPopup(runtime);
  runtime.screen.destroy();
  process.exit(code);
}

/** Collapse tool calls by default; Ctrl+O switches to raw tool details. */
function collapseToolCalls(events: ConversationEvent[], expanded: boolean): ConversationEvent[] {
  if (expanded) return events;
  const result: ConversationEvent[] = [];
  let toolGroup: ConversationEvent[] = [];

  function flushGroup() {
    if (toolGroup.length === 0) return;
    const tools = toolGroup.filter(e => e.type === "tool-start");
    const results = toolGroup.filter(e => e.type === "tool-result");
    const resultLines = results.reduce((sum, e) => sum + stripTags(e.content).split("\n").filter(Boolean).length, 0);
    if (tools.length > 0) {
      for (const tool of tools) result.push(tool);
      result.push({
        type: "system",
        content: toolHiddenSummary(tools.length, resultLines),
        raw: true,
      });
    } else {
      for (const e of toolGroup) result.push(e);
    }
    toolGroup = [];
  }

  for (const e of events) {
    if (e.type === "tool-start" || e.type === "tool-result") {
      toolGroup.push(e);
    } else {
      flushGroup();
      if (e.type !== "assistant" || e.content.trim()) result.push(e);
    }
  }
  flushGroup();
  return result;
}

function render(runtime: TuiRuntime) {
  const toRender = collapseToolCalls(runtime.events, runtime.toolCallsExpanded);
  const content = toRender.map(formatEvent).join("\n\n");
  runtime.conversation.setContent(content);
  const inputValue = runtime.input.getValue();
  const inputHint = inputValue.startsWith("!")
    ? "Shell 命令模式：Enter 执行，Shift+Enter 换行"
    : PLACEHOLDERS[runtime.placeholderIndex];
  runtime.hint.setContent(runtime.composerState === "confirming"
    ? confirmHint(runtime.confirmMessage || "Y/Enter 允许 · N/Esc 拒绝")
    : composerHint(runtime.composerState, inputHint));
  runtime.meta.setContent(metaLine(runtime));
  if (!runtime.scrollLocked) runtime.conversation.setScrollPerc(100);
  runtime.screen.render();
}

function appendEvent(runtime: TuiRuntime, event: ConversationEvent) {
  runtime.events.push(event);
  if (runtime.events.length > 500) runtime.events.splice(0, runtime.events.length - 500);
  if (event.type !== "assistant") runtime.scrollLocked = false;
  queueRender(runtime);
}

let lastRenderTime = 0;
function queueRender(runtime: TuiRuntime) {
  if (runtime.renderQueued) return;
  const elapsed = Date.now() - lastRenderTime;
  if (elapsed < MIN_RENDER_MS) {
    // Throttle: schedule after remaining interval
    runtime.renderQueued = true;
    setTimeout(() => { runtime.renderQueued = false; render(runtime); lastRenderTime = Date.now(); }, MIN_RENDER_MS - elapsed);
    return;
  }
  runtime.renderQueued = true;
  setImmediate(() => {
    runtime.renderQueued = false;
    lastRenderTime = Date.now();
    render(runtime);
  });
}

function startPlaceholderCarousel(runtime: TuiRuntime) {
  runtime.placeholderTimer = setInterval(() => {
    if (runtime.composerState !== "input") return;
    if (runtime.input.getValue()) return;
    runtime.placeholderIndex = (runtime.placeholderIndex + 1) % PLACEHOLDERS.length;
    queueRender(runtime);
  }, 4500);
}

function metaLine(runtime: TuiRuntime): string {
  const s = runtime.state;
  const tokens = runtime.history.getTokenEstimate();
  const maxTokens = getContextWindow(s.model);
  return `context ${progressBar(tokens, maxTokens)}  ${s.model}  ·  ${s.activeSkill || "通用助手"}  ·  ${MODE_LABELS[s.mode]}  ·  ~${tokens} tokens`;
}

function appendSystem(runtime: TuiRuntime, content: string) {
  appendEvent(runtime, { type: "system", content });
}

function loadTrustedWorkspaces(): string[] {
  try {
    if (!existsSync(TRUSTED_WORKSPACES_PATH)) return [];
    const parsed = JSON.parse(readFileSync(TRUSTED_WORKSPACES_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isWorkspaceTrusted(path: string): boolean {
  return loadTrustedWorkspaces().includes(path);
}

function trustWorkspace(path: string) {
  const trusted = new Set(loadTrustedWorkspaces());
  trusted.add(path);
  mkdirSync(dirname(TRUSTED_WORKSPACES_PATH), { recursive: true });
  writeFileSync(TRUSTED_WORKSPACES_PATH, JSON.stringify([...trusted].sort(), null, 2), "utf-8");
}

function buildProvider(ctx: CommandContext): LLMProvider | null {
  if (!ctx.config.apiKey && ctx.config.provider !== "ollama") return null;
  if (ctx.config.provider === "ollama") return new OllamaProvider(ctx.config.baseUrl, ctx.config.model);
  return new OpenAICompatibleProvider(ctx.config.baseUrl, ctx.config.apiKey, ctx.config.model);
}

async function shellExec(cmd: string): Promise<string> {
  return new Promise<string>((resolve) => {
    exec(cmd, { cwd: homedir(), timeout: 30000 }, (execError, stdout, stderr) => {
      const parts: string[] = [];
      if (stdout) parts.push(stdout.trim());
      if (stderr) parts.push(stderr.trim());
      if (!stdout && !stderr) parts.push(execError ? execError.message : "");
      resolve(parts.join("\n") || "(无输出)");
    });
  });
}

async function handleLine(runtime: TuiRuntime, ctx: CommandContext, line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    runtime.input.focus();
    queueRender(runtime);
    return;
  }

  runtime.ctrlCPressed = false;
  runtime.scrollLocked = false;

  if (EXIT_COMMANDS.includes(trimmed)) { closeRuntime(runtime, 0); return; }

  if (trimmed.startsWith("/")) {
    if (await handleInteractiveCommand(runtime, ctx, trimmed)) {
      runtime.input.focus();
      queueRender(runtime);
      return;
    }
    await handleCommand(trimmed, ctx);
    runtime.input.focus();
    queueRender(runtime);
    return;
  }

  appendEvent(runtime, { type: "user", content: trimmed });

  if (runtime.state.mode === "shell") {
    if (EXIT_COMMANDS.includes(trimmed)) { closeRuntime(runtime, 0); return; }
    appendSystem(runtime, await shellExec(trimmed));
    runtime.input.focus();
    return;
  }

  if (trimmed.startsWith("!")) {
    appendSystem(runtime, await shellExec(trimmed.slice(1).trim()));
    runtime.input.focus();
    return;
  }

  const provider = buildProvider(ctx);
  if (!provider) {
    appendEvent(runtime, { type: "error", content: stripTags(stripAnsi(error("未设置 API Key，运行 camoclaw init"))) });
    runtime.input.focus();
    return;
  }

  if (runtime.state.mode === "plan") {
    await runPlan(provider, trimmed, ctx, runtime);
  } else if (runtime.state.mode === "ask") {
    await runAsk(provider, trimmed, ctx, runtime);
  } else if (CHAT_MODES.includes(runtime.state.mode)) {
    await runChat(provider, trimmed, ctx, runtime);
  } else {
    await runAgent(provider, trimmed, ctx, runtime.permissions, runtime);
  }

  runtime.input.focus();
}

async function handleInteractiveCommand(runtime: TuiRuntime, ctx: CommandContext, trimmed: string): Promise<boolean> {
  const command = trimmed.slice(1).trim();
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const arg = parts.slice(1).join(" ").trim();
  if (cmd === "mode") {
    // Direct switch if valid mode name provided
    const directMode = MODE_CHOICES.find(c => c.mode === arg || c.label === arg);
    if (directMode) {
      runtime.state.setMode(directMode.mode);
      appendSystem(runtime, `已切换到 ${MODE_LABELS[directMode.mode]}`);
      return true;
    }
    // No arg or invalid: show popup
    const selected = await chooseMode(runtime);
    if (!selected) {
      appendSystem(runtime, "已取消模式切换");
      return true;
    }
    runtime.state.setMode(selected);
    appendSystem(runtime, `已切换到 ${MODE_LABELS[selected]}`);
    return true;
  }

  if (cmd === "model") {
    // "model list" → show available models as text
    if (arg === "list") {
      const providerModels = MODEL_OPTIONS[ctx.config.provider] ?? [];
      if (providerModels.length) {
        appendSystem(runtime, `${ctx.config.provider}: ${providerModels.join(" / ")}`);
      } else {
        appendSystem(runtime, "用法: /model <name>，或 /model 弹出选择窗");
      }
      return true;
    }
    // Direct switch if model name provided
    if (arg) {
      ctx.config.model = arg;
      saveConfig(ctx.config);
      ctx.state.setModel(arg);
      appendSystem(runtime, `模型已切换为 ${arg}`);
      return true;
    }
    // No arg: show popup
    const selected = await chooseModel(runtime, ctx);
    if (!selected) {
      appendSystem(runtime, "已取消模型切换");
      return true;
    }
    ctx.config.model = selected;
    saveConfig(ctx.config);
    ctx.state.setModel(selected);
    appendSystem(runtime, `模型已切换为 ${selected}`);
    return true;
  }

  return false;
}

const NO_MD = "请用纯文本回复，不要使用 Markdown 格式。";
const NO_EMOJI = "不要使用 emoji，除非用户明确要求。";
function baseSystemPrompt(custom?: string): string {
  return (custom || "你是 Camo，一个有用的 AI 助手。") + "\n" + NO_MD + "\n" + NO_EMOJI;
}

async function runChat(provider: LLMProvider, input: string, ctx: CommandContext, runtime: TuiRuntime) {
  ctx.state.setSkill("通用助手");
  ctx.history.push({ role: "user", content: input });
  runtime.state.setStatus("thinking");
  runtime.composerState = "busy";
  runtime.currentAbort = new AbortController();
  const assistantEvent: ConversationEvent = { type: "assistant", content: "" };
  appendEvent(runtime, assistantEvent);

  try {
    const reply = await provider.chatStream(
      [{ role: "system", content: baseSystemPrompt(getCustomSystemPrompt()) }, ...ctx.history.forLLM(20)],
      {
        onToken: (token) => {
          assistantEvent.content += token;
          queueRender(runtime);
        },
      },
      runtime.currentAbort.signal,
    );
    if (!assistantEvent.content) assistantEvent.content = reply;
    ctx.history.push({ role: "assistant", content: assistantEvent.content });
  } catch (e: unknown) {
    if (e instanceof ToolPermissionDeniedError) {
      appendEvent(runtime, { type: "system", content: "已拒绝工具执行，当前回答已中断" });
    } else if (!runtime.currentAbort.signal.aborted) {
      appendEvent(runtime, { type: "error", content: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    runtime.currentAbort = undefined;
    runtime.state.setStatus("idle");
    runtime.composerState = "input";
    queueRender(runtime);
  }
}

async function runAsk(provider: LLMProvider, input: string, ctx: CommandContext, runtime: TuiRuntime) {
  ctx.state.setSkill("问答助手");
  const askPrompt = [
    getCustomSystemPrompt() || "你是 Camo，一个有用的 AI 助手。",
    "当前是询问模式。直接回答用户问题，不要调用工具，不要声称读取、修改或执行了任何本地内容。",
  ].join("\n");
  ctx.history.push({ role: "user", content: input });
  runtime.state.setStatus("thinking");
  runtime.composerState = "busy";
  runtime.currentAbort = new AbortController();
  const assistantEvent: ConversationEvent = { type: "assistant", content: "" };
  appendEvent(runtime, assistantEvent);

  try {
    const reply = await provider.chatStream(
      [{ role: "system", content: baseSystemPrompt(askPrompt) }, ...ctx.history.forLLM(20)],
      {
        onToken: (token) => {
          assistantEvent.content += token;
          queueRender(runtime);
        },
      },
      runtime.currentAbort.signal,
    );
    if (!assistantEvent.content) assistantEvent.content = reply;
    ctx.history.push({ role: "assistant", content: assistantEvent.content });
  } catch (e: unknown) {
    if (!runtime.currentAbort.signal.aborted) {
      appendEvent(runtime, { type: "error", content: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    runtime.currentAbort = undefined;
    runtime.state.setStatus("idle");
    runtime.composerState = "input";
    queueRender(runtime);
  }
}

async function runPlan(provider: LLMProvider, input: string, ctx: CommandContext, runtime: TuiRuntime) {
  ctx.state.setSkill("计划助手");
  const previous = getCustomSystemPrompt();
  const planPrompt = [
    previous || "你是 Camo，一个谨慎的软件工程助手。",
    "当前是计划模式。只输出计划、风险、需要确认的点和建议步骤。",
    "不要调用工具，不要声称已经修改文件，不要执行实现。",
  ].join("\n");
  ctx.history.push({ role: "user", content: input });
  runtime.state.setStatus("thinking");
  runtime.composerState = "busy";
  runtime.currentAbort = new AbortController();
  const assistantEvent: ConversationEvent = { type: "assistant", content: "" };
  appendEvent(runtime, assistantEvent);
  let planText = "";

  try {
    const reply = await provider.chatStream(
      [{ role: "system", content: baseSystemPrompt(planPrompt) }, ...ctx.history.forLLM(20)],
      {
        onToken: (token) => {
          assistantEvent.content += token;
          queueRender(runtime);
        },
      },
      runtime.currentAbort.signal,
    );
    if (!assistantEvent.content) assistantEvent.content = reply;
    planText = assistantEvent.content;
    ctx.history.push({ role: "assistant", content: assistantEvent.content });
  } catch (e: unknown) {
    if (!runtime.currentAbort.signal.aborted) {
      appendEvent(runtime, { type: "error", content: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    runtime.currentAbort = undefined;
    runtime.state.setStatus("idle");
    runtime.composerState = "input";
    queueRender(runtime);
  }

  if (planText && !runtime.currentAbort) {
    appendEvent(runtime, {
      type: "system",
      content: "计划已生成。请选择：执行计划、修改计划，或放弃。",
    });
    const decision = await showPlanDecision(runtime);
    if (decision === "execute") {
      runtime.state.setMode("agent");
      appendSystem(runtime, "已切换到完全代理模式，并临时同意本次执行中的全部工具命令。");
      await runAgent(
        provider,
        `请执行刚才的计划。\n\n用户原始需求:\n${input}\n\n计划:\n${planText}`,
        ctx,
        new PermissionManager("lax"),
        runtime,
      );
    } else if (decision === "revise") {
      appendSystem(runtime, "请直接输入你希望 Camo 如何修改这个计划。");
      runtime.input.focus();
    } else {
      appendSystem(runtime, "已放弃执行这个计划。");
      runtime.input.focus();
    }
  }
}

async function runAgent(provider: LLMProvider, input: string, ctx: CommandContext, permissions: PermissionManager, runtime: TuiRuntime) {
  const history = ctx.history;
  const skills = skillService.list();
  const matched = matchSkill(input, skills);
  const skill = matched ?? skills.find(s => s.name === "general");
  if (matched) ctx.state.setSkill(matched.title);

  runtime.state.setStatus("thinking");
  runtime.composerState = "busy";
  runtime.currentAbort = new AbortController();
  let assistantEvent: ConversationEvent | null = null;
  let assistantContent = "";

  function ensureAssistantEvent(): ConversationEvent {
    if (!assistantEvent) {
      assistantEvent = { type: "assistant", content: "" };
      appendEvent(runtime, assistantEvent);
    }
    return assistantEvent;
  }

  const callbacks: AgentCallbacks = {
    onToken: (token) => {
      assistantContent += token;
      ensureAssistantEvent().content += token;
      queueRender(runtime);
    },
    onToolCallStart: (tc) => {
      appendEvent(runtime, {
        type: "tool-start",
        title: tc.function.name,
        content: ellipsize(tc.function.arguments || "{}", 100),
      });
      assistantEvent = null;
    },
    onToolCallResult: (_tc, result) => {
      appendEvent(runtime, { type: "tool-result", content: result });
    },
    async onToolConfirmRequest(name, args) {
      const cmdPrefix = extractCommandPrefix(args);
      const forceAsk = runtime.state.mode === "ask";
      // Load allowlist once, check and conditionally write with the same Set
      const allowlist = cmdPrefix ? loadAllowlist(process.cwd()) : null;
      if (!forceAsk && allowlist && allowlist.has(cmdPrefix)) {
        appendEvent(runtime, { type: "system", content: `命令前缀 "${cmdPrefix}" 已信任，自动允许` });
        return true;
      }
      appendEvent(runtime, {
        type: "system",
        content: `工具 ${name} 请求执行：${ellipsize(JSON.stringify(args), 120)}`,
      });
      const result = await showToolConfirm(runtime, name, args, !forceAsk);
      if (result === "deny") return false;
      if (result === "always") {
        if (cmdPrefix && allowlist) {
          allowCommand(process.cwd(), cmdPrefix, allowlist);
          appendEvent(runtime, { type: "system", content: `已记住: "${cmdPrefix}" 命令之后自动允许` });
        } else {
          runtime.permissions.addRule(name + "*", "allow");
        }
      }
      return true;
    },
  };

  const systemPrompt = [
    baseSystemPrompt(getCustomSystemPrompt() || skill?.prompt),
    skill ? `当前 Skill: ${skill.title}` : "",
  ].filter(Boolean).join("\n");

  const loop = new AgentLoop(provider, permissions, callbacks);
  const llmHistory: ChatMessage[] = history.forLLM(20).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  try {
    const reply = await loop.run(input, { systemPrompt, history: llmHistory, tools: skill?.tools }, runtime.currentAbort.signal);
    history.push({ role: "user", content: input });
    history.push({ role: "assistant", content: assistantContent || reply || "" });
  } catch (e: unknown) {
    if (!runtime.currentAbort.signal.aborted) {
      appendEvent(runtime, { type: "error", content: e instanceof Error ? e.message : String(e) });
    }
  } finally {
    runtime.currentAbort = undefined;
    runtime.state.setStatus("idle");
    runtime.composerState = "input";
    queueRender(runtime);
  }
}

function requestConfirm(runtime: TuiRuntime, message = "Y/Enter 允许 · N/Esc 拒绝"): Promise<boolean> {
  runtime.composerState = "confirming";
  runtime.confirmMode = "simple";
  runtime.confirmMessage = message;
  queueRender(runtime);
  return new Promise((resolve) => {
    runtime.confirmResolver = resolve;
  });
}

function resolveConfirm(runtime: TuiRuntime, allowed: boolean) {
  if (!runtime.confirmResolver) return;
  const resolve = runtime.confirmResolver;
  runtime.confirmResolver = undefined;
  runtime.confirmMessage = undefined;
  runtime.confirmMode = "none";
  runtime.composerState = "busy";
  appendSystem(runtime, allowed ? "已允许工具执行" : "已拒绝工具执行");
  resolve(allowed);
}
