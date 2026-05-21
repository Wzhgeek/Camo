import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  LogicalPosition,
  LogicalSize,
  Window,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
} from "@tauri-apps/api/window";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./platform";
import type { LayoutConfig, WindowFrame } from "../stores/settingsStore";
import { useSettingsStore } from "../stores/settingsStore";

export type ToolWindowKind = "chat" | "settings" | "reminders";
export type AppWindowKind = "pet" | ToolWindowKind | "reminder-alert" | "context-menu";
type FramedWindowKind = "pet" | ToolWindowKind;

const SAFE_MARGIN = 12;
const PET_BASE_SIZE = { width: 180, height: 210 };
const REMINDER_ALERT_SIZE = { width: 300, height: 220 };
const REMINDER_ALERT_LABELS = ["reminder-alert", "reminder-alert-1", "reminder-alert-2", "reminder-alert-3"] as const;
type ReminderAlertLabel = typeof REMINDER_ALERT_LABELS[number];
const REMINDER_ALERT_CASCADE_GAP = 28;
const CONTEXT_MENU_SIZE = { width: 112, height: 128 };
const FOLLOW_GAP = 14;
const MAX_RELATIVE_DISTANCE = 420;
const ALL_FRAMED_WINDOW_KINDS: FramedWindowKind[] = ["pet", "chat", "settings", "reminders"];

const TOOL_WINDOW_OPTIONS: Record<ToolWindowKind, {
  title: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}> = {
  chat: { title: "Camo Chat", width: 380, height: 560, minWidth: 320, minHeight: 360 },
  settings: { title: "Camo Settings", width: 360, height: 420, minWidth: 300, minHeight: 300 },
  reminders: { title: "Camo Reminders", width: 340, height: 460, minWidth: 300, minHeight: 320 },
};

function getWindowKindFromUrl(): AppWindowKind {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("window");
  if (value === "chat" || value === "settings" || value === "reminders") return value;
  if (value === "reminder-alert") return value;
  if (value === "context-menu") return value;
  return "pet";
}

export const currentWindowKind = getWindowKindFromUrl();

function isFramedWindowKind(kind: AppWindowKind): kind is FramedWindowKind {
  return kind !== "reminder-alert" && kind !== "context-menu";
}

function frameFor(layout: LayoutConfig, kind: FramedWindowKind): WindowFrame {
  return layout[kind];
}

function behaviorFor(kind: AppWindowKind) {
  const store = useSettingsStore();
  return kind === "pet" ? store.settings.windowPreferences.pet : store.settings.windowPreferences.tools;
}

function updateFrame(kind: FramedWindowKind, frame: Partial<WindowFrame>) {
  const store = useSettingsStore();
  store.updateLayout({
    [kind]: {
      ...frameFor(store.settings.layout, kind),
      ...frame,
    },
  } as Partial<LayoutConfig>);
}

async function getLogicalWorkArea() {
  const monitor = await currentMonitor().then((m) => m ?? primaryMonitor()).catch(() => null);
  if (!monitor) return null;
  const scaleFactor = monitor.scaleFactor || 1;
  return {
    x: monitor.workArea.position.x / scaleFactor,
    y: monitor.workArea.position.y / scaleFactor,
    width: monitor.workArea.size.width / scaleFactor,
    height: monitor.workArea.size.height / scaleFactor,
  };
}

async function getCurrentScaleFactor() {
  try {
    return await getCurrentWindow().scaleFactor();
  } catch {
    return 1;
  }
}

async function readCurrentLogicalFrame(): Promise<WindowFrame | null> {
  if (!isTauri) return null;
  try {
    const win = getCurrentWindow();
    const [position, size, scaleFactor] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      getCurrentScaleFactor(),
    ]);
    return {
      x: position.x / scaleFactor,
      y: position.y / scaleFactor,
      width: size.width / scaleFactor,
      height: size.height / scaleFactor,
    };
  } catch {
    return null;
  }
}

async function readLogicalFrame(win: Window | WebviewWindow): Promise<Required<WindowFrame> | null> {
  try {
    const [position, size, scaleFactor] = await Promise.all([
      win.outerPosition(),
      win.outerSize(),
      win.scaleFactor(),
    ]);
    return {
      x: position.x / scaleFactor,
      y: position.y / scaleFactor,
      width: size.width / scaleFactor,
      height: size.height / scaleFactor,
    };
  } catch {
    return null;
  }
}

function clampFrame(frame: WindowFrame, workArea: NonNullable<Awaited<ReturnType<typeof getLogicalWorkArea>>>): Required<WindowFrame> {
  const width = Math.min(frame.width, Math.max(80, workArea.width - SAFE_MARGIN * 2));
  const height = Math.min(frame.height, Math.max(80, workArea.height - SAFE_MARGIN * 2));
  const minX = workArea.x + SAFE_MARGIN;
  const minY = workArea.y + SAFE_MARGIN;
  const maxX = workArea.x + workArea.width - width - SAFE_MARGIN;
  const maxY = workArea.y + workArea.height - height - SAFE_MARGIN;
  const fallbackX = workArea.x + workArea.width - width - SAFE_MARGIN;
  const fallbackY = workArea.y + workArea.height - height - SAFE_MARGIN;

  return {
    x: Math.max(minX, Math.min(frame.x ?? fallbackX, Math.max(minX, maxX))),
    y: Math.max(minY, Math.min(frame.y ?? fallbackY, Math.max(minY, maxY))),
    width,
    height,
  };
}

async function clampCurrentWindow(kind: AppWindowKind) {
  if (!isFramedWindowKind(kind)) return;
  const frame = await readCurrentLogicalFrame();
  const workArea = await getLogicalWorkArea();
  if (!frame || !workArea) return;
  const clamped = clampFrame(frame, workArea);
  updateFrame(kind, clamped);
  if (
    Math.abs((frame.x ?? clamped.x) - clamped.x) > 1 ||
    Math.abs((frame.y ?? clamped.y) - clamped.y) > 1 ||
    Math.abs(frame.width - clamped.width) > 1 ||
    Math.abs(frame.height - clamped.height) > 1
  ) {
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(clamped.width, clamped.height));
    await win.setPosition(new LogicalPosition(clamped.x, clamped.y));
  }
}

function rectDistance(a: Required<WindowFrame>, b: Required<WindowFrame>) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const dx = Math.max(b.x - ax2, a.x - bx2, 0);
  const dy = Math.max(b.y - ay2, a.y - by2, 0);
  return Math.hypot(dx, dy);
}

function placeFollowerNearLeader(
  follower: Required<WindowFrame>,
  leader: Required<WindowFrame>,
  workArea: NonNullable<Awaited<ReturnType<typeof getLogicalWorkArea>>>,
) {
  const canPlaceRight = leader.x + leader.width + FOLLOW_GAP + follower.width + SAFE_MARGIN <= workArea.x + workArea.width;
  const canPlaceLeft = leader.x - FOLLOW_GAP - follower.width >= workArea.x + SAFE_MARGIN;
  const preferRight = leader.x + leader.width / 2 < workArea.x + workArea.width / 2;
  const x = preferRight
    ? (canPlaceRight ? leader.x + leader.width + FOLLOW_GAP : leader.x - FOLLOW_GAP - follower.width)
    : (canPlaceLeft ? leader.x - FOLLOW_GAP - follower.width : leader.x + leader.width + FOLLOW_GAP);

  return clampFrame({
    ...follower,
    x,
    y: leader.y + leader.height - follower.height,
  }, workArea);
}

async function setWindowFrame(win: Window | WebviewWindow, kind: FramedWindowKind, frame: Required<WindowFrame>) {
  await win.setSize(new LogicalSize(frame.width, frame.height)).catch(() => {});
  await win.setPosition(new LogicalPosition(frame.x, frame.y)).catch(() => {});
  updateFrame(kind, frame);
}

async function keepRelatedWindowsNear(movedKind: AppWindowKind) {
  if (!isFramedWindowKind(movedKind)) return;
  const workArea = await getLogicalWorkArea();
  if (!workArea) return;

  const movedWindow = await Window.getByLabel(movedKind === "pet" ? "main" : movedKind).catch(() => null);
  if (!movedWindow) return;
  const movedFrame = await readLogicalFrame(movedWindow);
  if (!movedFrame) return;

  if (movedKind === "pet") {
    for (const kind of ALL_FRAMED_WINDOW_KINDS) {
      if (kind === "pet") continue;
      const tool = await WebviewWindow.getByLabel(kind).catch(() => null);
      if (!tool) continue;
      const toolFrame = await readLogicalFrame(tool);
      if (!toolFrame || rectDistance(movedFrame, toolFrame) <= MAX_RELATIVE_DISTANCE) continue;
      await setWindowFrame(tool, kind, placeFollowerNearLeader(toolFrame, movedFrame, workArea));
    }
    return;
  }

  const pet = await Window.getByLabel("main").catch(() => null);
  if (!pet) return;
  const petFrame = await readLogicalFrame(pet);
  if (!petFrame || rectDistance(movedFrame, petFrame) <= MAX_RELATIVE_DISTANCE) return;
  await setWindowFrame(pet, "pet", placeFollowerNearLeader(petFrame, movedFrame, workArea));
}

async function defaultToolFrame(kind: ToolWindowKind): Promise<Required<WindowFrame>> {
  const store = useSettingsStore();
  const stored = frameFor(store.settings.layout, kind);
  const behavior = store.settings.windowPreferences.tools;
  const option = TOOL_WINDOW_OPTIONS[kind];
  const workArea = await getLogicalWorkArea();
  const width = stored.width || option.width;
  const height = stored.height || option.height;

  if (behavior.rememberPosition && workArea && typeof stored.x === "number" && typeof stored.y === "number") {
    return clampFrame({ ...stored, width, height }, workArea);
  }

  if (!workArea) return { x: 80, y: 80, width, height };

  const petFrame = await readCurrentLogicalFrame();
  const anchor = petFrame ?? frameFor(store.settings.layout, "pet");
  const anchorX = anchor.x ?? workArea.x + workArea.width - PET_BASE_SIZE.width - SAFE_MARGIN;
  const anchorY = anchor.y ?? workArea.y + workArea.height - PET_BASE_SIZE.height - SAFE_MARGIN;
  const anchorWidth = anchor.width || PET_BASE_SIZE.width;
  const anchorHeight = anchor.height || PET_BASE_SIZE.height;
  const rightX = anchorX + anchorWidth + FOLLOW_GAP;
  const leftX = anchorX - width - FOLLOW_GAP;
  const x = rightX + width + SAFE_MARGIN <= workArea.x + workArea.width ? rightX : leftX;
  const y = anchorY + anchorHeight - height;

  return clampFrame({ x, y, width, height }, workArea);
}

export async function openToolWindow(kind: ToolWindowKind) {
  if (!isTauri) return;

  const existing = await WebviewWindow.getByLabel(kind).catch(() => null);
  if (existing) {
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    return;
  }

  const option = TOOL_WINDOW_OPTIONS[kind];
  const frame = await defaultToolFrame(kind);
  const behavior = useSettingsStore().settings.windowPreferences.tools;
  updateFrame(kind, frame);

  const child = new WebviewWindow(kind, {
    url: `/?window=${kind}`,
    title: option.title,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    minWidth: option.minWidth,
    minHeight: option.minHeight,
    decorations: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: behavior.alwaysOnTop,
    visibleOnAllWorkspaces: behavior.alwaysOnTop,
    skipTaskbar: true,
    shadow: true,
    preventOverflow: { width: SAFE_MARGIN, height: SAFE_MARGIN },
  });

  child.once("tauri://created", () => {
    child.setFocus().catch(() => {});
  }).catch(() => {});
}

async function defaultContextMenuFrame(clientX: number, clientY: number): Promise<Required<WindowFrame>> {
  const workArea = await getLogicalWorkArea();
  const anchor = await readCurrentLogicalFrame();
  const width = CONTEXT_MENU_SIZE.width;
  const height = CONTEXT_MENU_SIZE.height;
  const x = (anchor?.x ?? 80) + clientX;
  const y = (anchor?.y ?? 80) + clientY;
  if (!workArea) return { x, y, width, height };
  return clampFrame({ x, y, width, height }, workArea);
}

export async function openContextMenuWindow(clientX: number, clientY: number) {
  if (!isTauri) return;
  const existing = await WebviewWindow.getByLabel("context-menu").catch(() => null);
  if (existing) await existing.close().catch(() => {});

  const frame = await defaultContextMenuFrame(clientX, clientY);
  const child = new WebviewWindow("context-menu", {
    url: "/?window=context-menu",
    title: "Camo Menu",
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    decorations: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    skipTaskbar: true,
    shadow: true,
    preventOverflow: { width: SAFE_MARGIN, height: SAFE_MARGIN },
  });

  child.once("tauri://created", () => {
    child.setFocus().catch(() => {});
  }).catch(() => {});
}

async function defaultReminderAlertFrame(slotIndex: number): Promise<Required<WindowFrame>> {
  const workArea = await getLogicalWorkArea();
  const width = REMINDER_ALERT_SIZE.width;
  const height = REMINDER_ALERT_SIZE.height;
  const offset = slotIndex * REMINDER_ALERT_CASCADE_GAP;
  if (!workArea) return { x: 120 + offset, y: 120 + offset, width, height };
  return clampFrame({
    width,
    height,
    x: workArea.x + (workArea.width - width) / 2 + offset,
    y: workArea.y + (workArea.height - height) / 2 + offset,
  }, workArea);
}

export async function openReminderAlertWindow(reminderId: string) {
  if (!isTauri) return;

  let label: ReminderAlertLabel = REMINDER_ALERT_LABELS[0];
  let slotIndex = 0;
  for (const [index, candidate] of REMINDER_ALERT_LABELS.entries()) {
    const existing = await WebviewWindow.getByLabel(candidate).catch(() => null);
    if (!existing) {
      label = candidate;
      slotIndex = index;
      break;
    }
    if (index === REMINDER_ALERT_LABELS.length - 1) {
      await existing.close().catch(() => {});
      label = candidate;
      slotIndex = index;
    }
  }

  const frame = await defaultReminderAlertFrame(slotIndex);
  const behavior = useSettingsStore().settings.windowPreferences.tools;
  const child = new WebviewWindow(label, {
    url: `/?window=reminder-alert&reminderId=${encodeURIComponent(reminderId)}`,
    title: "Camo Reminder",
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    minWidth: 260,
    minHeight: 180,
    decorations: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: behavior.alwaysOnTop,
    visibleOnAllWorkspaces: behavior.alwaysOnTop,
    skipTaskbar: false,
    shadow: false,
    preventOverflow: { width: SAFE_MARGIN, height: SAFE_MARGIN },
  });

  child.once("tauri://created", () => {
    child.setFocus().catch(() => {});
  }).catch(() => {});
}

export async function toggleToolWindow(kind: ToolWindowKind) {
  if (!isTauri) return;
  const existing = await WebviewWindow.getByLabel(kind).catch(() => null);
  if (existing) {
    await existing.close().catch(() => {});
    return;
  }
  await openToolWindow(kind);
}

export async function closeCurrentWindow() {
  if (!isTauri) {
    window.close();
    return;
  }
  await getCurrentWindow().close();
}

export async function syncPetWindowSize(scale: number) {
  if (!isTauri) return;
  const width = Math.round(PET_BASE_SIZE.width * scale);
  const height = Math.round(PET_BASE_SIZE.height * scale);
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(width, height)).catch(() => {});
  updateFrame("pet", { width, height });
  await clampCurrentWindow("pet").catch(() => {});
}

export async function applyCurrentWindowPreferences(kind: AppWindowKind) {
  if (!isTauri) return;
  const behavior = behaviorFor(kind);
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(behavior.alwaysOnTop).catch(() => {});
  await win.setVisibleOnAllWorkspaces(behavior.alwaysOnTop).catch(() => {});
}

export async function resetCurrentWindowPosition(kind: AppWindowKind) {
  if (!isTauri) return;
  if (!isFramedWindowKind(kind)) return;
  const behavior = behaviorFor(kind);
  if (behavior.positionMode === "free") return;
  const workArea = await getLogicalWorkArea();
  const frame = await readCurrentLogicalFrame();
  if (!workArea || !frame) return;
  const x = behavior.positionMode === "left-bottom"
    ? workArea.x + SAFE_MARGIN
    : workArea.x + workArea.width - frame.width - SAFE_MARGIN;
  const nextFrame = clampFrame({
    ...frame,
    x,
    y: workArea.y + workArea.height - frame.height - SAFE_MARGIN,
  }, workArea);
  await getCurrentWindow().setPosition(new LogicalPosition(nextFrame.x, nextFrame.y)).catch(() => {});
  updateFrame(kind, nextFrame);
}

export async function installWindowFramePersistence(kind: AppWindowKind): Promise<UnlistenFn[]> {
  if (!isTauri) return [];
  if (!isFramedWindowKind(kind)) return [];
  const win = getCurrentWindow();
  const unlisteners: UnlistenFn[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleSaveAndClamp = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (behaviorFor(kind).locked) return;
      clampCurrentWindow(kind)
        .then(() => keepRelatedWindowsNear(kind))
        .catch(() => {});
    }, 250);
  };

  unlisteners.push(await win.onMoved(scheduleSaveAndClamp));
  unlisteners.push(await win.onResized(scheduleSaveAndClamp));
  scheduleSaveAndClamp();
  return unlisteners;
}
