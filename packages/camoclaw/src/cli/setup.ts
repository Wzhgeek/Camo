import { createInterface } from "node:readline";
import chalk from "chalk";
import { loadConfig, saveConfig, type CamoConfig } from "./config.js";

interface ProviderOption {
  name: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
}

const PROVIDERS: ProviderOption[] = [
  { name: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", defaultModel: "deepseek-v4-flash", models: ["deepseek-v4-flash", "deepseek-v4-pro"] },
  { name: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o", models: ["gpt-4o", "gpt-4o-mini", "o3-mini"] },
  { name: "claude", label: "Claude (Anthropic)", baseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-6", models: ["claude-sonnet-4-6", "claude-haiku-4-5"] },
  { name: "ollama", label: "Ollama (本地)", baseUrl: "http://localhost:11434", defaultModel: "qwen3:latest", models: ["qwen3:latest", "llama3.1:latest"] },
  { name: "gemini", label: "Gemini (Google)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", defaultModel: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  { name: "kimi", label: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", defaultModel: "moonshot-v1-8k", models: ["moonshot-v1-8k", "moonshot-v1-32k"] },
];

/** Arrow-key selectable list. Returns selected index. */
function select<T>(
  title: string,
  items: T[],
  render: (item: T, selected: boolean, idx: number) => string,
): Promise<{ index: number; item: T }> {
  return new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let selected = 0;
    const N = items.length;
    let drawn = false;

    // Draw title first
    process.stdout.write(chalk.bold(`\n  ${title}\n\n`));

    function draw() {
      for (let i = 0; i < N; i++) {
        process.stdout.write("\x1b[2K\r");
        process.stdout.write(render(items[i], i === selected, i) + "\n");
      }
      // Move cursor back up to first option for next redraw
      process.stdout.write(`\x1b[${N}A`);
      drawn = true;
    }

    function onData(data: Buffer) {
      const b = data[0];
      if (b === 0x1b && data[1] === 0x5b) {
        if (data[2] === 0x41) selected = selected > 0 ? selected - 1 : N - 1;       // up
        else if (data[2] === 0x42) selected = selected < N - 1 ? selected + 1 : 0; // down
      } else if (b === 0x0d || b === 0x0a) {
        cleanup();
        // Clear the selection list: move to end, clear all N lines
        process.stdout.write(`\x1b[${N - selected}B`);
        for (let i = N - 1; i >= 0; i--) {
          process.stdout.write("\x1b[A\x1b[2K");
        }
        // Print selected choice
        const chosen = render(items[selected], true, selected).replace(/>|●/g, "").trim();
        process.stdout.write(`  ${chalk.green("✓")} ${chosen}\n`);
        resolve({ index: selected, item: items[selected] });
        return;
      } else if (b === 0x03) {
        cleanup();
        process.stdout.write(`\x1b[${N - selected}B\x1b[2K\r\n`);
        resolve({ index: selected, item: items[selected] });
        return;
      }
      draw();
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(wasRaw ?? false);
      process.stdin.pause();
    }

    process.stdin.on("data", onData);
    draw();
  });
}

function ask(q: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

export async function runSetup(): Promise<CamoConfig | null> {
  const config = loadConfig();

  console.log(chalk.green("\n  🦎  CamoClaw") + chalk.dim(" — 初始化配置"));
  console.log(chalk.dim("  ↑↓ 选择  Enter 确认  Ctrl+C 跳过"));

  // Step 1: Provider (arrow key select)
  const { item: provider } = await select(
    "选择 LLM 提供商",
    PROVIDERS,
    (p, selected) => {
      const prefix = selected ? chalk.green("  >") : "   ";
      return `${prefix} ${chalk.bold(p.label)} ${chalk.dim(`· ${p.baseUrl}`)}`;
    },
  );

  config.provider = provider.name;
  config.baseUrl = provider.baseUrl;
  if (!config.model || config.model === "deepseek-v4-flash") {
    config.model = provider.defaultModel;
  }

  // Step 2: API Key
  if (provider.name !== "ollama") {
    const hint = config.apiKey
      ? chalk.dim(`  (当前: ***${config.apiKey.slice(-4)}，回车保留)`)
      : "";
    console.log(chalk.bold(`\n  API Key ${provider.label}${hint}`));
    console.log(chalk.dim(`  获取 Key → ${getKeyUrl(provider.name)}`));
    const key = await ask(chalk.cyan("  > "));
    if (key.trim()) config.apiKey = key.trim();
  } else {
    config.apiKey = "";
  }

  // Step 3: Model (arrow key select)
  if (provider.models.length > 1) {
    const modelItems = [
      ...provider.models,
      "(自定义输入...)",
    ];
    const { item: model } = await select(
      `选择模型 (${provider.label})`,
      modelItems,
      (m, selected) => {
        const current = m === config.model;
        const prefix = selected ? chalk.green("  >") : "   ";
        const suffix = current && !selected ? chalk.dim(" (当前)") : "";
        return `${prefix} ${chalk.bold(m)}${suffix}`;
      },
    );

    if (model === "(自定义输入...)") {
      const custom = await ask(chalk.cyan("  模型名: "));
      if (custom.trim()) config.model = custom.trim();
    } else {
      config.model = model;
    }
  }

  // Save
  saveConfig(config);
  console.log(chalk.green("\n  ✓ 配置已保存"));
  console.log(chalk.dim(`  ${provider.label}  ·  ${config.model}  ·  ${config.apiKey ? "Key: ***" + config.apiKey.slice(-4) : "Key: 未设置"}`));
  if (!config.apiKey && provider.name !== "ollama") {
    console.log(chalk.yellow("  ⚠ 未设置 API Key，稍后可用 camoclaw init 重新配置"));
  }
  console.log("");

  return config;
}

function getKeyUrl(provider: string): string {
  switch (provider) {
    case "deepseek": return "https://platform.deepseek.com/api_keys";
    case "openai": return "https://platform.openai.com/api-keys";
    case "claude": return "https://console.anthropic.com/";
    case "gemini": return "https://aistudio.google.com/apikey";
    case "kimi": return "https://platform.moonshot.cn/";
    default: return "提供商官网";
  }
}
