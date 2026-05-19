export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMConfig {
  provider: "openai" | "ollama";
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onThinking?: (token: string) => void;
}

export interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<string>;
  chatStream(messages: ChatMessage[], callbacks: StreamCallbacks, signal?: AbortSignal): Promise<string>;
}

export const defaultLLMConfig: LLMConfig = {
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  apiKey: "",
  model: "qwen3.5:2b",
};
