import { toolRegistry } from "../registry";
import { invokePortal } from "../portal";

function registerShellTools(): void {
  toolRegistry.register({
    schema: {
      type: "function",
      function: {
        name: "run_shell",
        description: "在用户电脑上执行 Shell 命令，返回标准输出和标准错误。执行前需要用户确认。默认 30 秒超时。",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "要执行的命令" },
            cwd: { type: "string", description: "执行目录（可选，默认为用户主目录）" },
            timeout_secs: { type: "number", description: "超时秒数（可选，默认 30）" },
          },
          required: ["command"],
        },
      },
    },
    requiresConfirm: true,
    execute: async (args) => {
      const result = await invokePortal<string>("run_shell", args as Record<string, unknown>);
      return result;
    },
  });
}

registerShellTools();
