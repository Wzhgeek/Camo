#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configDir = resolve(homedir(), ".camo");
const configPath = resolve(configDir, "config.json");

const args = process.argv.slice(2);

if (args[0] === "config") {
  handleConfig(args.slice(1));
} else {
  startApp(args);
}

function startApp(extraArgs) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "tauri", "--", "dev", ...extraArgs], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) { process.kill(process.pid, signal); return; }
    process.exit(code ?? 0);
  });
}

function loadConfig() {
  try {
    if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {}
  return {};
}

function saveConfig(config) {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

function handleConfig(flags) {
  if (flags.length === 0) {
    interactiveConfig();
    return;
  }

  const config = loadConfig();
  const llm = config.llm || {};

  for (let i = 0; i < flags.length; i += 2) {
    const key = flags[i]?.replace(/^--/, "");
    const val = flags[i + 1];
    if (!key || val === undefined) {
      console.error(`Invalid flag: ${flags[i]}`);
      process.exit(1);
    }
    if (key === "provider") llm.provider = val;
    else if (key === "base-url") llm.baseUrl = val;
    else if (key === "api-key") llm.apiKey = val;
    else if (key === "model") llm.model = val;
    else { console.error(`Unknown option: --${key}`); process.exit(1); }
  }

  config.llm = llm;
  saveConfig(config);
  console.log("Config saved to", configPath);
  console.log(JSON.stringify(config.llm, null, 2));
}

function interactiveConfig() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, def) => new Promise((res) => {
    rl.question(`${q}${def ? ` (${def})` : ""}: `, (ans) => res(ans.trim() || def || ""));
  });

  const config = loadConfig();
  const llm = config.llm || {};

  (async () => {
    console.log("\n  Camo LLM Configuration\n");
    llm.provider = await ask("Provider [openai/ollama]", llm.provider || "ollama");
    llm.baseUrl = await ask("Base URL", llm.baseUrl || (llm.provider === "ollama" ? "http://localhost:11434" : ""));
    if (llm.provider === "openai") {
      llm.apiKey = await ask("API Key", llm.apiKey || "");
    }
    llm.model = await ask("Model", llm.model || "qwen2");

    config.llm = llm;
    saveConfig(config);
    console.log("\nSaved to", configPath);
    rl.close();
  })();
}
