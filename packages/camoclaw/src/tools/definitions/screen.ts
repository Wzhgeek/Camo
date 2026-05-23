import { toolRegistry } from "../registry.js";
import { invokePortal } from "../portal.js";

function registerScreenTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "take_screenshot",
        description: "截取主显示器的屏幕截图并保存到指定路径。需要用户确认。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "保存截图的文件路径（如 ~/Desktop/screenshot.png）" },
          },
          required: ["path"],
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      await invokePortal<void>("take_screenshot", args as Record<string, unknown>);
      return `截图已保存至: ${args.path}`;
    },
  });
}

registerScreenTools();
