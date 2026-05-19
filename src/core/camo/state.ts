export type CamoState =
  | "idle"
  | "happy"
  | "thinking"
  | "answering"
  | "reminder"
  | "water"
  | "exercise"
  | "sleepy"
  | "done";

export type CamoEvent =
  | { type: "APP_READY" }
  | { type: "PET_CLICKED" }
  | { type: "USER_SENT_MESSAGE" }
  | { type: "LLM_STREAM_START" }
  | { type: "LLM_STREAM_END" }
  | { type: "REMINDER_TRIGGERED"; reminderType: "normal" | "water" | "exercise" }
  | { type: "TASK_DONE" }
  | { type: "IDLE_TIMEOUT" };

export function reduceCamoState(event: CamoEvent): CamoState {
  switch (event.type) {
    case "APP_READY":
      return "idle";
    case "PET_CLICKED":
      return "happy";
    case "USER_SENT_MESSAGE":
      return "thinking";
    case "LLM_STREAM_START":
      return "answering";
    case "LLM_STREAM_END":
      return "idle";
    case "REMINDER_TRIGGERED":
      if (event.reminderType === "water") return "water";
      if (event.reminderType === "exercise") return "exercise";
      return "reminder";
    case "TASK_DONE":
      return "done";
    case "IDLE_TIMEOUT":
      return "sleepy";
  }
}
