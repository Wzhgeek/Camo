// ── Agent ──
export { AgentLoop, type AgentCallbacks, type AgentContext } from "./agent/loop.js";
export { PermissionManager, type PermissionAction, type PermissionRule } from "./agent/permissions.js";

// ── LLM ──
export { OpenAICompatibleProvider } from "./llm/openaiCompatible.js";
export { OllamaProvider } from "./llm/ollama.js";
export type { ChatMessage, Tool, ToolCall, LLMProvider, LLMConfig, LLMProviderName, StreamCallbacks } from "./llm/types.js";

// ── Tools ──
export { toolRegistry, type ToolDefinition } from "./tools/registry.js";
export { invokePortal } from "./tools/portal.js";
// Tool definitions auto-register on import
import "./tools/definitions/file";
import "./tools/definitions/shell";
import "./tools/definitions/screen";
import "./tools/definitions/input";
import "./tools/definitions/clipboard";
import "./tools/definitions/skill";
import "./tools/definitions/app";
export { setAppToolCallbacks, type AppToolCallbacks } from "./tools/definitions/app.js";
export { setActivateSkillFn } from "./tools/definitions/skill.js";

// ── Skill ──
export {
  skillService, setSkillDB, type Skill, type SkillDB
} from "./skill/skillService.js";
export { getBuiltinSkills } from "./skill/builtin.js";
export { matchSkill } from "./skill/matcher.js";
export { parseSkillMarkdown, serializeSkillMarkdown, type SkillFrontmatter } from "./skill/parser.js";
export { clawhub, type ClawHubSearchResult, type ClawHubSkillDetail } from "./skill/clawhub.js";
export {
  setCamoclawFS, type CamoclawFS,
  readSkillFromDisk, writeSkillToDisk, deleteSkillFromDisk, syncSkillsFromDisk,
} from "./skill/fsSync.js";

// ── Platform ──
export { isTauri } from "./platform.js";
