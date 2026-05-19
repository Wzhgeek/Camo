# Camo 桌宠个人助手开发方案（供 Codex 实现）

## 1. 开发目标

实现一个基于 Tauri + Vue3 + TypeScript 的轻量桌面桌宠个人助手原型。角色形象使用已有素材目录：

```text
Camo/Camo_asset/
```

应用名称：Camo

核心功能：

1. 桌面透明悬浮窗显示 Camo。
2. Camo 可点击、可拖动、可置顶。
3. 点击 Camo 打开聊天窗口。
4. 支持 LLM 问答。
5. 支持自然语言创建提醒。
6. 支持喝水提醒。
7. 支持健康训练提醒。
8. 支持本地 SQLite 存储。
9. 支持托盘菜单。
10. 支持基础设置页。

此文档可以直接交给 Codex 执行。Codex 应按任务顺序实现，不要一次性过度扩展。

---

## 2. 技术栈

推荐技术栈：

```text
Desktop: Tauri 2
Frontend: Vue 3 + Vite + TypeScript
State: Pinia
Storage: SQLite
Scheduler: 前端/后端本地调度器
LLM: OpenAI-compatible API + Ollama
Style: CSS / UnoCSS / TailwindCSS 均可，优先简单 CSS
Package Manager: pnpm
```

优先使用简单可维护方案。不要第一版引入复杂多 Agent 框架。

---

## 3. 预期项目结构

如果当前还没有项目，请创建如下结构：

```text
Camo/
├─ Camo_asset/
│  ├─ camo_idle.png
│  ├─ camo_happy.png
│  ├─ camo_thinking.png
│  ├─ camo_answering.png
│  ├─ camo_reminder.png
│  ├─ camo_water.png
│  ├─ camo_exercise.png
│  ├─ camo_sleepy.png
│  ├─ camo_done.png
│  └─ camo_icon.png
├─ src/
│  ├─ assets/
│  │  └─ camo/
│  ├─ components/
│  │  ├─ CamoPet.vue
│  │  ├─ ChatPanel.vue
│  │  ├─ ReminderBubble.vue
│  │  └─ SettingsPanel.vue
│  ├─ core/
│  │  ├─ agent/
│  │  │  ├─ intent.ts
│  │  │  ├─ agent.ts
│  │  │  └─ tools.ts
│  │  ├─ llm/
│  │  │  ├─ types.ts
│  │  │  ├─ openaiCompatible.ts
│  │  │  └─ ollama.ts
│  │  ├─ reminder/
│  │  │  ├─ types.ts
│  │  │  ├─ parser.ts
│  │  │  ├─ scheduler.ts
│  │  │  └─ reminderService.ts
│  │  └─ camo/
│  │     ├─ state.ts
│  │     └─ assets.ts
│  ├─ stores/
│  │  ├─ camoStore.ts
│  │  ├─ chatStore.ts
│  │  ├─ reminderStore.ts
│  │  └─ settingsStore.ts
│  ├─ styles/
│  │  └─ theme.css
│  ├─ App.vue
│  └─ main.ts
├─ src-tauri/
│  ├─ src/
│  │  └─ main.rs
│  ├─ capabilities/
│  └─ tauri.conf.json
├─ package.json
├─ pnpm-lock.yaml
└─ README.md
```

如果已经是标准 Tauri 项目，请在现有结构上调整，不要强行重建。

---

## 4. 素材处理要求

### 4.1 资源目录

用户已经将图片放在：

```text
Camo/Camo_asset/
```

Codex 需要做以下处理：

1. 检查 `Camo_asset` 是否存在。
2. 检查是否存在以下文件：
   - `camo_idle.png`
   - `camo_happy.png`
   - `camo_thinking.png`
   - `camo_answering.png`
   - `camo_reminder.png`
   - `camo_water.png`
   - `camo_exercise.png`
   - `camo_sleepy.png`
   - `camo_done.png`
   - `camo_icon.png`
3. 如果文件名不一致，不要报错退出，应创建 `src/core/camo/assets.ts` 做手动映射，并在 README 中提示需要重命名。
4. 运行时通过统一 manifest 获取图片，不要在组件里硬编码散乱路径。

### 4.2 推荐复制方式

将素材复制到前端 public 目录：

```text
public/camo/
```

最终浏览器可访问路径：

```text
/camo/camo_idle.png
/camo/camo_happy.png
/camo/camo_thinking.png
/camo/camo_answering.png
/camo/camo_reminder.png
/camo/camo_water.png
/camo/camo_exercise.png
/camo/camo_sleepy.png
/camo/camo_done.png
/camo/camo_icon.png
```

如果使用 `src/assets` 也可以，但 `public/camo` 更直观。

---

## 5. Camo 状态模型

创建文件：

```text
src/core/camo/state.ts
```

实现：

```ts
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
    default:
      return "idle";
  }
}
```

创建文件：

```text
src/core/camo/assets.ts
```

实现：

```ts
import type { CamoState } from "./state";

export const camoAssets: Record<CamoState, string> = {
  idle: "/camo/camo_idle.png",
  happy: "/camo/camo_happy.png",
  thinking: "/camo/camo_thinking.png",
  answering: "/camo/camo_answering.png",
  reminder: "/camo/camo_reminder.png",
  water: "/camo/camo_water.png",
  exercise: "/camo/camo_exercise.png",
  sleepy: "/camo/camo_sleepy.png",
  done: "/camo/camo_done.png",
};

export const camoIcon = "/camo/camo_icon.png";
```

---

## 6. CamoPet 组件

创建：

```text
src/components/CamoPet.vue
```

要求：

1. 接收 `state`。
2. 接收可选 `message`。
3. 根据 state 切换图片。
4. 支持简单 CSS 动画。
5. 点击后发出事件。
6. 不要包含复杂业务逻辑。

参考实现：

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { CamoState } from "../core/camo/state";
import { camoAssets } from "../core/camo/assets";

const props = defineProps<{
  state: CamoState;
  message?: string;
}>();

const emit = defineEmits<{
  clickPet: [];
}>();

const imageSrc = computed(() => camoAssets[props.state]);
</script>

<template>
  <div class="camo-root" @click="emit('clickPet')">
    <div v-if="message" class="camo-bubble">
      {{ message }}
    </div>

    <img
      class="camo-image"
      :class="`state-${state}`"
      :src="imageSrc"
      alt="Camo"
      draggable="false"
    />
  </div>
</template>

<style scoped>
.camo-root {
  position: relative;
  width: 180px;
  height: 220px;
  user-select: none;
  cursor: pointer;
}

.camo-image {
  width: 168px;
  height: 168px;
  object-fit: contain;
  animation: camo-float 3s ease-in-out infinite;
  filter: drop-shadow(0 12px 20px rgba(91, 33, 182, 0.18));
}

.camo-bubble {
  position: absolute;
  bottom: 172px;
  left: 0;
  max-width: 240px;
  padding: 10px 14px;
  border-radius: 16px;
  background: rgba(250, 247, 255, 0.96);
  color: #2e2157;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 10px 30px rgba(91, 33, 182, 0.18);
  border: 1px solid rgba(139, 92, 246, 0.18);
}

.state-thinking {
  animation: camo-thinking 1.2s ease-in-out infinite;
}

.state-answering {
  animation: camo-answering 1.5s ease-in-out infinite;
}

.state-reminder,
.state-water,
.state-exercise {
  animation: camo-alert 0.8s ease-in-out infinite;
}

.state-sleepy {
  opacity: 0.82;
  animation: camo-sleepy 4s ease-in-out infinite;
}

.state-done {
  animation: camo-done 0.6s ease-out;
}

@keyframes camo-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes camo-thinking {
  0%, 100% { transform: translateY(0) rotate(0); }
  50% { transform: translateY(-4px) rotate(2deg); }
}

@keyframes camo-answering {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.025); }
}

@keyframes camo-alert {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

@keyframes camo-sleepy {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}

@keyframes camo-done {
  0% { transform: scale(1); }
  40% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
</style>
```

---

## 7. Pinia 状态管理

创建：

```text
src/stores/camoStore.ts
```

实现：

```ts
import { defineStore } from "pinia";
import type { CamoEvent, CamoState } from "../core/camo/state";
import { reduceCamoState } from "../core/camo/state";

export const useCamoStore = defineStore("camo", {
  state: () => ({
    state: "idle" as CamoState,
    message: "" as string,
    lastInteractionAt: Date.now(),
  }),

  actions: {
    dispatch(event: CamoEvent, message?: string) {
      this.state = reduceCamoState(event);
      if (message !== undefined) {
        this.message = message;
      }
      this.lastInteractionAt = Date.now();

      if (event.type === "TASK_DONE") {
        window.setTimeout(() => {
          this.state = "idle";
          this.message = "";
        }, 1200);
      }
    },

    setMessage(message: string) {
      this.message = message;
    },

    clearMessage() {
      this.message = "";
    },
  },
});
```

---

## 8. LLM Provider 设计

### 8.1 类型定义

创建：

```text
src/core/llm/types.ts
```

```ts
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  temperature?: number;
  stream?: boolean;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], options: ChatOptions): Promise<string>;
}
```

### 8.2 OpenAI-compatible Provider

创建：

```text
src/core/llm/openaiCompatible.ts
```

要求：

1. 支持自定义 `baseUrl`。
2. 支持 `apiKey`。
3. 支持 `model`。
4. 第一版可以先不做 streaming，后面再加。

```ts
import type { ChatMessage, ChatOptions, LLMProvider } from "./types";

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: options.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}
```

### 8.3 Ollama Provider

创建：

```text
src/core/llm/ollama.ts
```

```ts
import type { ChatMessage, ChatOptions, LLMProvider } from "./types";

export class OllamaProvider implements LLMProvider {
  constructor(private readonly baseUrl = "http://localhost:11434") {}

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.message?.content ?? "";
  }
}
```

---

## 9. Agent 设计

第一版不要实现复杂多 Agent。实现一个轻量 Agent Router。

创建：

```text
src/core/agent/intent.ts
```

```ts
export type UserIntent =
  | "chat"
  | "create_reminder"
  | "list_reminders"
  | "delete_reminder"
  | "change_settings";

export function detectIntent(input: string): UserIntent {
  const text = input.trim();

  if (
    /提醒|叫我|到点|明天|今天|每天|每隔|喝水|久坐|训练|提肛|闹钟/.test(text)
  ) {
    return "create_reminder";
  }

  if (/查看提醒|有哪些提醒|提醒列表/.test(text)) {
    return "list_reminders";
  }

  if (/删除提醒|取消提醒/.test(text)) {
    return "delete_reminder";
  }

  if (/设置|配置|模型|API/.test(text)) {
    return "change_settings";
  }

  return "chat";
}
```

创建：

```text
src/core/agent/agent.ts
```

要求：

1. 接收用户输入。
2. 调用 `detectIntent`。
3. 如果是提醒意图，调用 ReminderService。
4. 如果是普通问答，调用 LLM Provider。
5. 返回统一结果。

```ts
import { detectIntent } from "./intent";
import type { LLMProvider } from "../llm/types";
import { parseReminderFromText } from "../reminder/parser";
import type { ReminderService } from "../reminder/reminderService";

export interface AgentResult {
  type: "chat" | "reminder_created" | "error";
  message: string;
}

export class CamoAgent {
  constructor(
    private readonly llm: LLMProvider,
    private readonly reminderService: ReminderService,
    private readonly getModelName: () => string,
  ) {}

  async handle(input: string): Promise<AgentResult> {
    const intent = detectIntent(input);

    if (intent === "create_reminder") {
      const parsed = parseReminderFromText(input);
      const reminder = await this.reminderService.createReminder(parsed);
      return {
        type: "reminder_created",
        message: `已经记下了：${reminder.title}`,
      };
    }

    const answer = await this.llm.chat(
      [
        {
          role: "system",
          content:
            "你是 Camo，一个简洁、温和、低打扰的桌面个人助手。回答要简短、清楚，默认使用中文。",
        },
        {
          role: "user",
          content: input,
        },
      ],
      {
        model: this.getModelName(),
        temperature: 0.7,
      },
    );

    return {
      type: "chat",
      message: answer,
    };
  }
}
```

---

## 10. Reminder 数据模型

创建：

```text
src/core/reminder/types.ts
```

```ts
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
  nextRunAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## 11. Reminder Parser

创建：

```text
src/core/reminder/parser.ts
```

第一版先用规则解析，不要求完美。后续再接 LLM 结构化解析。

```ts
import type { ReminderInput } from "./types";

function getTodayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() < Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

export function parseReminderFromText(text: string): ReminderInput {
  const normalized = text.trim();

  if (/喝水/.test(normalized)) {
    return {
      title: "喝水提醒",
      type: "water",
      scheduleKind: "interval",
      schedulePayload: {
        start: "09:00",
        end: "22:00",
        everyMinutes: extractIntervalMinutes(normalized) ?? 60,
      },
      enabled: true,
    };
  }

  if (/提肛|健康训练|久坐|放松|训练/.test(normalized)) {
    return {
      title: "健康训练提醒",
      type: "exercise",
      scheduleKind: "fixedTimes",
      schedulePayload: {
        times: ["10:30", "15:30", "21:00"],
      },
      enabled: true,
    };
  }

  const time = extractHourMinute(normalized);

  return {
    title: cleanupReminderTitle(normalized),
    type: "normal",
    scheduleKind: "once",
    schedulePayload: {
      runAt: time ? getTodayAt(time.hour, time.minute) : getTodayAt(10, 0),
    },
    enabled: true,
  };
}

function extractIntervalMinutes(text: string): number | undefined {
  const match = text.match(/每隔?(\d+)\s*(分钟|小时)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "小时") return value * 60;
  return value;
}

function extractHourMinute(text: string): { hour: number; minute: number } | undefined {
  const match = text.match(/(\d{1,2})[:：点](\d{1,2})?/);
  if (!match) return undefined;
  return {
    hour: Number(match[1]),
    minute: match[2] ? Number(match[2]) : 0,
  };
}

function cleanupReminderTitle(text: string): string {
  return text
    .replace(/提醒我/g, "")
    .replace(/提醒/g, "")
    .replace(/叫我/g, "")
    .trim() || "事务提醒";
}
```

---

## 12. Reminder Service

创建：

```text
src/core/reminder/reminderService.ts
```

第一版可以先用 localStorage 实现，随后替换为 SQLite。若项目已经配置 SQLite，则直接接 SQLite。

```ts
import type { Reminder, ReminderInput } from "./types";

const STORAGE_KEY = "camo.reminders";

export class ReminderService {
  async listReminders(): Promise<Reminder[]> {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  async createReminder(input: ReminderInput): Promise<Reminder> {
    const reminders = await this.listReminders();

    const now = new Date().toISOString();

    const reminder: Reminder = {
      ...input,
      id: crypto.randomUUID(),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    reminders.push(reminder);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));

    return reminder;
  }

  async deleteReminder(id: string): Promise<void> {
    const reminders = await this.listReminders();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(reminders.filter((item) => item.id !== id)),
    );
  }

  async updateReminder(reminder: Reminder): Promise<void> {
    const reminders = await this.listReminders();
    const next = reminders.map((item) =>
      item.id === reminder.id
        ? { ...reminder, updatedAt: new Date().toISOString() }
        : item,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}
```

备注：MVP 阶段可用 localStorage 验证流程，但正式版本必须改 SQLite。

---

## 13. Scheduler

创建：

```text
src/core/reminder/scheduler.ts
```

要求：

1. 应用启动时加载提醒。
2. 每 30 秒检查一次到期提醒。
3. MVP 可以接受轻量轮询。
4. 后续优化为系统级调度或 Rust 后端调度。
5. 触发提醒时通知 CamoStore。

```ts
import type { Reminder } from "./types";

export type ReminderCallback = (reminder: Reminder) => void;

export class ReminderScheduler {
  private timer: number | undefined;

  constructor(
    private readonly loadReminders: () => Promise<Reminder[]>,
    private readonly onTrigger: ReminderCallback,
  ) {}

  start() {
    this.stop();

    this.timer = window.setInterval(async () => {
      const reminders = await this.loadReminders();
      const now = Date.now();

      for (const reminder of reminders) {
        if (!reminder.enabled) continue;

        const due = getDueTime(reminder);
        if (due && due <= now) {
          this.onTrigger(reminder);
        }
      }
    }, 30_000);
  }

  stop() {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}

function getDueTime(reminder: Reminder): number | undefined {
  if (reminder.scheduleKind === "once") {
    const runAt = reminder.schedulePayload.runAt;
    if (typeof runAt === "string") {
      return new Date(runAt).getTime();
    }
  }

  return undefined;
}
```

MVP 中 once 提醒触发后应自动关闭：

```ts
reminder.enabled = false;
```

喝水和健康训练的 interval / fixedTimes 可以第二步完善。

---

## 14. ChatPanel 组件

创建：

```text
src/components/ChatPanel.vue
```

功能要求：

1. 输入框。
2. 消息列表。
3. 发送按钮。
4. 调用 CamoAgent。
5. 发送时 Camo 状态变为 thinking。
6. 回复时 Camo 状态变为 answering。
7. 完成后 Camo 状态回到 idle。

UI 要简洁，不要复杂。

---

## 15. ReminderBubble 组件

创建：

```text
src/components/ReminderBubble.vue
```

要求：

1. 显示提醒标题。
2. 显示提醒内容。
3. 有完成按钮。
4. 有稍后按钮。
5. 点击完成后切换 Camo 状态为 done。
6. 点击稍后后延迟 10 分钟再次提醒。

---

## 16. SettingsPanel 组件

创建：

```text
src/components/SettingsPanel.vue
```

MVP 设置项：

```text
LLM Provider
Base URL
API Key
Model
喝水提醒开关
喝水提醒间隔
健康训练开关
Camo 是否置顶
动画等级
```

设置可先存 localStorage，后续迁移 SQLite。

---

## 17. Tauri 窗口配置

`tauri.conf.json` 中应配置主窗口：

```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Camo",
        "width": 220,
        "height": 260,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "resizable": false,
        "skipTaskbar": true
      }
    ]
  }
}
```

实际字段需按当前 Tauri 版本调整。

要求：

1. 透明窗口。
2. 无边框。
3. 置顶。
4. 初始尺寸小。
5. 默认不显示任务栏。
6. 保留系统托盘退出入口。

---

## 18. App.vue 组合逻辑

`App.vue` 应承担轻量组合：

```vue
<script setup lang="ts">
import { onMounted } from "vue";
import CamoPet from "./components/CamoPet.vue";
import ChatPanel from "./components/ChatPanel.vue";
import ReminderBubble from "./components/ReminderBubble.vue";
import { useCamoStore } from "./stores/camoStore";

const camo = useCamoStore();

function handlePetClick() {
  camo.dispatch({ type: "PET_CLICKED" }, "你好，我是 Camo。");
  // 打开聊天面板
}

onMounted(() => {
  camo.dispatch({ type: "APP_READY" });
});
</script>

<template>
  <main class="app-root">
    <CamoPet
      :state="camo.state"
      :message="camo.message"
      @click-pet="handlePetClick"
    />
  </main>
</template>

<style>
html,
body,
#app {
  margin: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
}

.app-root {
  width: 100%;
  height: 100%;
  background: transparent;
}
</style>
```

---

## 19. 主题样式

创建：

```text
src/styles/theme.css
```

```css
:root {
  --camo-primary: #8b5cf6;
  --camo-primary-dark: #5b21b6;
  --camo-primary-light: #ede9fe;
  --camo-bg: #faf7ff;
  --camo-text: #2e2157;
  --camo-muted: #7c6bae;
  --camo-success: #7dd3a8;
  --camo-warning: #facc15;
  --camo-danger: #f87171;
  --camo-shadow: rgba(91, 33, 182, 0.18);
}

* {
  box-sizing: border-box;
}

body {
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}
```

在 `main.ts` 引入：

```ts
import "./styles/theme.css";
```

---

## 20. 托盘菜单

Tauri 端实现托盘菜单：

菜单项：

```text
打开 Camo
打开聊天
今日提醒
暂停提醒 1 小时
设置
退出
```

第一版至少实现：

1. 显示托盘图标。
2. 点击“显示 / 隐藏”切换窗口显示。
3. 点击“退出”退出应用。

如托盘开发复杂，允许在 MVP 中先放入第二阶段，但 README 要标记未完成。

---

## 21. 开发任务拆分

### Task 1：初始化项目

目标：

1. 创建 Tauri + Vue + TypeScript 项目。
2. 配置 pnpm。
3. 启动开发环境。

验收：

```bash
pnpm install
pnpm tauri dev
```

可以启动桌面窗口。

---

### Task 2：导入 Camo 素材

目标：

1. 将 `Camo_asset` 中图片复制到 `public/camo/`。
2. 创建 `src/core/camo/assets.ts`。
3. 创建 `src/core/camo/state.ts`。

验收：

1. 页面可以显示 `camo_idle.png`。
2. 切换 state 可以切换图片。

---

### Task 3：实现桌宠悬浮窗

目标：

1. 创建 `CamoPet.vue`。
2. 实现透明背景。
3. 实现 CSS 动画。
4. 实现点击事件。

验收：

1. 桌面上显示 Camo。
2. 窗口无边框。
3. Camo 有轻微浮动动画。
4. 点击 Camo 有反馈。

---

### Task 4：实现聊天面板

目标：

1. 创建 `ChatPanel.vue`。
2. 实现输入框和消息列表。
3. 实现发送消息。
4. 暂时用 mock 回答。

验收：

1. 点击 Camo 打开聊天面板。
2. 输入问题后显示用户消息。
3. 显示 mock 回复。
4. Camo 状态按 thinking → answering → idle 流转。

---

### Task 5：接入 LLM

目标：

1. 实现 OpenAI-compatible Provider。
2. 实现 Ollama Provider。
3. 设置页配置 provider、baseUrl、apiKey、model。
4. ChatPanel 使用真实 LLM 回复。

验收：

1. 配置 Ollama 后可本地问答。
2. 配置 OpenAI-compatible API 后可远程问答。
3. 请求失败时显示错误，不崩溃。

---

### Task 6：实现提醒解析和创建

目标：

1. 实现 `detectIntent`。
2. 实现 `parseReminderFromText`。
3. 实现 `ReminderService`。
4. 用户输入提醒语句时创建提醒。

验收：

输入：

```text
明天上午10点提醒我喝水
```

或：

```text
每隔1小时提醒我喝水
```

系统返回：

```text
已经记下了：喝水提醒
```

并写入本地存储。

---

### Task 7：实现提醒触发

目标：

1. 实现 `ReminderScheduler`。
2. 应用启动时启动 scheduler。
3. 提醒触发时切换 Camo 状态。
4. 显示提醒气泡。

验收：

1. 创建 1 分钟后的提醒。
2. 到点后 Camo 切换到 reminder。
3. 显示提醒内容。
4. 点击完成后 Camo 切换 done，然后回到 idle。

---

### Task 8：实现喝水提醒

目标：

1. 设置页添加喝水提醒开关。
2. 支持间隔提醒。
3. 触发时 Camo 状态为 water。

验收：

1. 开启喝水提醒。
2. 设置测试间隔，例如 1 分钟。
3. 到点后显示喝水提醒。
4. 可完成、稍后、今天暂停。

---

### Task 9：实现健康训练提醒

目标：

1. 设置页添加健康训练开关。
2. 支持固定时间或测试间隔。
3. 触发时 Camo 状态为 exercise。

验收：

1. 开启健康训练提醒。
2. 到点后显示健康训练提醒。
3. 文案使用“健康训练 / 久坐放松 / 放松训练”，不要强制显示敏感表达。
4. 可完成、稍后、跳过。

---

### Task 10：持久化迁移到 SQLite

目标：

1. 用 SQLite 保存 reminders、settings、chat messages。
2. 应用重启后数据仍存在。
3. 保留数据访问层，不让组件直接访问 SQLite。

建议表结构：

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  schedule_kind TEXT NOT NULL,
  schedule_payload TEXT NOT NULL,
  next_run_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

验收：

1. 创建提醒后重启应用，提醒仍在。
2. 修改设置后重启应用，设置仍在。
3. 聊天记录可保存和读取。

---

## 22. 资源占用优化要求

MVP 就要注意资源占用：

1. 不要使用高频 setInterval。
2. 动画使用 CSS transform，不要 JS 逐帧动画。
3. 默认不加载复杂动画库。
4. LLM 只在用户主动输入时调用。
5. 提醒调度间隔不要低于 10 秒。
6. 空闲时只显示 Camo，不打开聊天面板。
7. 图片使用 PNG 或 WebP，控制尺寸。
8. 不要在前端保留过大的聊天上下文。

---

## 23. README 要求

Codex 需要生成 README，至少包含：

```text
项目介绍
技术栈
目录结构
如何运行
如何配置 LLM
如何放置 Camo 素材
如何创建提醒
当前已完成功能
待开发功能
```

运行命令示例：

```bash
pnpm install
pnpm tauri dev
```

构建命令：

```bash
pnpm tauri build
```

---

## 24. Codex 执行规则

Codex 实现时请遵守：

1. 优先完成可运行 MVP。
2. 不要一次性引入复杂框架。
3. 不要删除用户已有素材。
4. 所有 Camo 图片从 `Camo_asset` 复制或映射。
5. 如果素材缺失，用 fallback 显示 idle。
6. 组件和业务逻辑分离。
7. LLM 调用失败不能导致应用崩溃。
8. 提醒必须可持久化。
9. 代码必须 TypeScript 类型明确。
10. 每完成一个 Task，更新 README 的进度。

---

## 25. 最小验收清单

最终至少满足：

- [ ] 应用可以通过 `pnpm tauri dev` 启动。
- [ ] 桌面显示 Camo。
- [ ] Camo 图片来自 `Camo_asset`。
- [ ] Camo 支持 idle / thinking / answering / reminder / water / exercise / done 状态。
- [ ] 点击 Camo 打开聊天输入。
- [ ] 可以配置 LLM。
- [ ] 可以进行普通问答。
- [ ] 可以创建普通提醒。
- [ ] 可以创建喝水提醒。
- [ ] 可以创建健康训练提醒。
- [ ] 提醒触发时 Camo 状态变化。
- [ ] 提醒触发时出现气泡。
- [ ] 用户点击完成后状态变为 done。
- [ ] 应用重启后提醒和设置不丢失。
- [ ] README 写清楚运行方式。

---

## 26. 建议第一轮交付范围

如果时间有限，第一轮只交付：

1. Tauri 桌面窗口。
2. Camo 图片显示。
3. Camo 状态切换。
4. ChatPanel mock 问答。
5. localStorage 提醒。
6. 1 分钟测试提醒。
7. 基础 UI。

第二轮再交付：

1. LLM 接入。
2. SQLite。
3. 托盘菜单。
4. 喝水和健康训练完整规则。
5. 设置页。

这样可以确保项目不会因为一次性目标过大而无法运行。
