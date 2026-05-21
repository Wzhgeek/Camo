import { defineStore } from "pinia";
import { ref } from "vue";
import {
  getState,
  saveState,
  adjust as adjustService,
  reset as resetService,
  buildAffectionContext,
  stageLabel,
  type AffectionState,
} from "../core/affection/service";

function nowISO(): string {
  return new Date().toISOString();
}

export const useAffectionStore = defineStore("affection", () => {
  const state = ref<AffectionState>(getState());

  const score = ref(state.value.score);
  const stage = ref(stageLabel(state.value.score));
  const context = ref(buildAffectionContext(state.value.score, state.value.lastClose));

  function sync() {
    score.value = state.value.score;
    stage.value = stageLabel(state.value.score);
    context.value = buildAffectionContext(state.value.score, state.value.lastClose);
  }

  function adjust(reason: string, delta: number, options?: { dailyLimit?: number }) {
    state.value = adjustService(reason, delta, options);
    sync();
  }

  function markInteraction() {
    state.value = { ...state.value, lastInteraction: nowISO() };
    saveState(state.value);
  }

  function markClose() {
    state.value = { ...state.value, lastClose: nowISO() };
    saveState(state.value);
  }

  function resetScore() {
    state.value = resetService();
    sync();
  }

  function refresh() {
    state.value = getState();
    sync();
  }

  return { state, score, stage, context, adjust, markInteraction, markClose, resetScore, refresh };
});
