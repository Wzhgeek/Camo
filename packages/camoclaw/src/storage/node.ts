import Database from "better-sqlite3";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import type { SkillDB } from "../skill/skillService.js";

const CAMOCLAW_DIR = join(homedir(), ".camoclaw");
const DB_PATH = join(CAMOCLAW_DIR, "camo.db");

if (!existsSync(CAMOCLAW_DIR)) {
  mkdirSync(CAMOCLAW_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure skills table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    tools TEXT NOT NULL DEFAULT '[]',
    auto_trigger_words TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    built_in INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

// Sessions + messages tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tool_calls TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDB(): any { return db; }

export const nodeDB: SkillDB = {
  all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  },
  run(sql: string, params: unknown[] = []): void {
    const stmt = db.prepare(sql);
    stmt.run(...params);
  },
  get<T>(sql: string, params: unknown[] = []): T | null {
    const stmt = db.prepare(sql);
    return (stmt.get(...params) as T) ?? null;
  },
};
