import type { Reminder } from "./types";
import { reminderService } from "./reminderService";

export type ReminderCallback = (reminder: Reminder) => void;

export interface WaterConfig {
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  endTime: string;
}

const LS_WATER = "camo.scheduler.lastWater";
const LS_INTERVALS = "camo.scheduler.intervals";

export class ReminderScheduler {
  private timer: number | undefined;
  private lastWaterTrigger = 0;
  private intervalTrackers: Map<string, number> = new Map();
  private dailyFiredDates: Map<string, string> = new Map();
  private firedOnceIds: Set<string> = new Set();
  private onNextWater?: (ts: number) => void;
  private onNextTrigger?: (id: string, ts: number) => void;

  constructor(
    private readonly onTrigger: ReminderCallback,
    private readonly getWaterConfig?: () => WaterConfig,
    onNextWater?: (ts: number) => void,
    onNextTrigger?: (id: string, ts: number) => void,
  ) {
    this.onNextWater = onNextWater;
    this.onNextTrigger = onNextTrigger;
  }

  start() {
    this.stop();
    this.lastWaterTrigger = this.loadLastWaterTrigger();
    this.loadIntervalTrackers();
    this.reportNextWater();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  resetReminder(id: string) {
    this.firedOnceIds.delete(id);
    this.intervalTrackers.delete(id);
    this.saveIntervalTrackers();
  }

  snoozeWater(minutes: number) {
    const intervalMs = Math.max(1, this.getWaterConfig?.().intervalMinutes ?? 60) * 60000;
    this.lastWaterTrigger = Date.now() - intervalMs + Math.max(1, minutes) * 60000;
    this.saveLastWaterTrigger();
    this.reportNextWater();
  }

  private loadLastWaterTrigger(): number {
    try {
      const v = localStorage.getItem(LS_WATER);
      return v ? Number(v) : Date.now();
    } catch { return Date.now(); }
  }

  private saveLastWaterTrigger() {
    try { localStorage.setItem(LS_WATER, String(this.lastWaterTrigger)); } catch {}
  }

  private loadIntervalTrackers() {
    try {
      const raw = localStorage.getItem(LS_INTERVALS);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, number>;
        for (const [id, ts] of Object.entries(data)) this.intervalTrackers.set(id, ts);
      }
    } catch {}
  }

  private saveIntervalTrackers() {
    try {
      const data: Record<string, number> = {};
      this.intervalTrackers.forEach((ts, id) => { data[id] = ts; });
      localStorage.setItem(LS_INTERVALS, JSON.stringify(data));
    } catch {}
  }

  private tick() {
    const reminders = reminderService.list();
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const r of reminders) {
      if (!r.enabled) continue;

      if (r.scheduleKind === "once") {
        const runAt = r.schedulePayload.runAt as string | undefined;
        if (runAt && new Date(runAt).getTime() <= now && !this.firedOnceIds.has(r.id)) {
          this.firedOnceIds.add(r.id);
          this.onTrigger(r);
          // 不立即禁用，等用户反馈后由 ReminderBubble 禁用
        }
      } else if (r.scheduleKind === "daily") {
        const time = r.schedulePayload.time as string | undefined;
        if (time) {
          const [h, m] = time.split(":").map(Number);
          const todayTarget = new Date();
          todayTarget.setHours(h, m, 0, 0);
          const lastFired = this.dailyFiredDates.get(r.id);
          if (now >= todayTarget.getTime() && lastFired !== todayStr) {
            this.dailyFiredDates.set(r.id, todayStr);
            this.onTrigger(r);
          }
        }
      } else if (r.scheduleKind === "interval") {
        const intervalMin = r.schedulePayload.intervalMinutes as number | undefined;
        if (intervalMin) {
          if (!this.intervalTrackers.has(r.id)) {
            this.intervalTrackers.set(r.id, now);
            this.saveIntervalTrackers();
          } else if (now - this.intervalTrackers.get(r.id)! >= intervalMin * 60000) {
            this.intervalTrackers.set(r.id, now);
            this.saveIntervalTrackers();
            this.onTrigger(r);
          }
          if (this.onNextTrigger) {
            const last = this.intervalTrackers.get(r.id) || now;
            this.onNextTrigger(r.id, last + intervalMin * 60000);
          }
        }
      } else if (r.scheduleKind === "fixedTimes") {
        const times = r.schedulePayload.times as string[] | undefined;
        if (Array.isArray(times)) {
          for (const time of times) {
            const [h, m] = time.split(":").map(Number);
            if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
            const target = new Date(); target.setHours(h, m, 0, 0);
            const firedKey = `${r.id}:${time}`;
            if (now >= target.getTime() && this.dailyFiredDates.get(firedKey) !== todayStr) {
              this.dailyFiredDates.set(firedKey, todayStr);
              this.onTrigger(r);
            }
          }
        }
      } else if (r.scheduleKind === "workdays") {
        const time = r.schedulePayload.time as string | undefined;
        if (time) {
          const dow = new Date().getDay();
          if (dow >= 1 && dow <= 5) {
            const [h, m] = time.split(":").map(Number);
            const target = new Date(); target.setHours(h, m, 0, 0);
            if (now >= target.getTime() && this.dailyFiredDates.get(r.id) !== todayStr) {
              this.dailyFiredDates.set(r.id, todayStr);
              this.onTrigger(r);
            }
          }
        }
      } else if (r.scheduleKind === "weekends") {
        const time = r.schedulePayload.time as string | undefined;
        if (time) {
          const dow = new Date().getDay();
          if (dow === 0 || dow === 6) {
            const [h, m] = time.split(":").map(Number);
            const target = new Date(); target.setHours(h, m, 0, 0);
            if (now >= target.getTime() && this.dailyFiredDates.get(r.id) !== todayStr) {
              this.dailyFiredDates.set(r.id, todayStr);
              this.onTrigger(r);
            }
          }
        }
      } else if (r.scheduleKind === "date_range") {
        const time = r.schedulePayload.time as string | undefined;
        const startDate = r.schedulePayload.startDate as string | undefined;
        const endDate = r.schedulePayload.endDate as string | undefined;
        if (time && startDate && endDate && todayStr >= startDate && todayStr <= endDate) {
          const [h, m] = time.split(":").map(Number);
          const target = new Date(); target.setHours(h, m, 0, 0);
          if (now >= target.getTime() && this.dailyFiredDates.get(r.id) !== todayStr) {
            this.dailyFiredDates.set(r.id, todayStr);
            this.onTrigger(r);
          }
        }
      }
    }

    if (this.getWaterConfig) {
      const wc = this.getWaterConfig();
      if (wc.enabled && this.isInTimeRange(wc.startTime, wc.endTime)) {
        const interval = wc.intervalMinutes * 60000;
        this.reportNextWater();
        if (now - this.lastWaterTrigger >= interval) {
          this.lastWaterTrigger = now;
          this.saveLastWaterTrigger();
          this.reportNextWater();
          this.onTrigger({
            id: "__water__",
            title: "该喝水了，喝几口再继续。",
            type: "water",
            scheduleKind: "interval",
            schedulePayload: {},
            enabled: true,
            createdAt: "",
            updatedAt: "",
          });
        }
      } else {
        this.reportNextWater();
      }
    }
  }

  private reportNextWater() {
    if (!this.getWaterConfig || !this.onNextWater) return;
    const wc = this.getWaterConfig();
    if (wc.enabled) {
      this.onNextWater(this.lastWaterTrigger + wc.intervalMinutes * 60000);
    } else {
      this.onNextWater(0);
    }
  }

  private isInTimeRange(start: string, end: string): boolean {
    const now = new Date();
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= sh * 60 + sm && mins <= eh * 60 + em;
  }
}
