export type ReminderType = "normal" | "water" | "exercise";
export type ScheduleKind = "once" | "daily" | "interval" | "fixedTimes";

export interface ReminderInput {
  title: string;
  type: ReminderType;
  scheduleKind: ScheduleKind;
  schedulePayload: Record<string, unknown>;
  enabled?: boolean;
}

export interface Reminder extends ReminderInput {
  id: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
