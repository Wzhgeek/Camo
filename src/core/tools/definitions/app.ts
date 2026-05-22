import { toolRegistry } from "../registry";
import { reminderService } from "../../reminder/reminderService";
import type { ReminderInput, ReminderType, ScheduleKind } from "../../reminder/types";
import { useReminderStore } from "../../../stores/reminderStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import type { StickyNoteConfig } from "../../../stores/settingsStore";

function registerAppTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "create_reminder",
        description: "创建提醒。提醒有触发时间，到点会弹出通知。用于：定时提醒、X分钟后提醒、每天X点提醒、喝水提醒、运动提醒。不要用于纯文字记录/便签/备忘。",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "提醒标题" },
            type: { type: "string", enum: ["normal", "water", "exercise"], description: "提醒类型" },
            scheduleKind: { type: "string", enum: ["once", "daily", "interval"], description: "once=一次性, daily=每天, interval=循环间隔" },
            triggerAt: { type: "string", description: "一次性提醒的ISO8601时间，如 2024-01-15T14:30:00" },
            time: { type: "string", description: "每天提醒的时间点，如 14:30" },
            intervalMinutes: { type: "number", description: "循环提醒的间隔分钟数" },
          },
          required: ["title", "scheduleKind"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const kind: ScheduleKind = args.scheduleKind as ScheduleKind || "once";
      let payload: Record<string, unknown>;
      if (kind === "daily") {
        payload = { time: args.time };
      } else if (kind === "interval") {
        payload = { intervalMinutes: Number(args.intervalMinutes) };
      } else {
        payload = { runAt: args.triggerAt };
      }
      const validTypes: ReminderType[] = ["normal", "water", "exercise"];
      const input: ReminderInput = {
        title: (args.title as string) || "提醒",
        type: validTypes.includes(args.type as ReminderType) ? args.type as ReminderType : "normal",
        scheduleKind: kind,
        schedulePayload: payload,
        enabled: true,
      };
      const created = reminderService.create(input);
      useReminderStore().refreshReminders();
      return `提醒已创建: "${created.title}"（${kind === "once" ? "一次性" : kind === "daily" ? "每天" : "循环"}）`;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "create_note",
        description: "创建桌面便签。便签是始终显示在桌面的静态文字，没有提醒/时间属性。用于：写便签、记便签、记一段文字、备忘一段话。不要用于带时间要求的提醒。",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "便签内容" },
          },
          required: ["text"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const settingsStore = useSettingsStore();
      const note: StickyNoteConfig = {
        id: crypto.randomUUID(),
        text: (args.text as string) || "便签",
        enabled: true,
      };
      settingsStore.settings.stickyNotes.push(note);
      try {
        localStorage.setItem("camo:command", JSON.stringify({
          cmd: "create-note",
          note: { id: note.id, text: note.text, enabled: true },
          t: Date.now(),
        }));
      } catch {}
      return `便签已创建: "${note.text.slice(0, 30)}${note.text.length > 30 ? "..." : ""}"`;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "start_focus",
        description: "开始专注模式（番茄钟），启动倒计时。用于：开始专注、番茄钟、专注XX分钟、我要专注等。",
        parameters: {
          type: "object",
          properties: {
            duration: { type: "number", description: "专注分钟数，不填则使用默认设置" },
          },
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const settingsStore = useSettingsStore();
      const duration = Number(args.duration) || settingsStore.settings.focusDuration || 25;
      if (args.duration) {
        settingsStore.settings.focusDuration = duration;
      }
      try {
        localStorage.setItem("camo:command", JSON.stringify({
          cmd: "start-focus",
          duration,
          t: Date.now(),
        }));
      } catch {}
      return `专注模式已开始，${duration} 分钟倒计时。`;
    },
  });
}

registerAppTools();
