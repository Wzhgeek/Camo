import { AppState } from "./status.js";
import { History } from "./history.js";
import { CamoConfig, loadConfig, saveConfig, getConfigPath } from "./config.js";
import { info, success, warn, error } from "./renderer.js";
import { skillService } from "../skill/skillService.js";
import { clawhub } from "../skill/clawhub.js";
import { writeSkillToDisk } from "../skill/fsSync.js";
import { toolRegistry } from "../tools/registry.js";
import { sessionManager } from "./sessions.js";
import { loadCommands } from "./commandLoader.js";
import { PermissionManager, type PermissionAction } from "../agent/permissions.js";

export interface CommandContext {
  state: AppState;
  history: History;
  config: CamoConfig;
  permissions: PermissionManager;
  refreshConfig(): void;
  refreshSkills(): void;
  print(msg: string): void;
}

type CommandHandler = (args: string[], ctx: CommandContext) => Promise<void> | void;

const commands = new Map<string, CommandHandler>();

function register(cmd: string, handler: CommandHandler) { commands.set(cmd, handler); }
export { getCommands as getCommandNames };
export function getCommands(): string[] { return [...commands.keys()]; }

// Recent commands LRU
const recentCommands: string[] = [];
const MAX_RECENT = 10;

export function recordCommand(cmd: string) {
  const idx = recentCommands.indexOf(cmd);
  if (idx >= 0) recentCommands.splice(idx, 1);
  recentCommands.unshift(cmd);
  if (recentCommands.length > MAX_RECENT) recentCommands.pop();
}

export function getRecentCommands(): string[] {
  return [...recentCommands];
}

// ── Help ──
register("help", (_, ctx) => {
  ctx.print(`
${info("可用命令:")}

  会话:   /clear    /undo    /reset    /save    /sessions
  模式:   /mode chat|agent|shell
  模型:   /model [name|list]
  配置:   /config [set key value|path]
  技能:   /skills [browse|install slug|remove name]
          /skill [name|auto]
  系统:   /system [text|reset]
  信息:   /status    /version    /help    /exit
`);
});

// ── Mode ──
register("mode", (args, ctx) => {
  if (!args.length) {
    ctx.print(info(`当前模式: ${ctx.state.mode}`));
    return;
  }
  const m = args[0] as "chat" | "agent" | "shell";
  if (["chat", "agent", "shell"].includes(m)) {
    ctx.state.setMode(m);
    ctx.print(success(`已切换到 ${m} 模式`));
  } else {
    ctx.print(warn(`无效模式: ${m}。可选: chat / agent / shell`));
  }
});

// ── Model ──
register("model", (args, ctx) => {
  if (!args.length) {
    ctx.print(info(`当前模型: ${ctx.config.model}`));
    return;
  }
  if (args[0] === "list") {
    ctx.print(info("DeepSeek: deepseek-v4-flash, deepseek-v4-pro"));
    ctx.print(info("通过 /config set model <name> 修改"));
    return;
  }
  ctx.config.model = args[0];
  saveConfig(ctx.config);
  ctx.refreshConfig();
  ctx.state.setModel(ctx.config.model);
  ctx.print(success(`模型已切换为 ${ctx.config.model}`));
});

// ── Config ──
register("config", (args, ctx) => {
  if (!args.length) {
    ctx.print(info(`配置文件: ${getConfigPath()}`));
    ctx.print(info(`provider: ${ctx.config.provider}`));
    ctx.print(info(`baseUrl: ${ctx.config.baseUrl}`));
    ctx.print(info(`model: ${ctx.config.model}`));
    ctx.print(info(`apiKey: ${ctx.config.apiKey ? "***" + ctx.config.apiKey.slice(-4) : "(未设置)"}`));
    return;
  }
  if (args[0] === "path") {
    ctx.print(info(getConfigPath()));
  } else if (args[0] === "set" && args[1] && args[2]) {
    (ctx.config as unknown as Record<string, string>)[args[1]] = args[2];
    saveConfig(ctx.config);
    ctx.refreshConfig();
    ctx.print(success(`${args[1]} 已更新`));
  } else {
    ctx.print(warn("用法: /config set <key> <value>"));
  }
});

// ── Skills ──
register("skills", async (args, ctx) => {
  if (!args.length) {
    const skills = skillService.list();
    if (!skills.length) { ctx.print(info("暂无 Skill")); return; }
    for (const s of skills) {
      ctx.print(`  ${s.title} (${s.name}) [${s.enabled ? "✓" : "✗"}]`);
    }
    return;
  }
  if (args[0] === "browse") {
    try {
      const { items } = await clawhub.listSkills("downloads", 10);
      for (const item of items) {
        ctx.print(`  ${item.displayName} (${item.slug}) ${item.stars ? "⭐" + item.stars : ""}`);
        ctx.print(`    ${item.summary.slice(0, 80)}`);
      }
      ctx.print(info("安装: /skills install <slug>"));
    } catch { ctx.print(error("获取失败，请检查网络")); }
  } else if (args[0] === "install" && args[1]) {
    try {
      const md = await clawhub.fetchSkillFile(args[1]);
      const { parseSkillMarkdown } = await import("../skill/parser.js");
      const { frontmatter } = parseSkillMarkdown(md);
      const name = frontmatter.name || args[1];
      const tools = frontmatter.tools.length > 0 ? frontmatter.tools : toolRegistry.listNames();
      const skill = skillService.create({
        name,
        title: frontmatter.title || args[1],
        description: frontmatter.description || "",
        prompt: frontmatter.prompt || md,
        tools,
        autoTriggerWords: frontmatter.autoTriggerWords || [],
      });
      writeSkillToDisk(skill).catch(() => {});
      ctx.refreshSkills();
      ctx.print(success(`Skill "${skill.title}" 已安装`));
    } catch { ctx.print(error("安装失败")); }
  } else if (args[0] === "remove" && args[1]) {
    const s = skillService.getByName(args[1]);
    if (!s) { ctx.print(warn("Skill 不存在")); return; }
    if (s.builtIn) { ctx.print(warn("内置 Skill 不可删除")); return; }
    skillService.delete(s.id);
    ctx.refreshSkills();
    ctx.print(success(`Skill "${s.title}" 已删除`));
  } else {
    ctx.print(warn("用法: /skills [browse|install <slug>|remove <name>]"));
  }
});

// ── Skill (switch) ──
register("skill", (args, ctx) => {
  if (!args.length || args[0] === "auto") {
    ctx.state.setSkill("通用助手");
    ctx.print(success("已恢复自动匹配 Skill"));
    return;
  }
  const s = skillService.getByName(args[0]);
  if (!s) { ctx.print(warn(`Skill "${args[0]}" 不存在`)); return; }
  ctx.state.setSkill(s.title);
  ctx.print(success(`已切换为 "${s.title}"`));
});

// ── System Prompt ──
let customSystemPrompt = "";
register("system", (args, ctx) => {
  if (!args.length) {
    ctx.print(info(customSystemPrompt || "(使用默认)"));
    return;
  }
  if (args[0] === "reset") {
    customSystemPrompt = "";
    ctx.print(success("已恢复默认 System Prompt"));
  } else {
    customSystemPrompt = args.join(" ");
    ctx.print(success("System Prompt 已设置"));
  }
});
export function getCustomSystemPrompt(): string { return customSystemPrompt; }

// ── Session ──
register("clear", (_, ctx) => { ctx.history.clear(); ctx.print(success("对话已清除")); });
register("undo", (_, ctx) => { ctx.history.undoLast(); ctx.print(success("已撤销")); });
register("reset", (_, ctx) => { ctx.history.clear(); customSystemPrompt = ""; ctx.print(success("会话已重置")); });
register("compact", (_, ctx) => { ctx.print(info("上下文已优化")); });
register("sessions", (_, ctx) => {
  const list = sessionManager.list();
  if (!list.length) { ctx.print(info("无保存的会话")); return; }
  for (const s of list) {
    const marker = s.id === ctx.history.sid ? " *" : "  ";
    const msgs = sessionManager.countMessages(s.id);
    ctx.print(`${marker}${s.title || "(未命名)"} [${msgs} 条] ${s.model}`);
  }
});
register("save", (args, ctx) => {
  const title = args.join(" ") || `会话 ${new Date().toLocaleDateString()}`;
  sessionManager.updateTitle(ctx.history.sid, title);
  ctx.print(success(`已保存: ${title}`));
});

// ── Info ──
register("status", (_, ctx) => {
  ctx.print(info(`模式: ${ctx.state.mode} | 模型: ${ctx.config.model} | Skill: ${ctx.state.activeSkill} | tokens: ~${ctx.history.getTokenEstimate()}`));
});
register("version", (_, ctx) => { ctx.print("CamoClaw v0.1.0"); });

// ── Permissions ──
register("permissions", (args, ctx) => {
  if (!args.length) {
    const rules = ctx.permissions.getRules();
    if (!rules.length) { ctx.print(info("无自定义权限规则")); return; }
    for (const r of rules) {
      ctx.print(`  ${r.pattern} → ${r.action}`);
    }
    return;
  }
  if (args.length >= 2) {
    const action = args[0] as PermissionAction;
    const pattern = args.slice(1).join(" ");
    if (["allow", "deny", "ask"].includes(action)) {
      ctx.permissions.setRule(pattern, action as PermissionAction);
      ctx.print(success(`权限已设置: ${pattern} → ${action}`));
    } else {
      ctx.print(warn("用法: /permissions [allow|deny|ask] <pattern>"));
    }
  }
});

// ── Exit ──
register("exit", () => { process.exit(0); });
register("quit", () => { process.exit(0); });

// ── Load user-defined commands from ~/.camoclaw/commands/*.md ──
const userCommands = loadCommands();
for (const cmd of userCommands) {
  if (commands.has(cmd.name)) continue; // don't override builtins
  register(cmd.name, (args, ctx) => {
    ctx.print(info(`${cmd.name}: ${cmd.description}`));
    if (cmd.content) ctx.print(cmd.content);
  });
}

export async function handleCommand(input: string, ctx: CommandContext): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return false;

  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const handler = commands.get(cmd);
  if (handler) {
    await handler(args, ctx);
    recordCommand(cmd);
  } else {
    ctx.print(warn(`未知命令: /${cmd}。输入 /help 查看帮助。`));
  }
  return true;
}
