import type { Reminder } from "./types";
import { reminderService } from "./reminderService";

export type ReminderCallback = (reminder: Reminder) => void;

export interface WaterConfig {
  enabled: boolean;
  intervalMinutes: number;
  startTime: string;
  endTime: string;
}

export class ReminderScheduler {
  private timer: number | undefined;
  private lastWaterTrigger = 0;
  private intervalTrackers: Map<string, number> = new Map();
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
    this.lastWaterTrigger = Date.now();
    this.reportNextWater();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 30_000);
  }

  stop() {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private tick() {
    const reminders = reminderService.list();
    const now = Date.now();

    for (const r of reminders) {
      if (!r.enabled) continue;

      if (r.scheduleKind === "once") {
        const runAt = r.schedulePayload.runAt as string | undefined;
        if (runAt && new Date(runAt).getTime() <= now) {
          this.onTrigger(r);
          reminderService.update(r.id, { enabled: false });
        }
      } else if (r.scheduleKind === "daily") {
        const time = r.schedulePayload.time as string | undefined;
        if (time) {
          const [h, m] = time.split(":").map(Number);
          const todayTarget = new Date();
          todayTarget.setHours(h, m, 0, 0);
          const diff = now - todayTarget.getTime();
          if (diff >= 0 && diff < 30_000) {
            this.onTrigger(r);
          }
        }
      } else if (r.scheduleKind === "interval") {
        const intervalMin = r.schedulePayload.intervalMinutes as number | undefined;
        if (intervalMin) {
          if (!this.intervalTrackers.has(r.id)) {
            this.intervalTrackers.set(r.id, now);
          } else if (now - this.intervalTrackers.get(r.id)! >= intervalMin * 60000) {
            this.intervalTrackers.set(r.id, now);
            this.onTrigger(r);
          }
          if (this.onNextTrigger) {
            const last = this.intervalTrackers.get(r.id) || now;
            this.onNextTrigger(r.id, last + intervalMin * 60000);
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
