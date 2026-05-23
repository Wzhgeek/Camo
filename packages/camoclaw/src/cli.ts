import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig } from "./cli/config.js";
import { runTUI } from "./cli/tui.js";
import { runSetup } from "./cli/setup.js";

async function main() {
  const args = process.argv.slice(2);

  // ── camoclaw init ──
  if (args[0] === "init") {
    const config = await runSetup();
    if (config?.apiKey || config?.provider === "ollama") {
      console.log("\n配置完成！输入 camoclaw 开始使用。");
    }
    return;
  }

  // ── Flags ──
  if (args[0] === "--config" || args[0] === "config") {
    console.log("配置文件:", join(homedir(), ".camoclaw", "config.json"));
    return;
  }
  if (args[0] === "--set-key" && args[1]) {
    const config = loadConfig();
    config.apiKey = args[1];
    saveConfig(config);
    console.log("API Key 已设置");
    return;
  }
  if (args[0] === "--set-model" && args[1]) {
    const config = loadConfig();
    config.model = args[1];
    saveConfig(config);
    console.log("模型已设置为", args[1]);
    return;
  }
  if (args[0] === "--help" || args[0] === "-h") {
    console.log(`CamoClaw — 终端 AI 助手

用法:
  camoclaw              进入交互式 TUI
  camoclaw init         交互式配置 LLM 提供商
  camoclaw --help       显示此帮助

配置:
  ~/.camoclaw/config.json
`);
    return;
  }

  // ── Check config, enter setup if needed ──
  let config = loadConfig();
  if (!config.apiKey && config.provider !== "ollama") {
    console.log("欢迎使用 CamoClaw！看起来你是第一次使用。\n");
    config = await runSetup() ?? config;
    if (!config?.apiKey && config?.provider !== "ollama") {
      console.log("\n未设置 API Key。准备好后运行 camoclaw init 重新配置。");
      process.exit(0);
    }
  }

  // Import and register all tool definitions
  import("./tools/definitions/app.js");
  import("./tools/definitions/file.js");
  import("./tools/definitions/shell.js");
  import("./tools/definitions/screen.js");
  import("./tools/definitions/input.js");
  import("./tools/definitions/clipboard.js");
  import("./tools/definitions/skill.js");

  await runTUI(config);
}

main().catch((e) => {
  console.error("启动失败:", e.message);
  process.exit(1);
});
