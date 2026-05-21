import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { LLMConfig } from "../core/llm/types";
import { defaultLLMConfig } from "../core/llm/types";
import { dbAll, dbRun } from "../core/storage/database";
import { isCamoTheme, type CamoTheme } from "../core/camo/assets";

export interface WaterReminderConfig {
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  endTime: string;
}

export interface LayoutConfig {
  scale: number;
  pet: WindowFrame;
  chat: WindowFrame;
  settings: WindowFrame;
  reminders: WindowFrame;
}

export interface WindowFrame {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export type DarkModePreference = "auto" | "light" | "dark";
export type FontSizePreset = "small" | "medium" | "large";
export type StatusIndicatorStyle = "dot" | "pill" | "hidden";
export type StatusColorPreset = "default" | "cool" | "warm";
export type BubbleStylePreset = "compact" | "standard" | "soft";
export type PositionMode = "left-bottom" | "right-bottom" | "free";

export interface AppearanceConfig {
  fontFamily: string;
  fontSizePreset: FontSizePreset;
  fontSizePx: number;
  uiFontSizePx: number;
  darkMode: DarkModePreference;
  darkStartTime: string;
  darkEndTime: string;
  panelOpacity: number;
  statusIndicatorStyle: StatusIndicatorStyle;
  statusColorPreset: StatusColorPreset;
  bubbleStyle: BubbleStylePreset;
  bubbleOpacity: number;
  bubbleRadius: number;
  reminderSound: "off" | "simple" | "custom";
  soundVolume: number;
  customSoundPaths: { water: string; exercise: string; normal: string };
  customSoundNames: { water: string; exercise: string; normal: string };
}

export interface WindowBehaviorConfig {
  alwaysOnTop: boolean;
  locked: boolean;
  opacity: number;
  rememberPosition: boolean;
  positionMode: PositionMode;
}

export interface WindowPreferencesConfig {
  pet: WindowBehaviorConfig;
  tools: WindowBehaviorConfig;
}

export interface SystemPreferencesConfig {
  autostart: boolean;
}

export interface CamoSettings {
  llm: LLMConfig;
  waterReminder: WaterReminderConfig;
  systemPrompt: string;
  theme: CamoTheme;
  layout: LayoutConfig;
  appearance: AppearanceConfig;
  windowPreferences: WindowPreferencesConfig;
  systemPreferences: SystemPreferencesConfig;
}

const defaultSettings: CamoSettings = {
  llm: { ...defaultLLMConfig },
  waterReminder: {
    enabled: false,
    intervalMinutes: 60,
    startTime: "09:00",
    endTime: "22:00",
  },
  systemPrompt: "你是 Camo，一个简洁、温和的桌面个人助手。回答简短清楚，默认中文。",
  theme: "grey",
  layout: {
    scale: 1,
    pet: { width: 180, height: 210 },
    chat: { width: 380, height: 560 },
    settings: { width: 360, height: 420 },
    reminders: { width: 340, height: 460 },
  },
  appearance: {
    fontFamily: "system",
    fontSizePreset: "medium",
    fontSizePx: 14,
    uiFontSizePx: 14,
    darkMode: "auto",
    darkStartTime: "20:00",
    darkEndTime: "07:00",
    panelOpacity: 0.92,
    statusIndicatorStyle: "dot",
    statusColorPreset: "default",
    bubbleStyle: "standard",
    bubbleOpacity: 0.96,
    bubbleRadius: 16,
    reminderSound: "simple",
    soundVolume: 0.5,
    customSoundPaths: { water: "", exercise: "", normal: "" },
    customSoundNames: { water: "", exercise: "", normal: "" },
  },
  windowPreferences: {
    pet: {
      alwaysOnTop: true,
      locked: false,
      opacity: 1,
      rememberPosition: true,
      positionMode: "free",
    },
    tools: {
      alwaysOnTop: true,
      locked: false,
      opacity: 0.96,
      rememberPosition: true,
      positionMode: "free",
    },
  },
  systemPreferences: {
    autostart: false,
  },
};

const SETTINGS_SYNC_KEY = "camo.settings.sync";
const settingsSourceId = crypto.randomUUID();
let applyingRemoteSettings = false;

function normalizeSettings(settings: Partial<CamoSettings>): CamoSettings {
  const incomingLayout = (settings.layout ?? {}) as Partial<LayoutConfig> & { offsetX?: number; offsetY?: number };
  const normalizedLayout: LayoutConfig = {
    scale: typeof incomingLayout.scale === "number" ? incomingLayout.scale : defaultSettings.layout.scale,
    pet: {
      ...defaultSettings.layout.pet,
      ...(incomingLayout.pet ?? {}),
      x: incomingLayout.pet?.x ?? incomingLayout.offsetX,
      y: incomingLayout.pet?.y ?? incomingLayout.offsetY,
    },
    chat: { ...defaultSettings.layout.chat, ...(incomingLayout.chat ?? {}) },
    settings: { ...defaultSettings.layout.settings, ...(incomingLayout.settings ?? {}) },
    reminders: { ...defaultSettings.layout.reminders, ...(incomingLayout.reminders ?? {}) },
  };
  const normalizedAppearance: AppearanceConfig = {
    ...defaultSettings.appearance,
    ...(settings.appearance ?? {}),
  };
  const normalizedWindowPreferences: WindowPreferencesConfig = {
    pet: {
      ...defaultSettings.windowPreferences.pet,
      ...(settings.windowPreferences?.pet ?? {}),
    },
    tools: {
      ...defaultSettings.windowPreferences.tools,
      ...(settings.windowPreferences?.tools ?? {}),
    },
  };
  const normalizedSystemPreferences: SystemPreferencesConfig = {
    ...defaultSettings.systemPreferences,
    ...(settings.systemPreferences ?? {}),
  };

  return {
    ...defaultSettings,
    ...settings,
    llm: { ...defaultLLMConfig, ...(settings.llm ?? {}) },
    waterReminder: { ...defaultSettings.waterReminder, ...(settings.waterReminder ?? {}) },
    layout: normalizedLayout,
    appearance: normalizedAppearance,
    windowPreferences: normalizedWindowPreferences,
    systemPreferences: normalizedSystemPreferences,
    theme: isCamoTheme(settings.theme) ? settings.theme : "grey",
  };
}

function loadSettings(): CamoSettings {
  try {
    const rows = dbAll<{ key: string; value: string }>("SELECT key, value FROM settings");
    if (rows.length > 0) {
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      return normalizeSettings({
        llm: map.llm ? JSON.parse(map.llm) : { ...defaultLLMConfig },
        waterReminder: map.waterReminder ? JSON.parse(map.waterReminder) : defaultSettings.waterReminder,
        systemPrompt: map.systemPrompt ?? defaultSettings.systemPrompt,
        theme: (map.theme as CamoTheme) ?? "grey",
        layout: map.layout ? JSON.parse(map.layout) : defaultSettings.layout,
        appearance: map.appearance ? JSON.parse(map.appearance) : defaultSettings.appearance,
        windowPreferences: map.windowPreferences ? JSON.parse(map.windowPreferences) : defaultSettings.windowPreferences,
        systemPreferences: map.systemPreferences ? JSON.parse(map.systemPreferences) : defaultSettings.systemPreferences,
      });
    }
  } catch {}
  try {
    const raw = localStorage.getItem("camo.settings");
    if (raw) return normalizeSettings({ ...defaultSettings, ...JSON.parse(raw) });
  } catch {}
  return { ...defaultSettings };
}

function saveSettings(val: CamoSettings) {
  try {
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["llm", JSON.stringify(val.llm)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["waterReminder", JSON.stringify(val.waterReminder)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["systemPrompt", val.systemPrompt]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["theme", val.theme]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["layout", JSON.stringify(val.layout)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["appearance", JSON.stringify(val.appearance)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["windowPreferences", JSON.stringify(val.windowPreferences)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["systemPreferences", JSON.stringify(val.systemPreferences)]);
  } catch {
    localStorage.setItem("camo.settings", JSON.stringify(val));
  }
  try {
    localStorage.setItem(SETTINGS_SYNC_KEY, JSON.stringify({
      source: settingsSourceId,
      settings: val,
      updatedAt: Date.now(),
    }));
  } catch {}
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<CamoSettings>(loadSettings());

  watch(settings, (val) => {
    if (applyingRemoteSettings) return;
    saveSettings(val);
  }, { deep: true });

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== SETTINGS_SYNC_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as { source?: string; settings?: Partial<CamoSettings> };
        if (payload.source === settingsSourceId || !payload.settings) return;
        applyingRemoteSettings = true;
        settings.value = normalizeSettings(payload.settings);
        queueMicrotask(() => { applyingRemoteSettings = false; });
      } catch {}
    });
  }

  function updateLLM(config: Partial<LLMConfig>) {
    settings.value.llm = { ...settings.value.llm, ...config };
  }

  function updateWaterReminder(config: Partial<WaterReminderConfig>) {
    settings.value.waterReminder = { ...settings.value.waterReminder, ...config };
  }

  function updateSystemPrompt(prompt: string) {
    settings.value.systemPrompt = prompt;
  }

  function updateTheme(theme: CamoTheme) {
    settings.value.theme = theme;
  }

  function updateLayout(layout: Partial<LayoutConfig>) {
    settings.value.layout = { ...settings.value.layout, ...layout };
  }

  function updateAppearance(appearance: Partial<AppearanceConfig>) {
    settings.value.appearance = { ...settings.value.appearance, ...appearance };
  }

  function updateWindowPreferences(preferences: Partial<WindowPreferencesConfig>) {
    settings.value.windowPreferences = {
      pet: { ...settings.value.windowPreferences.pet, ...(preferences.pet ?? {}) },
      tools: { ...settings.value.windowPreferences.tools, ...(preferences.tools ?? {}) },
    };
  }

  function updateSystemPreferences(preferences: Partial<SystemPreferencesConfig>) {
    settings.value.systemPreferences = { ...settings.value.systemPreferences, ...preferences };
  }

  return {
    settings,
    updateLLM,
    updateWaterReminder,
    updateSystemPrompt,
    updateTheme,
    updateLayout,
    updateAppearance,
    updateWindowPreferences,
    updateSystemPreferences,
  };
});
