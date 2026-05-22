import { isTauri } from "../platform";

export async function invokePortal<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return invokeBrowser<T>(cmd);
}

function invokeBrowser<T>(cmd: string): Promise<T> {
  switch (cmd) {
    case "read_file":
      return Promise.resolve("Error: 文件操作仅在桌面应用中可用" as T);
    case "write_file":
      return Promise.resolve("Error: 浏览器模式下不支持写入文件" as T);
    case "list_directory":
      return Promise.resolve("Error: 浏览器模式下不支持列出目录" as T);
    case "run_shell":
      return Promise.resolve("Error: 浏览器模式下不支持执行命令" as T);
    default:
      return Promise.resolve(`Error: 未知命令 "${cmd}"` as T);
  }
}
