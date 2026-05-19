import type { CamoState } from "./state";

export const camoAssetByState: Record<CamoState, string> = {
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

export const camoIconAsset = "/camo/camo_icon.png";

export function getCamoAsset(state: CamoState): string {
  return camoAssetByState[state] ?? camoAssetByState.idle;
}
