import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function allowlistPath(workspace: string): string {
  return join(workspace, ".camo", "commands.json");
}

export function loadAllowlist(workspace: string): Set<string> {
  try {
    const raw = readFileSync(allowlistPath(workspace), "utf-8");
    const data = JSON.parse(raw);
    return new Set(data.allowedCommands || []);
  } catch {
    return new Set();
  }
}

function saveAllowlist(workspace: string, allowlist: Set<string>): void {
  const dir = join(workspace, ".camo");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(allowlistPath(workspace), JSON.stringify({ allowedCommands: [...allowlist].sort() }, null, 2));
}

export function extractCommandPrefix(args: Record<string, unknown>): string {
  const cmd = (args.command || args.cmd || "") as string;
  return cmd.trim().split(/\s+/)[0] || "";
}

export function isCommandAllowed(workspace: string, prefix: string): boolean {
  if (!prefix) return false;
  return loadAllowlist(workspace).has(prefix);
}

export function allowCommand(workspace: string, prefix: string, existing?: Set<string>): void {
  if (!prefix) return;
  const allowlist = existing ?? loadAllowlist(workspace);
  if (allowlist.has(prefix)) return;
  allowlist.add(prefix);
  saveAllowlist(workspace, allowlist);
}
