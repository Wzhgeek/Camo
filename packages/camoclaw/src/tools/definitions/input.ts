import { toolRegistry } from "../registry.js";
import { invokePortal } from "../portal.js";

function registerInputTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "move_mouse",
        description: "移动鼠标到指定坐标（绝对坐标）。需要用户确认。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "X 坐标" },
            y: { type: "number", description: "Y 坐标" },
          },
          required: ["x", "y"],
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      await invokePortal<void>("move_mouse", args as Record<string, unknown>);
      return `鼠标已移动到 (${args.x}, ${args.y})`;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "click",
        description: "在当前鼠标位置执行点击。需要用户确认。",
        parameters: {
          type: "object",
          properties: {
            button: { type: "string", enum: ["left", "right", "middle"], description: "鼠标按钮：left/right/middle" },
          },
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      await invokePortal<void>("click", args as Record<string, unknown>);
      return `已点击 ${args.button || "left"} 键`;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "type_text",
        description: "模拟键盘输入文本。需要用户确认。",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "要输入的文本" },
          },
          required: ["text"],
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      await invokePortal<void>("type_text", args as Record<string, unknown>);
      return `已输入文本`;
    },
  });
}

registerInputTools();
