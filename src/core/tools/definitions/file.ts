import { toolRegistry } from "../registry";
import { invokePortal } from "../portal";

function registerFileTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "read_file",
        description: "读取指定路径的文件内容，返回文本。超过 50000 字节会截断。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "文件的绝对路径" },
            offset: { type: "number", description: "从第几个字节开始读取（可选，默认 0）" },
            limit: { type: "number", description: "最多读取多少字节（可选，默认 50000）" },
          },
          required: ["path"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const result = await invokePortal<string>("read_file", args as Record<string, unknown>);
      return result;
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "write_file",
        description: "将内容写入指定路径的文件。如果父目录不存在会自动创建。会覆盖已有文件。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "文件的绝对路径" },
            content: { type: "string", description: "要写入的文件内容" },
          },
          required: ["path", "content"],
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      await invokePortal<void>("write_file", args as Record<string, unknown>);
      return "OK: 文件已写入";
    },
  });

  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "list_directory",
        description: "列出指定目录下的所有文件和子目录名称。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "目录的绝对路径" },
          },
          required: ["path"],
        },
      },
    },
    requiresConfirm: false,
    execute: async (args) => {
      const entries = await invokePortal<string[]>("list_directory", args as Record<string, unknown>);
      return entries.length > 0 ? entries.join("\n") : "(空目录)";
    },
  });
}

registerFileTools();
