import type { CamoState } from "./state";

export type CamoTheme = "grey" | "perple";

export function isCamoTheme(theme: unknown): theme is CamoTheme {
  return theme === "grey" || theme === "perple";
}

const stateToFile: Record<CamoState, string> = {
  idle: "camo_idle.png",
  happy: "camo_happy.png",
  thinking: "camo_thinking.png",
  answering: "camo_answering.png",
  reminder: "camo_reminder.png",
  water: "camo_water.png",
  exercise: "camo_exercise.png",
  sleepy: "camo_sleepy.png",
  done: "camo_done.png",
};

// frame 0 = camo_idle.png, 1-5 = camo_idle1.png ~ camo_idle5.png
const idleFrameFiles = [
  "camo_idle.png",
  "camo_idle1.png",
  "camo_idle2.png",
  "camo_idle3.png",
  "camo_idle4.png",
  "camo_idle5.png",
];

export function getCamoAsset(state: CamoState, theme: CamoTheme = "grey"): string {
  return `/camo/${theme}/${stateToFile[state] ?? stateToFile.idle}`;
}

export function getCamoIdleFrame(frame: number, theme: CamoTheme = "grey"): string {
  return `/camo/${theme}/${idleFrameFiles[frame % idleFrameFiles.length]}`;
}

export function getCamoIcon(theme: CamoTheme = "grey"): string {
  return `/camo/${theme}/camo_icon.png`;
}
