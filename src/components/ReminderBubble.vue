<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useReminderStore } from "../stores/reminderStore";
import { useCamoStore } from "../stores/camoStore";
import { reminderService } from "../core/reminder/reminderService";
import { Droplets, Dumbbell, Bell } from "lucide-vue-next";

const reminder = useReminderStore();
const camo = useCamoStore();
const { activeReminder } = storeToRefs(reminder);

function disableIfOnce() {
  if (activeReminder.value?.scheduleKind === "once") {
    reminderService.update(activeReminder.value.id, { enabled: false });
    reminder.refreshReminders();
  }
}

function done() {
  disableIfOnce();
  camo.transition({ type: "TASK_DONE" });
  camo.returnToIdle(1200);
  reminder.dismiss();
}

function later() {
  if (activeReminder.value) {
    const laterTime = new Date(Date.now() + 10 * 60000).toISOString();
    reminderService.update(activeReminder.value.id, {
      enabled: true,
      schedulePayload: { ...activeReminder.value.schedulePayload, runAt: laterTime },
    });
  }
  reminder.dismiss();
  camo.returnToIdle(400);
}

function skip() {
  disableIfOnce();
  reminder.dismiss();
  camo.returnToIdle(400);
}
</script>

<template>
  <div v-if="activeReminder" data-camo-surface class="reminder-bubble" @click.stop>
    <div class="bubble-icon">
      <Droplets v-if="activeReminder.type === 'water'" :size="28" color="#7c3aed" />
      <Dumbbell v-else-if="activeReminder.type === 'exercise'" :size="28" color="#22c55e" />
      <Bell v-else :size="28" color="#7c3aed" />
    </div>
    <p class="bubble-title">{{ activeReminder.title }}</p>
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
  font-size: 14px;
  font-weight: 600;
  color: var(--camo-text);
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
  color: var(--camo-text);
  font-size: 12px;
  font-weight: 600;
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
