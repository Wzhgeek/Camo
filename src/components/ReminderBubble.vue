<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useReminderStore } from "../stores/reminderStore";
import { useCamoStore } from "../stores/camoStore";
import { useAffectionStore } from "../stores/affectionStore";
import { reminderService } from "../core/reminder/reminderService";
import type { Reminder } from "../core/reminder/types";
import { closeCurrentWindow, currentWindowKind } from "../core/windowManager";
import { Droplets, Dumbbell, Bell } from "lucide-vue-next";

const HIGH_AFFECTION_TITLES: Record<string, string> = {
  water: "宝，渴了不？来一口！",
  exercise: "屁股麻了吧，起来扭扭~",
  normal: "别忘了哦，我记得的！",
};

const reminder = useReminderStore();
const camo = useCamoStore();
const affection = useAffectionStore();
const { activeReminder } = storeToRefs(reminder);
const routeReminderId = new URLSearchParams(window.location.search).get("reminderId");
const isAlertWindow = currentWindowKind === "reminder-alert";

const displayTitle = computed(() => {
  const r = activeReminder.value;
  if (!r) return "";
  if (affection.score <= 70) return r.title;
  return HIGH_AFFECTION_TITLES[r.type] ?? r.title;
});

onMounted(() => {
  if (!routeReminderId || activeReminder.value) return;
  const triggeredReminder = reminderService.list().find((item) => item.id === routeReminderId) ?? readTriggeredReminder(routeReminderId);
  if (triggeredReminder) reminder.trigger(triggeredReminder);
});

function readTriggeredReminder(id: string): Reminder | null {
  try {
    const raw = localStorage.getItem(`camo.activeReminder.${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearTriggeredReminder() {
  if (routeReminderId) localStorage.removeItem(`camo.activeReminder.${routeReminderId}`);
}

function publishReminderAction(action: "done" | "later" | "skip") {
  localStorage.setItem("camo.reminderAction", JSON.stringify({
    action,
    reminderId: activeReminder.value?.id,
    reminderType: activeReminder.value?.type,
    createdAt: Date.now(),
  }));
}

function dismissWindowIfNeeded() {
  if (isAlertWindow) closeCurrentWindow().catch(() => {});
}

function startAlertDrag(e: PointerEvent) {
  if (!isAlertWindow) return;
  const target = e.target as HTMLElement;
  if (target.closest("button")) return;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
    .catch(() => {});
}

function disableIfOnce() {
  if (activeReminder.value?.scheduleKind === "once") {
    reminderService.update(activeReminder.value.id, { enabled: false });
    reminder.refreshReminders();
  }
}

function done() {
  disableIfOnce();
  camo.transition({ type: "TASK_DONE" });
  camo.returnToIdle(2500);
  publishReminderAction("done");
  reminder.dismiss();
  clearTriggeredReminder();
  dismissWindowIfNeeded();
}

function later() {
  if (activeReminder.value) {
    if (activeReminder.value.id !== "__water__") {
      const laterTime = new Date(Date.now() + 10 * 60000).toISOString();
      reminderService.update(activeReminder.value.id, {
        enabled: true,
        scheduleKind: "once",
        schedulePayload: { ...activeReminder.value.schedulePayload, runAt: laterTime },
      });
      reminder.refreshReminders();
    }
  }
  publishReminderAction("later");
  reminder.dismiss();
  camo.returnToIdle(400);
  clearTriggeredReminder();
  dismissWindowIfNeeded();
}

function skip() {
  disableIfOnce();
  publishReminderAction("skip");
  reminder.dismiss();
  camo.returnToIdle(400);
  clearTriggeredReminder();
  dismissWindowIfNeeded();
}
</script>

<template>
  <div v-if="activeReminder" data-camo-surface class="reminder-bubble" @pointerdown="startAlertDrag" @click.stop>
    <button v-if="isAlertWindow" class="bubble-close" @pointerdown.stop @click="skip" aria-label="关闭提醒">×</button>
    <div class="bubble-icon">
      <Droplets v-if="activeReminder.type === 'water'" :size="28" color="#7c3aed" />
      <Dumbbell v-else-if="activeReminder.type === 'exercise'" :size="28" color="#22c55e" />
      <Bell v-else :size="28" color="#7c3aed" />
    </div>
    <p class="bubble-title">{{ displayTitle }}</p>
    <div class="bubble-actions">
      <button class="bubble-btn primary" @click="done">完成</button>
      <button class="bubble-btn" @click="later">稍后</button>
      <button class="bubble-btn muted" @click="skip">跳过</button>
    </div>
  </div>
</template>

<style scoped>
.reminder-bubble {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 240px;
  padding: 16px;
  border-radius: var(--camo-bubble-radius);
  background: color-mix(in srgb, var(--camo-surface-strong) var(--camo-bubble-opacity-pct), transparent);
  border: 1px solid var(--camo-border);
  box-shadow: 0 16px 48px rgba(53, 42, 70, 0.2);
  backdrop-filter: blur(20px);
  z-index: 8000;
  text-align: center;
}
.bubble-close {
  position: absolute;
  top: 8px;
  right: 9px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--camo-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.bubble-close:hover {
  background: rgba(127, 90, 240, 0.1);
  color: var(--camo-bubble-text);
}
:global(.window-reminder-alert) .reminder-bubble {
  position: relative;
  width: min(260px, calc(100vw - 24px));
  cursor: grab;
  box-shadow: 0 12px 32px rgba(53, 42, 70, 0.14);
}
:global(.window-reminder-alert) .reminder-bubble:active {
  cursor: grabbing;
}
html[data-camo-bubble-style="compact"] .reminder-bubble {
  width: 210px;
  padding: 12px;
}
html[data-camo-bubble-style="soft"] .reminder-bubble {
  box-shadow: 0 10px 36px rgba(127, 90, 240, 0.18);
}

.bubble-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.bubble-title {
  margin: 0 0 14px;
  font-size: var(--camo-font-size);
  font-weight: 600;
  color: var(--camo-bubble-text);
}

.bubble-actions {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.bubble-btn {
  padding: 6px 12px;
  border: 1px solid rgba(79, 58, 105, 0.14);
  border-radius: 8px;
  background: var(--camo-surface);
  color: var(--camo-bubble-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.bubble-btn:hover {
  background: rgba(127, 90, 240, 0.08);
}

.bubble-btn.primary {
  background: var(--camo-primary);
  border-color: var(--camo-primary);
  color: #fff;
}

.bubble-btn.primary:hover {
  background: #6b46e0;
}

.bubble-btn.muted {
  color: #9a8fb5;
  border-color: transparent;
}
</style>
