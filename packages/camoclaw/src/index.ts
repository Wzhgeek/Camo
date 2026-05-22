// ── Agent ──
export { AgentLoop, type AgentCallbacks, type AgentContext } from "./agent/loop";
export { PermissionManager, type PermissionAction, type PermissionRule } from "./agent/permissions";

// ── LLM ──
export { OpenAICompatibleProvider } from "./llm/openaiCompatible";
export { OllamaProvider } from "./llm/ollama";
export type { ChatMessage, Tool, ToolCall, LLMProvider, LLMConfig, LLMProviderName, StreamCallbacks } from "./llm/types";

// ── Tools ──
export { toolRegistry, type ToolDefinition } from "./tools/registry";
export { invokePortal } from "./tools/portal";
// Tool definitions auto-register on import
import "./tools/definitions/file";
import "./tools/definitions/shell";
import "./tools/definitions/screen";
import "./tools/definitions/input";
import "./tools/definitions/clipboard";
import "./tools/definitions/skill";
import "./tools/definitions/app";
export { setAppToolCallbacks, type AppToolCallbacks } from "./tools/definitions/app";
export { setActivateSkillFn } from "./tools/definitions/skill";

// ── Skill ──
export {
  skillService, setSkillDB, type Skill, type SkillDB
} from "./skill/skillService";
export { getBuiltinSkills } from "./skill/builtin";
export { matchSkill } from "./skill/matcher";
export { parseSkillMarkdown, serializeSkillMarkdown, type SkillFrontmatter } from "./skill/parser";
export { clawhub, type ClawHubSearchResult, type ClawHubSkillDetail } from "./skill/clawhub";
export {
  setCamoclawFS, type CamoclawFS,
  readSkillFromDisk, writeSkillToDisk, deleteSkillFromDisk, syncSkillsFromDisk,
} from "./skill/fsSync";

// ── Platform ──
export { isTauri } from "./platform";
