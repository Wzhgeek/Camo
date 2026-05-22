export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMProviderName =
  | "deepseek" | "kimi" | "minimax" | "zai" | "mimo"
  | "doubao" | "chatgpt" | "claude" | "gemini" | "ollama" | "openai";

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: Record<LLMProviderName, ProviderPreset> = {
  deepseek: { label: "DeepSeek",  baseUrl: "https://api.deepseek.com",                                defaultModel: "deepseek-v4-flash" },
  kimi:     { label: "Kimi",      baseUrl: "https://api.moonshot.cn/v1",                               defaultModel: "" },
  minimax:  { label: "MiniMax",   baseUrl: "https://api.minimax.chat/v1",                              defaultModel: "" },
  zai:      { label: "Z.ai",      baseUrl: "https://api.z.ai/v1",                                      defaultModel: "" },
  mimo:     { label: "Mimo",      baseUrl: "https://api.mimo.ai/v1",                                   defaultModel: "" },
  doubao:   { label: "豆包",      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",                 defaultModel: "" },
  chatgpt:  { label: "ChatGPT",   baseUrl: "https://api.openai.com/v1",                               defaultModel: "" },
  claude:   { label: "Claude",    baseUrl: "https://api.anthropic.com/v1",                            defaultModel: "" },
  gemini:   { label: "Gemini",    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", defaultModel: "" },
  ollama:   { label: "Ollama",    baseUrl: "http://localhost:11434",                                   defaultModel: "qwen3.5:2b" },
  openai:   { label: "OpenAI",    baseUrl: "https://api.openai.com/v1",                               defaultModel: "" },
};

export interface LLMConfig {
  provider: LLMProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => void;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], tools?: Tool[]): Promise<string>;
  chatStream(messages: ChatMessage[], callbacks: StreamCallbacks, signal?: AbortSignal, tools?: Tool[]): Promise<string>;
}

export const defaultLLMConfig: LLMConfig = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
};
