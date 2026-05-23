import blessed from "neo-blessed";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { exec } from "node:child_process";
import { AppState } from "./status.js";
import { History } from "./history.js";
import { sessionManager } from "./sessions.js";
import type { CamoConfig } from "./config.js";
import {
  composerHint,
  confirmHint,
  displayWidth,
  ellipsize,
  error,
  formatEvent,
  statusLine,
  stripAnsi,
  stripTags,
  trustContent,
  welcomeContent,
  type ComposerState,
  type ConversationEvent,
} from "./renderer.js";
import { handleCommand, type CommandContext, getCustomSystemPrompt } from "./commands.js";
import { setSkillDB, skillService } from "../skill/skillService.js";
import { setCamoclawFS, syncSkillsFromDisk } from "../skill/fsSync.js";
import { matchSkill } from "../skill/matcher.js";
import { nodeDB } from "../storage/node.js";
import { AgentLoop } from "../agent/loop.js";
import { PermissionManager } from "../agent/permissions.js";
import { OpenAICompatibleProvider } from "../llm/openaiCompatible.js";
import { OllamaProvider } from "../llm/ollama.js";
import type { LLMProvider, ChatMessage } from "../llm/types.js";
import type { AgentCallbacks } from "../agent/loop.js";
import type { Widgets } from "blessed";

const SKILLS_DIR = join(homedir(), ".camoclaw", "skills");
const TRUSTED_WORKSPACES_PATH = join(homedir(), ".camoclaw", "trusted-workspaces.json");
const COMPOSER_HEIGHT = 5;
const PLACEHOLDER = 'Try "edit <filepath> to..."';

interface TuiRuntime {
  screen: Widgets.Screen;
  conversation: Widgets.BoxElement;
  composer: Widgets.BoxElement;
  input: Widgets.TextboxElement;
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
  scrollLocked: boolean;
  ctrlCPressed: boolean;
  renderQueued: boolean;
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
  const ctx: CommandContext = {
    state,
    history,
    config: initialConfig,
    permissions,
    refreshConfig() { Object.assign(this.config, initialConfig); },
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
    smartCSR: true,
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
    bottom: COMPOSER_HEIGHT,
    tags: false,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    padding: { left: 1, right: 1, top: 1, bottom: 1 },
    style: {
      fg: "white",
    },
  } as Widgets.BoxOptions);

  const composer = blessed.box({
    bottom: 0,
    left: 0,
    right: 0,
    height: COMPOSER_HEIGHT,
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

  const input = blessed.textbox({
    parent: composer,
    top: 1,
    left: 1,
    right: 1,
    height: 2,
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: {
      fg: "white",
      focus: { fg: "white" },
    },
  } as Widgets.TextboxOptions);

  const meta = blessed.box({
    parent: composer,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    tags: false,
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
    scrollLocked: false,
    ctrlCPressed: false,
    renderQueued: false,
  };
}

function bindInput(runtime: TuiRuntime, ctx: CommandContext) {
  runtime.input.on("submit", () => {
    if (runtime.composerState !== "input") return;
    const raw = runtime.input.getValue();
    runtime.input.clearValue();
    void handleLine(runtime, ctx, raw);
  });

  runtime.input.on("cancel", () => {
    runtime.input.clearValue();
    queueRender(runtime);
  });
}

function bindKeys(runtime: TuiRuntime, ctx: CommandContext) {
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
    if (runtime.composerState === "confirming") resolveConfirm(runtime, true);
  };
  const denyConfirm = () => {
    if (runtime.composerState === "confirming") resolveConfirm(runtime, false);
  };
  runtime.screen.key(["y", "Y", "1", "enter"], allowConfirm);
  runtime.input.key(["y", "Y", "1", "enter"], allowConfirm);
  runtime.screen.program.key(["y", "Y", "1", "enter"], allowConfirm);
  runtime.screen.key(["n", "N", "2", "escape"], denyConfirm);
  runtime.input.key(["n", "N", "2", "escape"], denyConfirm);
  runtime.screen.program.key(["n", "N", "2", "escape"], denyConfirm);

  runtime.conversation.on("wheelup", () => scrollConversation(runtime, -3));
  runtime.conversation.on("wheeldown", () => scrollConversation(runtime, 3));
  runtime.screen.on("resize", () => queueRender(runtime));
  runtime.screen.on("destroy", () => { runtime.currentAbort?.abort(); });

  runtime.screen.key(["C-z"], () => {
    appendSystem(runtime, "终端挂起在 fullscreen TUI 中不可用，使用 Ctrl+C 退出。");
    runtime.input.focus();
  });

  void ctx;
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

function scrollConversation(runtime: TuiRuntime, offset: number) {
  runtime.conversation.scroll(offset);
  runtime.scrollLocked = runtime.conversation.getScrollPerc() < 99;
  queueRender(runtime);
}

function closeRuntime(runtime: TuiRuntime, code: number) {
  runtime.currentAbort?.abort();
  runtime.screen.destroy();
  process.exit(code);
}

function render(runtime: TuiRuntime) {
  const content = runtime.events.map(formatEvent).join("\n\n");
  runtime.conversation.setContent(content);
  runtime.hint.setContent(runtime.composerState === "confirming"
    ? confirmHint(runtime.confirmMessage || "Y/Enter 允许 · N/Esc 拒绝")
    : composerHint(runtime.composerState, PLACEHOLDER));
  runtime.meta.setContent(metaLine(runtime));
  if (!runtime.scrollLocked) runtime.conversation.setScrollPerc(100);
  runtime.screen.render();
}

function queueRender(runtime: TuiRuntime) {
  if (runtime.renderQueued) return;
  runtime.renderQueued = true;
  setImmediate(() => {
    runtime.renderQueued = false;
    render(runtime);
  });
}

function metaLine(runtime: TuiRuntime): string {
  const width = Math.max(40, runtime.screen.cols || process.stdout.columns || 80);
  const model = runtime.state.model || "?";
  const skill = runtime.state.activeSkill || "通用助手";
  const left = `Context: ~${runtime.history.getTokenEstimate()} tokens`;
  const right = `${model} · ${skill} · ${runtime.state.mode}`;
  if (width < 72) return statusLine(model, "", runtime.state.mode, runtime.history.getTokenEstimate(), runtime.state.status);
  return `${left}${" ".repeat(Math.max(1, width - displayWidth(left) - displayWidth(right) - 4))}${right}`;
}

function appendEvent(runtime: TuiRuntime, event: ConversationEvent) {
  runtime.events.push(event);
  if (runtime.events.length > 500) runtime.events.splice(0, runtime.events.length - 500);
  if (event.type === "user") runtime.scrollLocked = false;
  queueRender(runtime);
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

  if (["/exit", "/quit"].includes(trimmed)) closeRuntime(runtime, 0);

  if (trimmed.startsWith("/")) {
    await handleCommand(trimmed, ctx);
    runtime.input.focus();
    queueRender(runtime);
    return;
  }

  appendEvent(runtime, { type: "user", content: trimmed });

  if (runtime.state.mode === "shell") {
    if (["exit", "/exit", "quit"].includes(trimmed)) closeRuntime(runtime, 0);
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

  if (runtime.state.mode === "chat") await runChat(runtime, provider, trimmed, ctx);
  else await runAgent(runtime, provider, trimmed, ctx, runtime.permissions);

  runtime.input.focus();
}

const NO_MD = "请用纯文本回复，不要使用 Markdown 格式。";
function baseSystemPrompt(custom?: string): string {
  return (custom || "你是 Camo，一个有用的 AI 助手。") + "\n" + NO_MD;
}

async function runChat(runtime: TuiRuntime, provider: LLMProvider, input: string, ctx: CommandContext) {
  ctx.history.push({ role: "user", content: input });
  runtime.state.setStatus("thinking");
  runtime.composerState = "busy";
  runtime.currentAbort = new AbortController();
  const assistantEvent: ConversationEvent = { type: "assistant", content: "" };
  appendEvent(runtime, { type: "thinking", content: "Camo is thinking..." });
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

async function runAgent(runtime: TuiRuntime, provider: LLMProvider, input: string, ctx: CommandContext, permissions: PermissionManager) {
  const history = ctx.history;
  const skills = skillService.list();
  const matched = matchSkill(input, skills);
  const skill = matched ?? skills.find(s => s.name === "general");
  if (matched) ctx.state.setSkill(matched.title);

  runtime.state.setStatus("thinking");
  runtime.composerState = "busy";
  runtime.currentAbort = new AbortController();
  const assistantEvent: ConversationEvent = { type: "assistant", content: "" };
  appendEvent(runtime, { type: "thinking", content: `Camo is thinking (${ctx.state.model} · ${skill?.title ?? "通用助手"})...` });
  appendEvent(runtime, assistantEvent);

  const callbacks: AgentCallbacks = {
    onToken: (token) => {
      assistantEvent.content += token;
      queueRender(runtime);
    },
    onToolCallStart: (tc) => {
      appendEvent(runtime, {
        type: "tool-start",
        title: tc.function.name,
        content: ellipsize(tc.function.arguments || "{}", 100),
      });
    },
    onToolCallResult: (_tc, result) => {
      appendEvent(runtime, { type: "tool-result", content: result });
    },
    async onToolConfirmRequest(name, args) {
      appendEvent(runtime, {
        type: "system",
        content: `工具 ${name} 请求执行：${ellipsize(JSON.stringify(args), 120)}`,
      });
      return requestConfirm(runtime, "Y/Enter 允许工具执行 · N/Esc 拒绝");
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
    history.push({ role: "assistant", content: assistantEvent.content || reply || "" });
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
  runtime.composerState = "busy";
  appendSystem(runtime, allowed ? "已允许工具执行" : "已拒绝工具执行");
  resolve(allowed);
}
