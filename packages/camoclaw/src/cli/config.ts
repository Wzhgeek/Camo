import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CAMOCLAW_DIR = join(homedir(), ".camoclaw");
const CONFIG_PATH = join(CAMOCLAW_DIR, "config.json");

export interface CamoConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  permissionPreset: "strict" | "normal" | "lax";
  permissions?: Record<string, string>;
}

const DEFAULT_CONFIG: CamoConfig = {
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-v4-flash",
  permissionPreset: "normal",
};

/** Load project-level config if it exists */
function loadProjectConfig(cwd: string): Partial<CamoConfig> | null {
  const paths = [
    join(cwd, ".camoclaw", "settings.local.json"),
    join(cwd, ".camoclaw", "settings.json"),
  ];
  for (const p of paths) {
    try {
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
    } catch { /* skip */ }
  }
  return null;
}

export function loadConfig(): CamoConfig {
  if (!existsSync(CAMOCLAW_DIR)) mkdirSync(CAMOCLAW_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const user = { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) };
    const project = loadProjectConfig(process.cwd());
    return { ...user, ...project }; // project overrides user
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CamoConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConfigPath(): string { return CONFIG_PATH; }
export function getCamoclawDir(): string { return CAMOCLAW_DIR; }
