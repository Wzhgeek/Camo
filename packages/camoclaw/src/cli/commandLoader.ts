import { existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseSkillMarkdown } from "../skill/parser.js"; // reuse existing frontmatter parser

const COMMANDS_DIR = join(homedir(), ".camoclaw", "commands");
const BUILTINS_DIR = join(COMMANDS_DIR, "builtins");

interface CommandDef {
  name: string;
  description: string;
  argumentHint?: string;
  content: string;
}

export function loadCommands(): CommandDef[] {
  const dirs = [COMMANDS_DIR];
  if (existsSync(BUILTINS_DIR)) dirs.push(BUILTINS_DIR);

  const all: CommandDef[] = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        const content = readFileSync(join(dir, file), "utf-8");
        const { frontmatter, body } = parseSkillMarkdown(content);
        const name = file.replace(/\.md$/, "");
        all.push({
          name,
          description: frontmatter.description || name,
          argumentHint: frontmatter.title || undefined,
          content: body,
        });
      }
    } catch { /* skip */ }
  }
  return all;
}

export function ensureBuiltinCommands(): void {
  if (!existsSync(BUILTINS_DIR)) {
    mkdirSync(BUILTINS_DIR, { recursive: true });
    // Write a sample /review command
    writeFileSync(join(BUILTINS_DIR, "review.md"), `---
description: Code review current changes
argument-hint: "[files]"
---
请审查当前代码变更，从安全、性能、可读性三个维度给出建议。`);
  }
}

import { writeFileSync } from "node:fs";
