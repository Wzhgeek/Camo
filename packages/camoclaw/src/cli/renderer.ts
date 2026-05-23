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
    "     .######.     ",
    "   .##########.   ",
    "  ###  ##  ###   ",
    "  ############   ",
    "    '##  ##'     ",
  ].join("\n");
}

export function welcomeContent(model: string, skill: string, workspace = process.cwd()): string {
  return [
    camoPixelLogo(),
    "",
    "CamoClaw terminal agent",
    "Welcome back! 固定输入区已就绪。",
    `model ${model}  skill ${skill}`,
    `workspace ${workspace}`,
    "输入 /help 查看命令，输入自然语言开始工作。",
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

export function toolStart(name: string): string {
  return `⎿ ${name} `;
}

export function toolResult(text: string): string {
  const short = text.length > 240 ? text.slice(0, 237) + "..." : text;
  return short.split("\n")[0] || "(无输出)";
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

/** Render Markdown table to aligned text */
function renderTable(lines: string[]): string {
  const rows = lines.map(l => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim()));
  const cols = rows[0].length;
  const widths = new Array(cols).fill(3);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], stripTags(row[i] || "").length);
    }
  }
  const out: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].map((c, i) => (c || "").padEnd(widths[i]));
    const line = "│ " + cells.join(" │ ") + " │";
    if (r === 0) {
      out.push(`{bold}${line}{/bold}`);
      out.push("{#555-fg}" + "├" + widths.map(w => "─".repeat(w + 2)).join("┼") + "┤{/#555-fg}");
    } else {
      out.push(line);
    }
  }
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

export function formatEvent(event: ConversationEvent): string {
  switch (event.type) {
    case "user":
      return `{magenta-fg}▸{/magenta-fg} ${event.content}\n  {magenta-fg}${"─".repeat(32)}{/magenta-fg}`;
    case "assistant":
      return `${botPrefix()}${renderMd(event.content)}`;
    case "thinking":
      return `${botPrefix()}${event.content}`;
    case "tool-start":
      return `  ${toolStart(event.title || "tool")}${event.content}`;
    case "tool-result":
      return `     ${toolResult(event.content)}`;
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
  const pct = Math.min(100, Math.round((used / max) * 100));
  const w = 8;
  const filled = Math.round((pct / 100) * w);
  const bar = "█".repeat(filled) + "░".repeat(w - filled);
  const color = pct < 50 ? "magenta" : pct < 80 ? "yellow" : "red";
  return `{${color}-fg}[${bar} ${pct}%]{/${color}-fg}`;
}
