import { getDB } from "../storage/node.js";

export interface StoredSession {
  id: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: number;
  sessionId: string;
  role: string;
  content: string;
  toolCalls: string | null;
  createdAt: string;
}

const db = getDB();

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const sessionManager = {
  create(model: string): StoredSession {
    const id = uuid();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO sessions (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, "", model, now, now);
    return { id, title: "", model, createdAt: now, updatedAt: now };
  },

  list(): StoredSession[] {
    return db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as StoredSession[];
  },

  get(id: string): StoredSession | null {
    return (db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as StoredSession) ?? null;
  },

  getLast(): StoredSession | null {
    return (db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1").get() as StoredSession) ?? null;
  },

  updateTitle(id: string, title: string): void {
    db.prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?")
      .run(title.slice(0, 100), new Date().toISOString(), id);
  },

  touch(id: string): void {
    db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  },

  delete(id: string): void {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  },

  // Messages
  loadMessages(sessionId: string): StoredMessage[] {
    return db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC").all(sessionId) as StoredMessage[];
  },

  appendMessage(sessionId: string, role: string, content: string, toolCalls?: string): void {
    db.prepare("INSERT INTO messages (session_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(sessionId, role, content, toolCalls ?? null, new Date().toISOString());
    this.touch(sessionId);
  },

  countMessages(sessionId: string): number {
    return (db.prepare("SELECT COUNT(*) as c FROM messages WHERE session_id = ?").get(sessionId) as { c: number }).c;
  },

  clearMessages(sessionId: string): void {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  },
};
