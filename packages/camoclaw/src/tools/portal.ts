import { isTauri } from "../platform.js";

let _isNode: boolean | null = null;
function isNode(): boolean {
  if (_isNode !== null) return _isNode;
  _isNode = typeof process !== "undefined" && process.versions?.node != null && !isTauri;
  return _isNode;
}

export async function invokePortal<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (isTauri) return invokeTauri<T>(cmd, args);
  if (isNode()) return invokeNode<T>(cmd, args);
  return invokeBrowser<T>(cmd);
}

async function invokeTauri<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function invokeNode<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { readFile, writeFile, readdir, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { exec } = await import("node:child_process");
  const os = await import("node:os");
  const home = os.homedir();

  const resolvePath = (p: string) => p.startsWith("~") ? p.replace("~", home) : p;

  switch (cmd) {
    case "read_file": {
      const path = resolvePath(args.path as string);
      const offset = (args.offset as number) || 0;
      const limit = (args.limit as number) || 50000;
      const content = await readFile(path, "utf-8");
      const sliced = content.slice(offset, offset + limit);
      const truncated = sliced.length < content.length - offset ? sliced + `\n\n[已截断: ${sliced.length}/${content.length} 字节]` : sliced;
      return truncated as T;
    }
    case "write_file": {
      const path = resolvePath(args.path as string);
      await mkdir(join(path, ".."), { recursive: true }).catch(() => {});
      await writeFile(path, args.content as string, "utf-8");
      return undefined as T;
    }
    case "list_directory": {
      const path = resolvePath(args.path as string);
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((e: { isDirectory: () => boolean; name: string }) => e.isDirectory() ? `${e.name}/` : e.name) as unknown as T;
    }
    case "run_shell": {
      const command = args.command as string;
      const cwd = args.cwd ? resolvePath(args.cwd as string) : home;
      const timeout = (args.timeout_secs as number) || 30;
      return new Promise((resolve) => {
        exec(command, { cwd, timeout: timeout * 1000 }, (error: Error | null, stdout: string, stderr: string) => {
          const parts: string[] = [];
          if (stdout) parts.push(`STDOUT:\n${stdout}`);
          if (stderr) parts.push(`STDERR:\n${stderr}`);
          const code = error ? (error as unknown as Record<string, unknown>).code || "error" : 0;
          parts.push(`\n退出码: ${code}`);
          resolve((parts.join("\n") || `(无输出)\n退出码: ${code}`) as unknown as T);
        });
      });
    }
    case "take_screenshot":
      return "Error: Node.js 环境下不支持截图" as T;
    case "move_mouse":
    case "click":
    case "type_text":
      return "Error: Node.js 环境下不支持键鼠控制" as T;
    default:
      return `Error: 未知命令 "${cmd}"` as T;
  }
}

function invokeBrowser<T>(cmd: string): Promise<T> {
  switch (cmd) {
    case "read_file": return Promise.resolve("Error: 文件操作仅在桌面或 Node.js 应用中可用" as T);
    case "write_file": return Promise.resolve("Error: 浏览器模式下不支持写入文件" as T);
    case "list_directory": return Promise.resolve("Error: 浏览器模式下不支持列出目录" as T);
    case "run_shell": return Promise.resolve("Error: 浏览器模式下不支持执行命令" as T);
    default: return Promise.resolve(`Error: 未知命令 "${cmd}"` as T);
  }
}
