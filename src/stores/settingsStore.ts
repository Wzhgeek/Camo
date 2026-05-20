import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { LLMConfig } from "../core/llm/types";
import { defaultLLMConfig } from "../core/llm/types";
import { dbAll, dbRun } from "../core/storage/database";
import type { CamoTheme } from "../core/camo/assets";

export interface WaterReminderConfig {
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  endTime: string;
}

export interface CamoSettings {
  llm: LLMConfig;
  waterReminder: WaterReminderConfig;
  systemPrompt: string;
  theme: CamoTheme;
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
};

function loadSettings(): CamoSettings {
  try {
    const rows = dbAll<{ key: string; value: string }>("SELECT key, value FROM settings");
    if (rows.length > 0) {
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      return {
        llm: map.llm ? JSON.parse(map.llm) : { ...defaultLLMConfig },
        waterReminder: map.waterReminder ? JSON.parse(map.waterReminder) : defaultSettings.waterReminder,
        systemPrompt: map.systemPrompt ?? defaultSettings.systemPrompt,
        theme: (map.theme as CamoTheme) ?? "grey",
      };
    }
  } catch {}
  try {
    const raw = localStorage.getItem("camo.settings");
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultSettings };
}

function saveSettings(val: CamoSettings) {
  try {
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["llm", JSON.stringify(val.llm)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["waterReminder", JSON.stringify(val.waterReminder)]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["systemPrompt", val.systemPrompt]);
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["theme", val.theme]);
  } catch {
    localStorage.setItem("camo.settings", JSON.stringify(val));
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<CamoSettings>(loadSettings());

  watch(settings, (val) => {
    saveSettings(val);
  }, { deep: true });

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

  return { settings, updateLLM, updateWaterReminder, updateSystemPrompt, updateTheme };
});
