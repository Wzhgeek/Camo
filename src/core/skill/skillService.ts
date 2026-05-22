import { dbRun, dbAll, dbGet } from "../storage/database";
import { getBuiltinSkills } from "./builtin";

export interface Skill {
  id: string;
  name: string;
  title: string;
  description: string;
  prompt: string;
  tools: string[];
  autoTriggerWords: string[];
  enabled: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToSkill(row: Record<string, unknown>): Skill {
  return {
    id: row.id as string,
    name: row.name as string,
    title: row.title as string,
    description: row.description as string,
    prompt: row.prompt as string,
    tools: JSON.parse(row.tools as string || "[]"),
    autoTriggerWords: JSON.parse(row.auto_trigger_words as string || "[]"),
    enabled: row.enabled === 1,
    builtIn: row.built_in === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function generateId(): string {
  return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

export const skillService = {
  list(): Skill[] {
    return dbAll<Record<string, unknown>>("SELECT * FROM skills ORDER BY built_in DESC, name ASC").map(rowToSkill);
  },

  get(id: string): Skill | null {
    const row = dbGet<Record<string, unknown>>("SELECT * FROM skills WHERE id = ?", [id]);
    return row ? rowToSkill(row) : null;
  },

  getByName(name: string): Skill | null {
    const row = dbGet<Record<string, unknown>>("SELECT * FROM skills WHERE name = ?", [name]);
    return row ? rowToSkill(row) : null;
  },

  create(input: {
    name: string;
    title: string;
    description: string;
    prompt: string;
    tools: string[];
    autoTriggerWords: string[];
    builtIn?: boolean;
  }): Skill {
    // Dedup: if a skill with the same name exists, update it instead
    const existing = this.getByName(input.name);
    if (existing) {
      return this.update(existing.id, input)!;
    }
    const id = generateId();
    const ts = now();
    const toolsStr = JSON.stringify(input.tools);
    const triggerWordsStr = JSON.stringify(input.autoTriggerWords);
    dbRun(
      `INSERT INTO skills (id, name, title, description, prompt, tools, auto_trigger_words, enabled, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [id, input.name, input.title, input.description, input.prompt, toolsStr, triggerWordsStr, input.builtIn ? 1 : 0, ts, ts],
    );
    const skill = this.get(id)!;
    // Write to file system
    import("./fsSync").then(({ writeSkillToDisk }) => {
      writeSkillToDisk(skill).catch(() => {});
    });
    return skill;
  },

  update(id: string, patch: Partial<Pick<Skill, "name" | "title" | "description" | "prompt" | "tools" | "autoTriggerWords" | "enabled">>): Skill | null {
    const existing = this.get(id);
    if (!existing) return null;
    const ts = now();
    const name = patch.name ?? existing.name;
    const title = patch.title ?? existing.title;
    const description = patch.description ?? existing.description;
    const prompt = patch.prompt ?? existing.prompt;
    const toolsStr = JSON.stringify(patch.tools ?? existing.tools);
    const triggerWordsStr = JSON.stringify(patch.autoTriggerWords ?? existing.autoTriggerWords);
    const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
    dbRun(
      `UPDATE skills SET name=?, title=?, description=?, prompt=?, tools=?, auto_trigger_words=?, enabled=?, updated_at=? WHERE id=?`,
      [name, title, description, prompt, toolsStr, triggerWordsStr, enabled, ts, id],
    );
    const skill = this.get(id)!;
    // Write to file system
    if (!skill.builtIn) {
      import("./fsSync").then(({ writeSkillToDisk }) => {
        writeSkillToDisk(skill).catch(() => {});
      });
    }
    return skill;
  },

  delete(id: string): boolean {
    const existing = this.get(id);
    if (!existing || existing.builtIn) return false;
    const name = existing.name;
    dbRun("DELETE FROM skills WHERE id = ?", [id]);
    // Delete from file system
    import("./fsSync").then(({ deleteSkillFromDisk }) => {
      deleteSkillFromDisk(name).catch(() => {});
    });
    return true;
  },

  ensureBuiltins(): void {
    const existing = this.list().filter(s => s.builtIn);
    if (existing.length === 0) {
      // No built-ins exist, insert them
      const builtins = getBuiltinSkills();
      for (const b of builtins) {
        if (!this.getByName(b.name)) {
          this.create({ ...b, builtIn: true });
        }
      }
    }
  },
};
