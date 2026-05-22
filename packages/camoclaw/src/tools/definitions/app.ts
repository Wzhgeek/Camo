import { toolRegistry } from "../registry";

/** Callbacks that the host application provides for app-level tools */
export interface AppToolCallbacks {
  createReminder(args: Record<string, unknown>): string;
  createNote(args: Record<string, unknown>): string;
  startFocus(args: Record<string, unknown>): string;
}

let appCallbacks: AppToolCallbacks | null = null;

export function setAppToolCallbacks(cbs: AppToolCallbacks): void {
  appCallbacks = cbs;
}

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
            scheduleKind: { type: "string", enum: ["once", "daily", "interval"], description: "一次性/每天/循环间隔" },
            triggerAt: { type: "string", description: "一次性提醒的ISO8601时间" },
            time: { type: "string", description: "每天提醒的时间点，如 14:30" },
            intervalMinutes: { type: "number", description: "循环提醒的间隔分钟数" },
          },
          required: ["title", "scheduleKind"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      if (!appCallbacks) return "Error: 提醒功能未配置";
      return appCallbacks.createReminder(args);
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "create_note",
        description: "创建桌面便签。便签是始终显示在桌面的静态文字，没有提醒/时间属性。",
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
      if (!appCallbacks) return "Error: 便签功能未配置";
      return appCallbacks.createNote(args);
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "start_focus",
        description: "开始专注模式（番茄钟），启动倒计时。",
        parameters: {
          type: "object",
          properties: {
            duration: { type: "number", description: "专注分钟数" },
          },
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      if (!appCallbacks) return "Error: 专注功能未配置";
      return appCallbacks.startFocus(args);
    },
  });
}

registerAppTools();
