import { defineStore } from "pinia";
import { ref } from "vue";
import { getTodayStats, getReminderCounts, getAffectionScore, type TodayStats, type ReminderCounts } from "../core/stats/service";

export const useStatsStore = defineStore("stats", () => {
  const todayStats = ref<TodayStats>({ totalEvents: 0, netDelta: 0, breakdown: {} });
  const reminderCounts = ref<ReminderCounts>({ total: 0, water: 0, exercise: 0, normal: 0 });
  const affectionScore = ref(50);

  function refresh() {
    todayStats.value = getTodayStats();
    reminderCounts.value = getReminderCounts();
    affectionScore.value = getAffectionScore();
  }

  return { todayStats, reminderCounts, affectionScore, refresh };
});
