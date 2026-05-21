import { dbAll, dbGet, dbRun } from "../storage/database";

export interface AffectionState {
  score: number;
  lastInteraction: string;
  lastClose: string;
}

const STORAGE_KEY = "affection_state";

function nowISO(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function logEvent(reason: string, delta = 0, scoreAfter?: number): void {
  const score = scoreAfter ?? getState().score;
  try {
    dbRun(
      `INSERT INTO affection_log (reason, delta, score_after, date, created_at) VALUES (?, ?, ?, ?, ?)`,
      [reason, delta, score, todayDate(), nowISO()],
    );
  } catch { /* log not available */ }
}

export function getState(): AffectionState {
  try {
    const row = dbGet<{ value: string }>("SELECT value FROM settings WHERE key = ?", [STORAGE_KEY]);
    if (row) return JSON.parse(row.value);
  } catch { /* fallback */ }
  return { score: 50, lastInteraction: "", lastClose: "" };
}

export function saveState(state: AffectionState) {
  try {
    dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [STORAGE_KEY, JSON.stringify(state)]);
  } catch { /* persistence not available */ }
}

export function getDailyCount(reason: string): number {
  try {
    const rows = dbAll<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM affection_log WHERE reason = ? AND date = ?",
      [reason, todayDate()],
    );
    return rows[0]?.cnt ?? 0;
  } catch { return 0; }
}

export function getRecentIncrementCount(reason: string, minutes: number = 5): number {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  try {
    const rows = dbAll<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM affection_log WHERE reason = ? AND created_at >= ?",
      [reason, since],
    );
    return rows[0]?.cnt ?? 0;
  } catch { return 0; }
}

export function adjust(
  reason: string,
  delta: number,
  options?: { dailyLimit?: number; reasonForLimit?: string },
): AffectionState {
  const state = getState();

  if (options?.dailyLimit && options?.dailyLimit > 0) {
    const countKey = options.reasonForLimit ?? reason;
    const today = getDailyCount(countKey);
    if (today >= options.dailyLimit) return state;
  }

  const recent = getRecentIncrementCount(reason, 5);
  if (recent > 0) return state;

  let newScore = Math.max(0, Math.min(100, state.score + delta));
  state.score = newScore;
  state.lastInteraction = nowISO();

  logEvent(reason, delta, newScore);

  saveState(state);
  return { ...state };
}

export function reset(): AffectionState {
  const state: AffectionState = { score: 0, lastInteraction: "", lastClose: "" };
  saveState(state);
  try {
    dbRun("DELETE FROM affection_log", []);
  } catch { /* table not available */ }
  return state;
}

export function stageLabel(score: number): string {
  if (score <= 25) return "陌生";
  if (score <= 50) return "熟悉";
  if (score <= 80) return "亲近";
  return "密友";
}

export function buildAffectionContext(score: number, lastClose?: string): string {
  const hoursSinceClose = lastClose ? (Date.now() - new Date(lastClose).getTime()) / 3600000 : -1;

  const stage = stageLabel(score);
  let personality: string;
  let welcomeBack = "";

  if (score <= 25) {
    personality = "你刚认识用户不久。保持礼貌克制，回复简洁直接，不要过于热情。";
  } else if (score <= 50) {
    personality = "你和用户已经有些熟悉了，语气可以放松一些。";
  } else if (score <= 80) {
    personality = "你和用户关系很亲近，回复可以活泼、幽默一些，偶尔调侃。";
  } else {
    personality = "你是用户的老朋友了，可以撒娇、吐槽，用更亲切的语气，分享心情。";
  }

  if (hoursSinceClose > 6 && hoursSinceClose >= 0 && score >= 50) {
    welcomeBack = "\n用户今天刚回来，你可以表达一下想念。";
  }

  return `好感度：${score}（${stage}）\n${personality}${welcomeBack}`;
}
