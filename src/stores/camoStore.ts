import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getCamoAsset, getCamoIdleFrame } from "../core/camo/assets";
import { reduceCamoState, type CamoEvent, type CamoState } from "../core/camo/state";
import { useSettingsStore } from "./settingsStore";

const IDLE_FRAME_COUNT = 6;
const IDLE_CYCLE_MIN = 12_000;
const IDLE_CYCLE_MAX = 25_000;

export const useCamoStore = defineStore("camo", () => {
  const state = ref<CamoState>(reduceCamoState({ type: "APP_READY" }));
  const idleFrame = ref(0);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idleCycleTimer: ReturnType<typeof setInterval> | undefined;

  const settingsStore = useSettingsStore();

  const asset = computed(() => {
    const theme = settingsStore.settings.theme;
    if (state.value === "idle") {
      return getCamoIdleFrame(idleFrame.value, theme);
    }
    return getCamoAsset(state.value, theme);
  });

  function clearIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; }
  }

  function startIdleCycle() {
    stopIdleCycle();
    idleFrame.value = 0;
    idleCycleTimer = setInterval(() => {
      idleFrame.value = (idleFrame.value + 1) % IDLE_FRAME_COUNT;
    }, IDLE_CYCLE_INTERVAL);
  }

  function stopIdleCycle() {
    if (idleCycleTimer) { clearInterval(idleCycleTimer); idleCycleTimer = undefined; }
    idleFrame.value = 0;
  }

  function transition(event: CamoEvent) {
    clearIdleTimer();
    stopIdleCycle();
    state.value = reduceCamoState(event);
    if (state.value === "idle") startIdleCycle();
  }

  function returnToIdle(delay = 900) {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      state.value = reduceCamoState({ type: "LLM_STREAM_END" });
      idleTimer = undefined;
      startIdleCycle();
    }, delay);
  }

  startIdleCycle();

  return { state, asset, transition, returnToIdle };
});
