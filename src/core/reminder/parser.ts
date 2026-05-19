import type { ReminderInput } from "./types";

const CN_NUM: Record<string, number> = {
  "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
  "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
  "十一": 11, "十二": 12,
};

function cnToNum(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  if (CN_NUM[s] !== undefined) return CN_NUM[s];
  if (s.startsWith("十")) return 10 + (CN_NUM[s[1]] || 0);
  if (s.endsWith("十")) return (CN_NUM[s[0]] || 1) * 10;
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (CN_NUM[a] || 1) * 10 + (CN_NUM[b] || 0);
  }
  return Number(s) || 0;
}

export function parseReminderFromText(text: string): ReminderInput {
  const normalized = text.trim();

  if (/喝水/.test(normalized)) {
    return {
      title: "喝水提醒",
      type: "water",
      scheduleKind: "interval",
      schedulePayload: {
        intervalMinutes: extractIntervalMinutes(normalized) ?? 60,
      },
      enabled: true,
    };
  }

  if (/训练|运动|活动|久坐|放松/.test(normalized)) {
    return {
      title: "健康训练提醒",
      type: "exercise",
      scheduleKind: "fixedTimes",
      schedulePayload: { times: ["10:30", "15:30", "21:00"] },
      enabled: true,
    };
  }

  const time = extractTime(normalized);
  return {
    title: cleanTitle(normalized),
    type: "normal",
    scheduleKind: "once",
    schedulePayload: { runAt: time },
    enabled: true,
  };
}

function extractIntervalMinutes(text: string): number | undefined {
  const m = text.match(/每隔?\s*(\d+)\s*(分钟|小时)/);
  if (!m) return undefined;
  return m[2] === "小时" ? Number(m[1]) * 60 : Number(m[1]);
}

function extractTime(text: string): string {
  const now = new Date();

  const relMin = text.match(/(\d+)\s*分钟后/);
  if (relMin) {
    return new Date(now.getTime() + Number(relMin[1]) * 60000).toISOString();
  }

  const relHour = text.match(/(\d+)\s*小时后/);
  if (relHour) {
    return new Date(now.getTime() + Number(relHour[1]) * 3600000).toISOString();
  }

  let day = new Date(now);
  if (/明天/.test(text)) {
    // 凌晨5点前说"明天"，意思是当天白天，不加天
    if (now.getHours() >= 5) day.setDate(day.getDate() + 1);
  }
  if (/后天/.test(text)) day.setDate(day.getDate() + 2);

  const cnTimeMatch = text.match(/([一二三四五六七八九十]+)[点點](?:半|([一二三四五六七八九十\d]*)分?)?/);
  const digitTimeMatch = text.match(/(\d{1,2})[:：点點](\d{1,2})?/);

  if (cnTimeMatch) {
    let hour = cnToNum(cnTimeMatch[1]);
    let minute = 0;
    if (cnTimeMatch[0].includes("半")) {
      minute = 30;
    } else if (cnTimeMatch[2]) {
      minute = cnToNum(cnTimeMatch[2]);
    }
    if (/下午|晚/.test(text) && hour < 12) hour += 12;
    if (/上午|早/.test(text) && hour === 12) hour = 0;
    day.setHours(hour, minute, 0, 0);
    if (day.getTime() <= now.getTime() && !/明天|后天/.test(text)) {
      day.setDate(day.getDate() + 1);
    }
    return day.toISOString();
  }

  if (digitTimeMatch) {
    let hour = Number(digitTimeMatch[1]);
    const minute = digitTimeMatch[2] ? Number(digitTimeMatch[2]) : 0;
    if (/下午|晚/.test(text) && hour < 12) hour += 12;
    if (/上午|早/.test(text) && hour === 12) hour = 0;
    day.setHours(hour, minute, 0, 0);
    if (day.getTime() <= now.getTime() && !/明天|后天/.test(text)) {
      day.setDate(day.getDate() + 1);
    }
    return day.toISOString();
  }

  return new Date(now.getTime() + 3600000).toISOString();
}

function cleanTitle(text: string): string {
  return text
    .replace(/提醒我?|叫我|到点|帮我|定一?个?|设置?一?个?/g, "")
    .replace(/明天|后天|今天|上午|下午|晚上|早上|凌晨|中午/g, "")
    .replace(/[一二三四五六七八九十]+[点點](?:半|[一二三四五六七八九十\d]*分?)?/g, "")
    .replace(/\d{1,2}[:：点點]\d{0,2}/g, "")
    .replace(/(\d+)\s*(分钟|小时)后/g, "")
    .replace(/[的了吧呢啊]/g, "")
    .trim() || "事务提醒";
}
