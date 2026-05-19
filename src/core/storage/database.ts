import initSqlJs, { type Database } from "sql.js";
import { MIGRATIONS } from "./migrations";

const DB_NAME = "camo.db";
let db: Database | null = null;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export async function initDatabase(): Promise<void> {
  if (db) return;

  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });

  const saved = await loadFromIndexedDB();
  db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();

  for (const sql of MIGRATIONS) {
    db.run(sql);
  }
  persist();
}

export function dbRun(sql: string, params: unknown[] = []): void {
  if (!db) throw new Error("Database not initialized");
  db.run(sql, params as any[]);
  debouncedPersist();
}

export function dbAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params as any[]);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function dbGet<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): T | null {
  return dbAll<T>(sql, params)[0] ?? null;
}

function debouncedPersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist(), 500);
}

function persist() {
  if (!db) return;
  const data = db.export();
  saveToIndexedDB(data.buffer as ArrayBuffer);
}

function saveToIndexedDB(buffer: ArrayBuffer): void {
  const req = indexedDB.open("camo_storage", 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains("db")) {
      req.result.createObjectStore("db");
    }
  };
  req.onsuccess = () => {
    const tx = req.result.transaction("db", "readwrite");
    tx.objectStore("db").put(buffer, DB_NAME);
  };
}

function loadFromIndexedDB(): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open("camo_storage", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("db");
    };
    req.onsuccess = () => {
      const tx = req.result.transaction("db", "readonly");
      const get = tx.objectStore("db").get(DB_NAME);
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}
