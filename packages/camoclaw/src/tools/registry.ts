import type { Tool } from "../llm/types.js";

export interface ToolDefinition {
  schema: Tool;
  requiresConfirm: boolean;
  execute(args: Record<string, unknown>): Promise<string>;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    this.tools.set(def.schema.function.name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getSchemas(allowlist?: string[]): Tool[] {
    const all = Array.from(this.tools.values());
    const filtered = allowlist
      ? all.filter(t => allowlist.includes(t.schema.function.name))
      : all;
    return filtered.map(t => t.schema);
  }

  needsConfirm(name: string): boolean {
    return this.tools.get(name)?.requiresConfirm ?? false;
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const def = this.tools.get(name);
    if (!def) return `Error: unknown tool "${name}"`;
    try {
      return await def.execute(args);
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const toolRegistry = new ToolRegistry();
