import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getCamoAsset } from "../core/camo/assets";
import { reduceCamoState, type CamoEvent, type CamoState } from "../core/camo/state";

export const useCamoStore = defineStore("camo", () => {
  const state = ref<CamoState>(reduceCamoState({ type: "APP_READY" }));
  const asset = computed(() => getCamoAsset(state.value));
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  }

  function transition(event: CamoEvent) {
    clearIdleTimer();
    state.value = reduceCamoState(event);
  }

  function returnToIdle(delay = 900) {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      state.value = reduceCamoState({ type: "LLM_STREAM_END" });
      idleTimer = undefined;
    }, delay);
  }

  return {
    state,
    asset,
    transition,
    returnToIdle,
  };
});
