import { defineStore } from "pinia";
import { ref } from "vue";
import type { Reminder } from "../core/reminder/types";

export const useReminderStore = defineStore("reminder", () => {
  const activeReminder = ref<Reminder | null>(null);
  const nextWaterAt = ref<number>(0);
  const nextTriggerMap = ref<Record<string, number>>({});

  function trigger(reminder: Reminder) {
    activeReminder.value = reminder;
  }

  function dismiss() {
    activeReminder.value = null;
  }

  function setNextWaterAt(ts: number) {
    nextWaterAt.value = ts;
  }

  function setNextTrigger(id: string, ts: number) {
    nextTriggerMap.value = { ...nextTriggerMap.value, [id]: ts };
  }

  return { activeReminder, nextWaterAt, nextTriggerMap, trigger, dismiss, setNextWaterAt, setNextTrigger };
});
