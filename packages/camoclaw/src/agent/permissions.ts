export type PermissionAction = "allow" | "deny" | "ask";

export interface PermissionRule {
  toolName: string;
  action: PermissionAction;
}

export class PermissionManager {
  private rules = new Map<string, PermissionAction>();

  constructor() {
    this.setDefault("write_file", "ask");
    this.setDefault("run_shell", "ask");
    this.setDefault("delete_skill", "ask");
    this.setDefault("take_screenshot", "ask");
    this.setDefault("move_mouse", "ask");
    this.setDefault("click", "ask");
    this.setDefault("type_text", "ask");

    this.setDefault("read_file", "allow");
    this.setDefault("list_directory", "allow");
    this.setDefault("read_clipboard", "allow");
    this.setDefault("write_clipboard", "allow");
    this.setDefault("list_skills", "allow");
    this.setDefault("create_skill", "allow");
    this.setDefault("update_skill", "allow");
    this.setDefault("activate_skill", "allow");
    this.setDefault("open_url", "allow");
  }

  private setDefault(toolName: string, action: PermissionAction): void {
    if (!this.rules.has(toolName)) {
      this.rules.set(toolName, action);
    }
  }

  check(toolName: string): PermissionAction {
    return this.rules.get(toolName) ?? "ask";
  }

  setRule(toolName: string, action: PermissionAction): void {
    this.rules.set(toolName, action);
  }

  getRules(): Array<{ toolName: string; action: PermissionAction }> {
    return Array.from(this.rules.entries()).map(([toolName, action]) => ({ toolName, action }));
  }
}
