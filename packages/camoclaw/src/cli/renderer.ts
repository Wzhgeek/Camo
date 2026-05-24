import type { AppStatus } from "./status.js";

export const camoTheme = {
  primary: "#7f5af0",
  primarySoft: "#a78bfa",
  text: "#f4efff",
  muted: "#b9add0",
  border: "#7c3aed",
  danger: "#ef4444",
  warning: "#facc15",
  success: "#22c55e",
};

export type ConversationEventType =
  | "user"
  | "assistant"
  | "system"
  | "tool-start"
  | "tool-result"
  | "error"
  | "thinking";

export type ComposerState = "input" | "busy" | "confirming";

export interface ConversationEvent {
  type: ConversationEventType;
  content: string;
  title?: string;
  raw?: boolean;
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function stripTags(text: string): string {
  return stripAnsi(text).replace(/\{\/?[a-zA-Z0-9_,;#\-.! ]+\}/g, "");
}

export function charWidth(char: string): number {
  return /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(char) ? 2 : 1;
}

export function displayWidth(text: string): number {
  return Array.from(stripTags(text)).reduce((sum, char) => sum + charWidth(char), 0);
}

export function ellipsize(text: string, width: number): string {
  const plain = stripTags(text).replace(/\s+/g, " ").trim();
  if (displayWidth(plain) <= width) return plain;
  let out = "";
  let used = 0;
  for (const char of Array.from(plain)) {
    const next = used + charWidth(char);
    if (next > width - 3) break;
    out += char;
    used = next;
  }
  return `${out}...`;
}

export function camoPixelLogo(): string {
  return [
    "{magenta-fg}▛▀▜{/magenta-fg} {bold}{magenta-fg}CamoClaw{/magenta-fg}{/bold} {#8b949e-fg}terminal agent{/#8b949e-fg}",
  ].join("\n");
}

export function welcomeContent(model: string, skill: string, workspace = process.cwd()): string {
  return [
    camoPixelLogo(),
    "",
    `{#8b949e-fg}cwd{/#8b949e-fg}   ${workspace}`,
    `{#8b949e-fg}model{/#8b949e-fg} {cyan-fg}${model}{/cyan-fg}   {#8b949e-fg}skill{/#8b949e-fg} ${skill || "通用助手"}`,
    "",
    `{#8b949e-fg}Type{/} {cyan-fg}/mode{/cyan-fg} {#8b949e-fg}or{/} {cyan-fg}/model{/cyan-fg} {#8b949e-fg}to choose. Start typing to work.{/#8b949e-fg}`,
  ].join("\n");
}

export function trustContent(workspace = process.cwd()): string {
  return [
    camoPixelLogo(),
    "",
    "Accessing workspace:",
    workspace,
    "",
    "Quick safety check: Is this a project you created or one you trust?",
    "CamoClaw can read, edit, and execute files in this folder when tools are enabled.",
    "",
    "> 1. Yes, I trust this folder",
    "  2. No, exit",
  ].join("\n");
}

export function botPrefix(): string { return "✻ "; }
export function userPrefix(): string { return "› "; }

function compactJson(text: string, width = 96): string {
  try {
    const parsed = JSON.parse(text);
    return ellipsize(JSON.stringify(parsed), width);
  } catch {
    return ellipsize(text, width);
  }
}

export function toolStart(name: string, args = ""): string {
  const suffix = args ? ` {#8b949e-fg}${compactJson(args)}{/#8b949e-fg}` : "";
  return `{#8b949e-fg}╭─{/#8b949e-fg} {cyan-fg}${name}{/cyan-fg}${suffix}`;
}

export function toolResult(text: string): string {
  const plain = stripTags(text).trim();
  if (!plain) return `{#8b949e-fg}╰─{/#8b949e-fg} {green-fg}done{/green-fg} {#8b949e-fg}(无输出){/#8b949e-fg}`;
  const lines = plain.split("\n");
  const firstMeaningful = lines.find(line => line.trim() && !/^(STDOUT|STDERR):\s*$/.test(line.trim())) ?? lines[0];
  const suffix = lines.length > 1 ? ` {#8b949e-fg}+${lines.length - 1} lines{/#8b949e-fg}` : "";
  return `{#8b949e-fg}╰─{/#8b949e-fg} {green-fg}done{/green-fg} {#8b949e-fg}${ellipsize(firstMeaningful, 110)}{/#8b949e-fg}${suffix}`;
}

export function toolHiddenSummary(count: number, resultLines: number): string {
  const output = resultLines > 0 ? ` · ${resultLines} output lines` : "";
  return `{#8b949e-fg}╰─ ${count} tool ${count === 1 ? "call" : "calls"} collapsed${output} · Ctrl+O 展开{/#8b949e-fg}`;
}

export function statusLine(model: string, skill: string, mode: string, tokens: number, status: AppStatus): string {
  const dot = status === "thinking" ? "●" : status === "error" ? "●" : "●";
  return `${dot} ${model || "?"}  ·  ${skill || "通用助手"}  ·  ${mode}  ·  ~${tokens} tokens`;
}

export function composerHint(state: ComposerState, placeholder: string): string {
  if (state === "busy") return `✻ Camo is thinking...  Ctrl+C 取消`;
  if (state === "confirming") return `⚠ 确认执行工具？  Y/Enter 允许 · N/Esc 拒绝`;
  return `› ${placeholder}`;
}

export function confirmHint(message: string): string {
  return `⚠ ${message}`;
}

function padDisplay(text: string, width: number): string {
  const current = displayWidth(text);
  if (current >= width) return text;
  return text + " ".repeat(width - current);
}

function wrapDisplay(text: string, width: number): string[] {
  const clean = stripTags(text).replace(/`([^`]+)`/g, "$1");
  const words = clean.split(/(\s+)/);
  const lines: string[] = [];
  let line = "";
  for (const part of words) {
    if (!part) continue;
    if (displayWidth(line + part) <= width) {
      line += part;
      continue;
    }
    if (line.trim()) lines.push(line.trimEnd());
    line = "";
    for (const char of Array.from(part.trimStart())) {
      if (displayWidth(line + char) > width && line) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line.trim() || lines.length === 0) lines.push(line.trimEnd());
  return lines;
}

/** Render Markdown table to aligned text */
function renderTable(lines: string[]): string {
  const rows = lines.map(l => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim().replace(/`([^`]+)`/g, "$1")));
  const cols = rows[0].length;
  const widths = new Array(cols).fill(6);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], Math.min(42, displayWidth(row[i] || "")));
    }
  }
  const maxWidth = 118;
  const borderWidth = cols * 3 + 1;
  while (widths.reduce((a, b) => a + b, 0) + borderWidth > maxWidth) {
    let idx = 0;
    for (let i = 1; i < widths.length; i++) {
      if (widths[i] > widths[idx]) idx = i;
    }
    if (widths[idx] <= 12) break;
    widths[idx]--;
  }

  const border = (left: string, mid: string, right: string) =>
    `{#8b949e-fg}${left}${widths.map(w => "─".repeat(w + 2)).join(mid)}${right}{/#8b949e-fg}`;
  const renderRow = (row: string[], header = false): string[] => {
    const wrapped = widths.map((w, i) => wrapDisplay(row[i] || "", w));
    const height = Math.max(...wrapped.map(cell => cell.length));
    const out: string[] = [];
    for (let line = 0; line < height; line++) {
      const cells = widths.map((w, i) => {
        const content = padDisplay(wrapped[i][line] || "", w);
        return header ? `{bold}${content}{/bold}` : content;
      });
      out.push(`{#8b949e-fg}│{/#8b949e-fg} ${cells.join(" {#8b949e-fg}│{/#8b949e-fg} ")} {#8b949e-fg}│{/#8b949e-fg}`);
    }
    return out;
  };

  const out: string[] = [];
  out.push(border("┌", "┬", "┐"));
  out.push(...renderRow(rows[0], true));
  out.push(border("├", "┼", "┤"));
  for (let r = 1; r < rows.length; r++) {
    out.push(...renderRow(rows[r]));
  }
  out.push(border("└", "┴", "┘"));
  return out.join("\n");
}

/** Escape raw blessed tags to prevent injection */
function escapeTags(text: string): string {
  return text.replace(/\{/g, "\\{");
}

/** Convert Markdown to blessed tags (safe: escapes injection first) */
function renderMd(text: string): string {
  text = escapeTags(text);

  // Render tables via line-by-line state machine
  const lines = text.split("\n");
  const out: string[] = [];
  let tableBuf: string[] = [];
  let inTable = false;

  function flushTable() {
    if (tableBuf.length < 2) { for (const l of tableBuf) out.push(l); tableBuf = []; inTable = false; return; }
    const dataRows = tableBuf.filter(l => l.includes("|") && !/^\|[\s\-:|]+\|$/.test(l));
    if (dataRows.length > 0) out.push(renderTable(dataRows));
    else for (const l of tableBuf) out.push(l);
    tableBuf = [];
    inTable = false;
  }

  for (const line of lines) {
    const isTableLine = line.trim().startsWith("|") && line.trim().endsWith("|");
    if (isTableLine) {
      tableBuf.push(line);
      inTable = true;
    } else {
      if (inTable) flushTable();
      out.push(line);
    }
  }
  if (inTable) flushTable();
  text = out.join("\n");

  return text
    .replace(/\*\*(.+?)\*\*/g, "{bold}$1{/bold}")
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "{underline}$1{/underline}")
    .replace(/^### (.+)$/gm, "{bold}$1{/bold}")
    .replace(/^## (.+)$/gm, "{bold}$1{/bold}")
    .replace(/^# (.+)$/gm, "{bold}$1{/bold}")
    .replace(/`([^`\n]+)`/g, "{inverse}$1{/inverse}")
    .replace(/^\- (.+)$/gm, "  · $1")
    .replace(/^\d+\. (.+)$/gm, "  $&");
}

/** Model context window sizes */
export function getContextWindow(model: string): number {
  if (model.includes("claude")) return 200000;
  if (model.includes("gemini")) return 1000000;
  if (model.includes("gpt-4")) return 128000;
  if (model.includes("deepseek")) return 128000;
  return 128000; // default
}

function formatUserQuestion(content: string): string {
  const lines = stripTags(content).split("\n");
  const maxWidth = Math.min(72, Math.max(16, ...lines.map(displayWidth), displayWidth("You")));
  const top = `{magenta-fg}╭─ You ${"─".repeat(Math.max(0, maxWidth - 5))}╮{/magenta-fg}`;
  const body = lines.map(line => {
    const pad = " ".repeat(Math.max(0, maxWidth - displayWidth(line)));
    return `{magenta-fg}│{/magenta-fg} ${line}${pad} {magenta-fg}│{/magenta-fg}`;
  });
  const bottom = `{magenta-fg}╰${"─".repeat(maxWidth + 2)}╯{/magenta-fg}`;
  return [top, ...body, bottom].join("\n");
}

export function formatEvent(event: ConversationEvent): string {
  if (event.raw) return event.content;
  switch (event.type) {
    case "user":
      return formatUserQuestion(event.content);
    case "assistant":
      return `${botPrefix()}${renderMd(event.content)}`;
    case "thinking":
      return `{#8b949e-fg}${botPrefix()}${event.content}{/#8b949e-fg}`;
    case "tool-start":
      return `  ${toolStart(event.title || "tool", event.content)}`;
    case "tool-result":
      return `  ${toolResult(event.content)}`;
    case "error":
      return `✗ ${event.content}`;
    case "system":
    default:
      return `• ${event.content}`;
  }
}

export function info(msg: string): string { return msg; }
export function success(msg: string): string { return `✓ ${msg}`; }
export function warn(msg: string): string { return `⚠ ${msg}`; }
export function error(msg: string): string { return `✗ ${msg}`; }

// 上下文进度条
export function progressBar(used: number, max: number): string {
  if (!Number.isFinite(max) || max <= 0) max = 128000;
  if (!Number.isFinite(used) || used < 0) used = 0;
  const pct = Math.min(100, Math.round((used / max) * 100));
  const w = 8;
  const filled = Math.round((pct / 100) * w);
  const bar = "█".repeat(filled) + "░".repeat(w - filled);
  const color = pct < 50 ? "magenta" : pct < 80 ? "yellow" : "red";
  return `{${color}-fg}[${bar} ${pct}%]{/${color}-fg}`;
}
