export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  pattern: string;
  action: PermissionAction;
}

export class PermissionManager {
  private rules: PermissionRule[] = [];

  constructor(preset: "strict" | "normal" | "lax" = "normal") {
    if (preset === "strict") {
      this.addRule("*", "ask"); // Ask for everything
    } else if (preset === "lax") {
      this.addRule("*", "allow"); // Allow everything
    } else {
      // normal: sensible defaults
      this.addRule("run_shell", "ask");
      this.addRule("write_file", "ask");
      this.addRule("delete_skill", "ask");
      this.addRule("take_screenshot", "ask");
      this.addRule("move_mouse", "ask");
      this.addRule("click", "ask");
      this.addRule("type_text", "ask");
      this.addRule("read_file", "allow");
      this.addRule("list_directory", "allow");
      this.addRule("read_clipboard", "allow");
      this.addRule("write_clipboard", "allow");
      this.addRule("list_skills", "allow");
      this.addRule("create_skill", "allow");
      this.addRule("update_skill", "allow");
      this.addRule("activate_skill", "allow");
      this.addRule("open_url", "allow");
    }
  }

  addRule(pattern: string, action: PermissionAction): void {
    this.rules.push({ pattern, action });
  }

  removeRule(pattern: string): void {
    this.rules = this.rules.filter(r => r.pattern !== pattern);
  }

  /** Check tool permission. Supports patterns: "toolName", "toolName(args*)", "*" */
  check(toolName: string, toolArgs?: Record<string, unknown>): PermissionAction {
    // Check exact match first
    for (const rule of this.rules) {
      if (rule.pattern === toolName) return rule.action;
    }
    // Check pattern match: toolName(args*)
    const toolCall = formatToolCall(toolName, toolArgs);
    for (const rule of this.rules) {
      if (matchPattern(rule.pattern, toolCall)) return rule.action;
    }
    // Check wildcard
    for (const rule of this.rules) {
      if (rule.pattern === "*") return rule.action;
    }
    return "ask";
  }

  setRule(pattern: string, action: PermissionAction): void {
    this.removeRule(pattern);
    this.addRule(pattern, action);
  }

  getRules(): PermissionRule[] { return [...this.rules]; }

  /** Convert rules to serializable config */
  toJSON(): Record<string, PermissionAction> {
    const out: Record<string, PermissionAction> = {};
    for (const r of this.rules) out[r.pattern] = r.action;
    return out;
  }

  /** Load rules from config JSON */
  fromJSON(json: Record<string, PermissionAction>): void {
    for (const [pattern, action] of Object.entries(json)) {
      this.removeRule(pattern);
      this.addRule(pattern, action);
    }
  }
}

function formatToolCall(name: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return name;
  return name;
}

/** Simple glob: "Bash(git *)" matches "Bash(git push)" */
function matchPattern(pattern: string, toolCall: string): boolean {
  if (!pattern.includes("(")) return pattern === toolCall;

  const [pName, pArgs] = parsePattern(pattern);
  const [tName] = toolCall.includes("(") ? toolCall.split("(") : [toolCall, ""];
  if (pName !== tName) return false;

  // Convert glob pattern to regex
  const escaped = pArgs.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`);
  const tArgs = toolCall.includes("(") ? toolCall.slice(toolCall.indexOf("(") + 1, -1) : "";
  return regex.test(tArgs);
}

function parsePattern(pattern: string): [string, string] {
  const openIdx = pattern.indexOf("(");
  const closeIdx = pattern.lastIndexOf(")");
  const name = pattern.slice(0, openIdx);
  const args = pattern.slice(openIdx + 1, closeIdx);
  return [name, args];
}
