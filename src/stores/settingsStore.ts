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
  notes: WindowFrame;
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

export const ROLE_PRESETS: Record<string, string> = {
  friendly: "你是 Camo，一个简洁、温和的桌面个人助手。回答简短清楚，默认中文。",
  lively: "你是 Camo，一个活泼开朗的桌面小伙伴！说话带劲，喜欢开玩笑，偶尔用点 emoji 让气氛活跃起来。",
  gentle: "你是 Camo，一个温柔体贴的陪伴助手。说话轻声细语，多关心用户的感受，像朋友一样温暖。",
  cool: "你是 Camo，一个冷静高效的助手。回答简洁精准，不啰嗦，不闲聊，只干正事。",
  cute: "你是 Camo，一个可爱的桌宠妹妹~ 说话软萌，喜欢用颜文字和 emoji，爱撒娇，超粘人！",
};

export const ROLE_LABELS: Record<string, string> = {
  friendly: "亲切（默认）",
  lively: "活泼",
  gentle: "温柔",
  cool: "高冷",
  cute: "可爱",
};

export interface CamoSettings {
  llm: LLMConfig;
  waterReminder: WaterReminderConfig;
  rolePreset: string;
  systemPrompt: string;
  theme: CamoTheme;
  layout: LayoutConfig;
  stickyNote: string;
  stickyNoteEnabled: boolean;
  stickyNotes: StickyNoteConfig[];
  focusDuration: number;
  breakDuration: number;
  appearance: AppearanceConfig;
  windowPreferences: WindowPreferencesConfig;
  systemPreferences: SystemPreferencesConfig;
}

export interface StickyNoteConfig {
  id: string;
  text: string;
  enabled: boolean;
  x?: number;
  y?: number;
}

const defaultSettings: CamoSettings = {
  llm: { ...defaultLLMConfig },
  waterReminder: {
    enabled: false,
    intervalMinutes: 60,
    startTime: "09:00",
    endTime: "22:00",
  },
  rolePreset: "friendly",
  systemPrompt: ROLE_PRESETS.friendly,
  stickyNote: "",
  stickyNoteEnabled: false,
  stickyNotes: [],
  focusDuration: 25,
  breakDuration: 5,
  theme: "grey",
  layout: {
    scale: 1,
    pet: { width: 180, height: 210 },
    chat: { width: 380, height: 560 },
    settings: { width: 360, height: 420 },
    reminders: { width: 340, height: 460 },
    notes: { width: 340, height: 420 },
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
    notes: { ...defaultSettings.layout.notes, ...(incomingLayout.notes ?? {}) },
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
    stickyNotes: normalizeStickyNotes(settings),
    layout: normalizedLayout,
    appearance: normalizedAppearance,
    windowPreferences: normalizedWindowPreferences,
    systemPreferences: normalizedSystemPreferences,
    theme: isCamoTheme(settings.theme) ? settings.theme : "grey",
  };
}

function normalizeStickyNotes(settings: Partial<CamoSettings>): StickyNoteConfig[] {
  const notes = Array.isArray(settings.stickyNotes) ? settings.stickyNotes : [];
  if (notes.length > 0) {
    return notes
      .filter((note) => typeof note?.text === "string")
      .map((note) => ({
        id: note.id || crypto.randomUUID(),
        text: note.text,
        enabled: note.enabled ?? true,
        x: typeof note.x === "number" ? note.x : undefined,
        y: typeof note.y === "number" ? note.y : undefined,
      }));
  }
  if (settings.stickyNote && settings.stickyNoteEnabled) {
    return [{ id: crypto.randomUUID(), text: settings.stickyNote, enabled: true }];
  }
  return [];
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
        rolePreset: map.rolePreset ?? "friendly",
        systemPrompt: map.systemPrompt ?? defaultSettings.systemPrompt,
        stickyNote: map.stickyNote ?? "",
        stickyNoteEnabled: map.stickyNoteEnabled === "true",
        stickyNotes: map.stickyNotes ? JSON.parse(map.stickyNotes) : [],
        focusDuration: Number(map.focusDuration) || 25,
        breakDuration: Number(map.breakDuration) || 5,
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
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["rolePreset", val.rolePreset]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["systemPrompt", val.systemPrompt]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["stickyNote", val.stickyNote]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["stickyNoteEnabled", String(val.stickyNoteEnabled)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["stickyNotes", JSON.stringify(val.stickyNotes)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["focusDuration", String(val.focusDuration)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["breakDuration", String(val.breakDuration)]);
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

  function updateRolePreset(preset: string) {
    settings.value.rolePreset = preset;
    const prompt = ROLE_PRESETS[preset];
    if (prompt) settings.value.systemPrompt = prompt;
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

  function updateStickyNotes(notes: StickyNoteConfig[]) {
    settings.value.stickyNotes = notes;
  }

  return {
    settings,
    updateLLM,
    updateWaterReminder,
    updateSystemPrompt,
    updateRolePreset,
    updateTheme,
    updateLayout,
    updateAppearance,
    updateWindowPreferences,
    updateSystemPreferences,
    updateStickyNotes,
  };
});
