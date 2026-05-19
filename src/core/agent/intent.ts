export type UserIntent = "chat" | "create_reminder";

export function detectIntent(input: string): UserIntent {
  const text = input.trim();
  if (/提醒我|叫我|到点|每天.*提醒|每隔.*提醒|分钟后|小时后/.test(text)) {
    return "create_reminder";
  }
  if (/提醒.*喝水|喝水提醒/.test(text)) {
    return "create_reminder";
  }
  if (/提醒.*训练|提醒.*运动|提醒.*活动/.test(text)) {
    return "create_reminder";
  }
  return "chat";
}
