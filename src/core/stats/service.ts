import { dbAll, dbGet } from "../storage/database";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface TodayStats {
  totalEvents: number;
  netDelta: number;
  breakdown: Record<string, { count: number; delta: number }>;
}

export interface ReminderCounts {
  total: number;
  water: number;
  exercise: number;
  normal: number;
}

export function getTodayStats(): TodayStats {
  try {
    const rows = dbAll<{ cnt: number; total_delta: number }>(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(delta), 0) as total_delta FROM affection_log WHERE date = ?",
      [today()],
    );
    const breakdown = dbAll<{ reason: string; cnt: number; delta: number }>(
      "SELECT reason, COUNT(*) as cnt, COALESCE(SUM(delta), 0) as delta FROM affection_log WHERE date = ? GROUP BY reason",
      [today()],
    );
    const map: Record<string, { count: number; delta: number }> = {};
    for (const r of breakdown) {
      map[r.reason] = { count: r.cnt, delta: r.delta };
    }
    const cnt = rows[0]?.cnt ?? 0;
    return {
      totalEvents: cnt,
      netDelta: rows[0]?.total_delta ?? 0,
      breakdown: map,
    };
  } catch {
    return { totalEvents: 0, netDelta: 0, breakdown: {} };
  }
}

export function getReminderCounts(): ReminderCounts {
  try {
    const all = dbAll<{ type: string; cnt: number }>(
      "SELECT type, COUNT(*) as cnt FROM reminders GROUP BY type",
    );
    let water = 0, exercise = 0, normal = 0, total = 0;
    for (const r of all) {
      switch (r.type) {
        case "water": water = r.cnt; break;
        case "exercise": exercise = r.cnt; break;
        case "normal": normal = r.cnt; break;
      }
      total += r.cnt;
    }
    return { total, water, exercise, normal };
  } catch {
    return { total: 0, water: 0, exercise: 0, normal: 0 };
  }
}

export function getAffectionScore(): number {
  try {
    const row = dbGet<{ value: string }>("SELECT value FROM settings WHERE key = ?", ["affection_state"]);
    if (row) {
      const state = JSON.parse(row.value);
      return state.score ?? 50;
    }
  } catch {}
  return 50;
}
