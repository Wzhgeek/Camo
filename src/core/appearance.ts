import type { AppearanceConfig, DarkModePreference } from "../stores/settingsStore";

const FONT_STACK: Record<string, string> = {
  system: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  serif: "Georgia, \"Times New Roman\", serif",
  mono: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace",
};

const FONT_SIZE_MAP = {
  small: 12,
  medium: 14,
  large: 16,
} as const;

export function resolveDarkMode(appearance: AppearanceConfig): "light" | "dark" {
  if (appearance.darkMode === "light" || appearance.darkMode === "dark") return appearance.darkMode;
  return isNowInTimeRange(appearance.darkStartTime, appearance.darkEndTime) ? "dark" : "light";
}

export function nextDarkModePreference(current: DarkModePreference): DarkModePreference {
  if (current === "auto") return "dark";
  if (current === "dark") return "light";
  return "auto";
}

export function darkModeLabel(mode: DarkModePreference): string {
  if (mode === "auto") return "深色：自动";
  if (mode === "dark") return "深色：开启";
  return "深色：关闭";
}

export function applyAppearance(appearance: AppearanceConfig) {
  const root = document.documentElement;
  const activeTheme = resolveDarkMode(appearance);
  const fontSize = appearance.fontSizePreset === "medium"
    ? appearance.fontSizePx
    : FONT_SIZE_MAP[appearance.fontSizePreset];

  root.dataset.camoTheme = activeTheme;
  root.dataset.camoStatusPreset = appearance.statusColorPreset;
  root.dataset.camoBubbleStyle = appearance.bubbleStyle;
  root.style.setProperty("--camo-font-family", FONT_STACK[appearance.fontFamily] ?? FONT_STACK.system);
  root.style.setProperty("--camo-font-size", `${fontSize}px`);
  root.style.setProperty("--camo-text", appearance.textColor);
  root.style.setProperty("--camo-panel-opacity", String(appearance.panelOpacity));
  root.style.setProperty("--camo-bubble-opacity", String(appearance.bubbleOpacity));
  root.style.setProperty("--camo-bubble-opacity-pct", `${Math.round(appearance.bubbleOpacity * 100)}%`);
  root.style.setProperty("--camo-bubble-radius", `${appearance.bubbleRadius}px`);
}

function isNowInTimeRange(start: string, end: string): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  if (startMin === endMin) return false;
  if (startMin < endMin) return current >= startMin && current < endMin;
  return current >= startMin || current < endMin;
}

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}
