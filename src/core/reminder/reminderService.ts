import type { Reminder, ReminderInput } from "./types";
import { dbAll, dbGet, dbRun } from "../storage/database";

const STORAGE_KEY = "camo.reminders";

function isDbReady(): boolean {
  try {
    dbAll("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export class ReminderService {
  list(): Reminder[] {
    if (isDbReady()) {
      const rows = dbAll<any>("SELECT * FROM reminders ORDER BY created_at DESC");
      return rows.map(rowToReminder);
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  create(input: ReminderInput): Reminder {
    const now = new Date().toISOString();
    const reminder: Reminder = {
      ...input,
      id: crypto.randomUUID(),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };

    if (isDbReady()) {
      dbRun(
        `INSERT INTO reminders (id, title, type, schedule_kind, schedule_payload, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [reminder.id, reminder.title, reminder.type, reminder.scheduleKind,
         JSON.stringify(reminder.schedulePayload), reminder.enabled ? 1 : 0,
         reminder.createdAt, reminder.updatedAt],
      );
    } else {
      const list = this.list();
      list.push(reminder);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    return reminder;
  }

  update(id: string, patch: Partial<Reminder>): void {
    if (isDbReady()) {
      const existing = dbGet<any>("SELECT * FROM reminders WHERE id = ?", [id]);
      if (!existing) return;
      const updated = { ...rowToReminder(existing), ...patch, updatedAt: new Date().toISOString() };
      dbRun(
        `UPDATE reminders SET title=?, type=?, schedule_kind=?, schedule_payload=?, enabled=?, updated_at=? WHERE id=?`,
        [updated.title, updated.type, updated.scheduleKind,
         JSON.stringify(updated.schedulePayload), updated.enabled ? 1 : 0,
         updated.updatedAt, id],
      );
    } else {
      const list = this.list().map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  }

  delete(id: string): void {
    if (isDbReady()) {
      dbRun("DELETE FROM reminders WHERE id = ?", [id]);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.list().filter((r) => r.id !== id)));
    }
  }
}

function rowToReminder(row: any): Reminder {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    scheduleKind: row.schedule_kind,
    schedulePayload: JSON.parse(row.schedule_payload || "{}"),
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const reminderService = new ReminderService();
