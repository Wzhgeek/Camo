import { toolRegistry } from "../registry.js";

function registerClipboardTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "read_clipboard",
        description: "读取系统剪贴板中的文本内容。",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    requiresConfirm: false,
    execute: async () => {
      try {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
        const text = await readText();
        return text || "(剪贴板为空)";
      } catch (e) {
        return `Error: 读取剪贴板失败: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "write_clipboard",
        description: "将文本写入系统剪贴板。",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "要写入剪贴板的文本" },
          },
          required: ["text"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      try {
        const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
        await writeText(args.text as string);
        return "OK: 已写入剪贴板";
      } catch (e) {
        return `Error: 写入剪贴板失败: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });
}

registerClipboardTools();
