import { toolRegistry } from "../registry";
import { skillService } from "../../skill/skillService";

function registerSkillTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "list_skills",
        description: "列出所有可用的 Skill（技能）。",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    requiresConfirm: false,
    execute: async () => {
      const skills = skillService.list();
      if (skills.length === 0) return "(没有 Skill)";
      return skills.map(s =>
        `- ${s.title} (${s.name}) [${s.enabled ? "启用" : "禁用"}] ${s.builtIn ? "[内置]" : ""}: ${s.description}`
      ).join("\n");
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "create_skill",
        description: "创建一个新的 Skill（技能）。如果同名 Skill 已存在则会更新它。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Skill 标识符，如 'git-helper'" },
            title: { type: "string", description: "显示名称，如 'Git 助手'" },
            description: { type: "string", description: "这个 Skill 的功能描述，帮助 LLM 判断何时激活" },
            prompt: { type: "string", description: "系统提示词，定义此 Skill 的行为和角色" },
            tools: { type: "array", items: { type: "string" }, description: "允许使用的工具名列表" },
            autoTriggerWords: { type: "array", items: { type: "string" }, description: "触发词列表，用户消息包含时自动激活此 Skill（可选）" },
          },
          required: ["name", "title", "description", "prompt", "tools"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const name = args.name as string;
      const title = args.title as string;
      const description = args.description as string;
      const prompt = args.prompt as string;
      const tools = (args.tools as string[]) ?? [];
      const autoTriggerWords = (args.autoTriggerWords as string[]) ?? [];
      try {
        const skill = skillService.create({ name, title, description, prompt, tools, autoTriggerWords });
        return `Skill "${skill.title}" (${skill.name}) 已创建。可用工具: ${skill.tools.join(", ") || "(无)"}`;
      } catch (e) {
        return `创建 Skill 失败: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "update_skill",
        description: "更新一个已有的 Skill。内置 Skill 只能修改 enabled 状态。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "要更新的 Skill 的 ID" },
            name: { type: "string", description: "新的标识符（可选）" },
            title: { type: "string", description: "新的显示名称（可选）" },
            description: { type: "string", description: "新的描述（可选）" },
            prompt: { type: "string", description: "新的系统提示词（可选）" },
            tools: { type: "array", items: { type: "string" }, description: "新的工具列表（可选）" },
            autoTriggerWords: { type: "array", items: { type: "string" }, description: "新的触发词列表（可选）" },
            enabled: { type: "boolean", description: "是否启用（可选）" },
          },
          required: ["id"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const id = args.id as string;
      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.title !== undefined) patch.title = args.title;
      if (args.description !== undefined) patch.description = args.description;
      if (args.prompt !== undefined) patch.prompt = args.prompt;
      if (args.tools !== undefined) patch.tools = args.tools;
      if (args.autoTriggerWords !== undefined) patch.autoTriggerWords = args.autoTriggerWords;
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      const skill = skillService.update(id, patch as any);
      if (!skill) return `Error: Skill "${id}" 不存在`;
      return `Skill "${skill.title}" 已更新。`;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "delete_skill",
        description: "删除一个 Skill。内置 Skill 不可删除。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "要删除的 Skill 的 ID" },
          },
          required: ["id"],
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      const id = args.id as string;
      const skill = skillService.get(id);
      if (!skill) return `Error: Skill "${id}" 不存在`;
      if (skill.builtIn) return `Error: 内置 Skill "${skill.title}" 不可删除`;
      const ok = skillService.delete(id);
      return ok ? `Skill "${skill.title}" 已删除。` : `Error: 删除失败`;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "activate_skill",
        description: "手动切换到指定的 Skill。",
        parameters: {
          type: "object",
          properties: {
            id: { type: "string", description: "要激活的 Skill 的 ID" },
          },
          required: ["id"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const id = args.id as string;
      const skill = skillService.get(id);
      if (!skill) return `Error: Skill "${id}" 不存在`;
      if (!skill.enabled) return `Error: Skill "${skill.title}" 已被禁用`;
      // The actual activation happens in the store
      // We use a module-level setter to avoid circular dependency
      if (activateSkillFn) {
        activateSkillFn(id);
      }
      return `已切换到 Skill "${skill.title}"。可用工具: ${skill.tools.join(", ")}`;
    },
  });
}

// Deferred setter to avoid circular import between tools and stores
let activateSkillFn: ((id: string) => void) | null = null;
export function setActivateSkillFn(fn: (id: string) => void): void {
  activateSkillFn = fn;
}

registerSkillTools();
