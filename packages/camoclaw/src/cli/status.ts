export type AppMode = "chat" | "agent" | "shell";
export type AppStatus = "idle" | "thinking" | "error";

export class AppState {
  mode: AppMode = "agent";
  status: AppStatus = "idle";
  model = "";
  activeSkill = "通用助手";
  tokenCount = 0;

  setModel(m: string) { this.model = m; }
  setStatus(s: AppStatus) { this.status = s; }
  setMode(m: AppMode) { this.mode = m; }
  setSkill(s: string) { this.activeSkill = s; }
  setTokens(n: number) { this.tokenCount = n; }
}
