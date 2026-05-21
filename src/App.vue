<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import CamoPet from "./components/CamoPet.vue";
import ChatPanel from "./components/ChatPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import ReminderPanel from "./components/ReminderPanel.vue";
import NotesPanel from "./components/NotesPanel.vue";
import StickyNoteWindow from "./components/StickyNoteWindow.vue";
import ReminderBubble from "./components/ReminderBubble.vue";
import { useCamoStore } from "./stores/camoStore";
import { useChatStore } from "./stores/chatStore";
import { useReminderStore } from "./stores/reminderStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useAffectionStore } from "./stores/affectionStore";
import { ReminderScheduler } from "./core/reminder/scheduler";
import { isTauri } from "./core/platform";
import {
  applyCurrentWindowPreferences,
  closeCurrentWindow,
  currentWindowKind,
  installWindowFramePersistence,
  openContextMenuWindow,
  openReminderAlertWindow,
  openStickyNoteWindow,
  openToolWindow,
  openUpdateDialogWindow,
  resetCurrentWindowPosition,
  syncPetWindowSize,
  toggleToolWindow,
} from "./core/windowManager";
import { applyAppearance, darkModeLabel, nextDarkModePreference } from "./core/appearance";
import { playReminderSound, playSoundFile } from "./core/audio";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { version as appVersion } from "../package.json";

const camo = useCamoStore();
const chatStore = useChatStore();
const reminderStore = useReminderStore();
const settingsStore = useSettingsStore();
const affectionStore = useAffectionStore();
const { state, asset } = storeToRefs(camo);
const { llmPhase } = storeToRefs(chatStore);
const scale = ref(settingsStore.settings.layout.scale);
const petOffset = ref({ x: 0, y: 0 });
const contextMenu = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
const isPetWindow = computed(() => currentWindowKind === "pet");
const isContextMenuWindow = computed(() => currentWindowKind === "context-menu");
const isUpdateDialog = computed(() => currentWindowKind === "update-dialog");
const currentBehavior = computed(() => isPetWindow.value
  ? settingsStore.settings.windowPreferences.pet
  : settingsStore.settings.windowPreferences.tools);
const statusStyle = computed(() => settingsStore.settings.appearance.statusIndicatorStyle);

const petSide = computed<"left" | "right">(() => {
  const midX = window.innerWidth / 2;
  return petOffset.value.x < -midX + 200 ? "left" : "right";
});

let reminderSoundTimer: ReturnType<typeof setInterval> | undefined;
type UpdateDialogData = {
  status?: "checking" | "available" | "latest" | "error" | "downloading" | "installed";
  version?: string;
  message?: string;
};

function stopReminderSoundLoop() {
  if (reminderSoundTimer) {
    clearInterval(reminderSoundTimer);
    reminderSoundTimer = undefined;
  }
}

function startReminderSoundLoop(type: "water" | "exercise" | "normal", volume: number) {
  stopReminderSoundLoop();
  const paths = settingsStore.settings.appearance.customSoundPaths;
  const play = () => {
    const dataUrl = paths[type];
    if (dataUrl) playSoundFile(dataUrl, volume).catch(() => playReminderSound(type, volume));
    else playReminderSound(type, volume);
  };
  play();
  reminderSoundTimer = setInterval(play, 2000);
}

const scheduler = new ReminderScheduler(
  (reminder) => {
    const typeMap = { water: "water", exercise: "exercise", normal: "normal" } as const;
    const t = typeMap[reminder.type];
    const app = settingsStore.settings.appearance;
    affectionStore.logEvent(`reminder_triggered_${t}`, 0);
    if (app.reminderSound !== "off") startReminderSoundLoop(t, app.soundVolume);
    camo.transition({ type: "REMINDER_TRIGGERED", reminderType: t });
    if (isTauri) {
      localStorage.setItem(`camo.activeReminder.${reminder.id}`, JSON.stringify(reminder));
      void openReminderAlertWindow(reminder.id);
    } else {
      reminderStore.trigger(reminder);
    }
  },
  () => settingsStore.settings.waterReminder,
  (ts) => reminderStore.setNextWaterAt(ts),
  (id, ts) => reminderStore.setNextTrigger(id, ts),
);

watch(() => reminderStore.activeReminder, (val) => {
  if (!val) stopReminderSoundLoop();
});

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const skipCounts: Record<string, number> = {};
const showToast = ref(false);
const isFocusing = ref(false);
const focusRemaining = ref(0);
let focusTimer: ReturnType<typeof setInterval> | undefined;
let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
let frameUnlisteners: UnlistenFn[] = [];
let focusUnlisten: UnlistenFn | undefined;
let updateDialogUnlisten: UnlistenFn | undefined;
let lastReminderActionAt = 0;

function applyLocalWindowVariables() {
  const root = document.documentElement;
  root.style.setProperty("--camo-pet-opacity", String(settingsStore.settings.windowPreferences.pet.opacity));
  root.style.setProperty("--camo-tool-opacity", String(settingsStore.settings.windowPreferences.tools.opacity));
  root.style.setProperty("--camo-tool-opacity-pct", `${Math.round(settingsStore.settings.windowPreferences.tools.opacity * 100)}%`);
}

function clearInactivityTimer() {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = undefined; }
}

function resetInactivityTimer() {
  clearInactivityTimer();
  if (state.value === "sleepy") { camo.returnToIdle(0); return; }
  if (state.value !== "idle") return;
  inactivityTimer = setTimeout(() => camo.transition({ type: "IDLE_TIMEOUT" }), IDLE_TIMEOUT_MS);
}

function handleReminderAction(payload: { action?: string; reminderId?: string; reminderType?: string; createdAt?: number }) {
  stopReminderSoundLoop();
  const action = payload.action ?? "";
  const createdAt = payload.createdAt ?? 0;
  if (!isPetWindow.value || createdAt <= lastReminderActionAt) return;
  lastReminderActionAt = createdAt;
  if (action === "later") {
    affectionStore.logEvent("reminder_later", 0);
    if (payload.reminderType === "water" || payload.reminderId === "__water__") {
      scheduler.snoozeWater(10);
    } else if (payload.reminderId) {
      scheduler.resetReminder(payload.reminderId);
    }
  }
  reminderStore.refreshReminders();
  if (action === "done") {
    camo.transition({ type: "TASK_DONE" });
    camo.returnToIdle(2500);
    skipCounts[payload.reminderType ?? ""] = 0;
    affectionStore.adjust("reminder_done", 3);
  } else if (action === "skip") {
    affectionStore.logEvent("reminder_skip", 0);
    const t = payload.reminderType ?? "normal";
    skipCounts[t] = (skipCounts[t] ?? 0) + 1;
    if (skipCounts[t] >= 3) {
      skipCounts[t] = 0;
      affectionStore.adjust("reminder_skipped_x3", -2);
    }
  }
}

function handleBeforeUnload() {
  const st = affectionStore.state;
  if (st.lastInteraction) affectionStore.adjust("app_close", -1);
  affectionStore.markClose();
}

function handleStorageEvent(e: StorageEvent) {
  if (!e.newValue) return;
  try {
    if (e.key === "camo.reminderAction") {
      handleReminderAction(JSON.parse(e.newValue));
    } else if (e.key === TOAST_KEY) {
      const data = JSON.parse(e.newValue);
      if (data.msg === "check-update") {
        runUpdateCheck();
      } else {
        showToastMsg(data.msg, data.duration ?? 3000);
      }
    } else if (e.key === "camo:command") {
      const data = JSON.parse(e.newValue);
      if (data.cmd === "open-settings") void openToolWindow("settings");
      if (data.cmd === "toggle-focus") {
        if (isFocusing.value) stopFocusMode();
        else startFocusMode();
      }
    }
  } catch {}
}

const updateData = ref<UpdateDialogData>({});

function readUpdateInfo() {
  try {
    const raw = localStorage.getItem("camo:updateInfo");
    if (raw) updateData.value = JSON.parse(raw);
  } catch {}
}

async function publishUpdateDialogData(data: UpdateDialogData) {
  try { localStorage.setItem("camo:updateInfo", JSON.stringify(data)); } catch {}
  if (isUpdateDialog.value) {
    updateData.value = data;
    await fitUpdateDialogWindow();
    return;
  }
  if (!isTauri) return;
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("update-dialog", "camo-update-info", data);
  } catch {}
}

async function fitUpdateDialogWindow() {
  if (!isTauri || !isUpdateDialog.value) return;
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const surface = document.querySelector<HTMLElement>(".update-dialog");
  if (!surface) return;
  const rect = surface.getBoundingClientRect();
  try {
    const { LogicalPosition, LogicalSize, currentMonitor, getCurrentWindow, primaryMonitor } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const monitor = await currentMonitor().then((m) => m ?? primaryMonitor()).catch(() => null);
    const scaleFactor = monitor?.scaleFactor || 1;
    const workArea = monitor
      ? {
          x: monitor.workArea.position.x / scaleFactor,
          y: monitor.workArea.position.y / scaleFactor,
          width: monitor.workArea.size.width / scaleFactor,
          height: monitor.workArea.size.height / scaleFactor,
        }
      : null;
    const maxWidth = workArea ? Math.max(260, workArea.width - 24) : 520;
    const width = Math.min(Math.max(Math.ceil(rect.width) + 18, 320), maxWidth);
    const height = Math.max(Math.ceil(rect.height) + 4, 48);
    await win.setSize(new LogicalSize(width, height));
    if (workArea) {
      await win.setPosition(new LogicalPosition(
        Math.round(workArea.x + (workArea.width - width) / 2),
        Math.round(workArea.y + (workArea.height - height) / 2),
      ));
    }
    await win.show().catch(() => {});
    await win.setFocus().catch(() => {});
  } catch {}
}

function compareVersions(a: string, b: string) {
  const pa = a.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function readLatestReleaseVersion() {
  const response = await fetch("https://api.github.com/repos/Wzhgeek/Camo/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub latest release failed: ${response.status}`);
  const data = await response.json() as { tag_name?: string; name?: string };
  return (data.tag_name || data.name || "").replace(/^Camo\s+/i, "").trim();
}

async function publishFallbackUpdateResult() {
  try {
    const latest = await withTimeout(readLatestReleaseVersion(), 5000);
    if (latest && compareVersions(latest, appVersion) > 0) {
      await publishUpdateDialogData({ status: "available", version: latest });
      return;
    }
    await publishUpdateDialogData({
      status: "latest",
      message: `当前版本 v${appVersion} 已是最新。`,
    });
  } catch {
    await publishUpdateDialogData({ status: "error", message: "检查更新失败，请稍后重试。" });
  }
}

async function performUpdateCheckInDialog() {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await withTimeout(check(), 5000);
    if (update) {
      await publishUpdateDialogData({ status: "available", version: update.version });
    } else {
      await publishUpdateDialogData({
        status: "latest",
        message: `当前版本 v${appVersion} 已是最新。`,
      });
    }
  } catch {
    await publishFallbackUpdateResult();
  }
}

async function runUpdateCheck() {
  if (isPetWindow.value) showToastMsg("正在检查更新...");
  else publishToast("正在检查更新...", 3000);
  const checking: UpdateDialogData = { status: "checking", message: "正在检查更新..." };
  await openUpdateDialogWindow(checking).catch(() => {
    showToastMsg("更新窗口打开失败。", 3000);
  });
}

watch(state, (s) => {
  if (s === "idle") resetInactivityTimer();
  else clearInactivityTimer();
});

onMounted(() => {
  applyAppearance(settingsStore.settings.appearance);
  applyLocalWindowVariables();
  applyCurrentWindowPreferences(currentWindowKind);
  resetCurrentWindowPosition(currentWindowKind);
  installWindowFramePersistence(currentWindowKind).then((unlisteners) => {
    frameUnlisteners = unlisteners;
  });
  if (isContextMenuWindow.value && isTauri) {
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) closeCurrentWindow().catch(() => {});
      }).then((unlisten) => { focusUnlisten = unlisten; }).catch(() => {});
    }).catch(() => {});
  }
  if (isUpdateDialog.value) {
    readUpdateInfo();
    void fitUpdateDialogWindow();
    if (updateData.value.status === "checking") {
      void performUpdateCheckInDialog();
    }
    if (isTauri) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<UpdateDialogData>("camo-update-info", async ({ payload }) => {
          updateData.value = payload;
          await fitUpdateDialogWindow();
          if (payload.status === "checking") void performUpdateCheckInDialog();
        }).then((unlisten) => { updateDialogUnlisten = unlisten; }).catch(() => {});
      }).catch(() => {});
    }
  }

  if (isPetWindow.value) {
    scheduler.start();
    syncPetWindowSize(scale.value);
    settingsStore.settings.stickyNotes.forEach((note, index) => {
      if (note.enabled && isTauri) void openStickyNoteWindow(note.id, index);
    });
    window.addEventListener("mousemove", resetInactivityTimer, { passive: true });
    window.addEventListener("keydown", resetInactivityTimer, { passive: true });
    window.addEventListener("click", resetInactivityTimer, { passive: true });
    window.addEventListener("storage", handleStorageEvent);
    window.addEventListener("beforeunload", handleBeforeUnload);
    resetInactivityTimer();
    if (isTauri) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen("camo-open-settings", () => { void openToolWindow("settings"); }).catch(() => {});
      }).catch(() => {});
      import("@tauri-apps/plugin-updater").then(({ check }) =>
        check().then((update) => { if (update) void update.downloadAndInstall(); }).catch(() => {})
      ).catch(() => {});
    }
    const _st = affectionStore.state;
    const hrs = _st.lastClose ? (Date.now() - new Date(_st.lastClose).getTime()) / 3600000 : -1;
    if (hrs > 24) {
      affectionStore.adjust("idle_24h", -3);
    } else if (hrs > 1) {
      affectionStore.adjust("online_hour", Math.min(Math.floor(hrs), 5));
    }
    if (hrs > 0.5 && _st.score > 70) {
      setTimeout(() => showToastMsg("你回来啦！❤️", 3000), 1500);
    }
  }
});

onUnmounted(() => {
  stopReminderSoundLoop();
  stopFocusMode();
  frameUnlisteners.forEach((unlisten) => unlisten());
  frameUnlisteners = [];
  focusUnlisten?.();
  focusUnlisten = undefined;
  updateDialogUnlisten?.();
  updateDialogUnlisten = undefined;
  if (isPetWindow.value) scheduler.stop();
  clearInactivityTimer();
  window.removeEventListener("mousemove", resetInactivityTimer);
  window.removeEventListener("keydown", resetInactivityTimer);
  window.removeEventListener("click", resetInactivityTimer);
  window.removeEventListener("storage", handleStorageEvent);
  window.removeEventListener("beforeunload", handleBeforeUnload);
});

watch(llmPhase, (phase) => {
  if (phase === "thinking") camo.transition({ type: "USER_SENT_MESSAGE" });
  else if (phase === "answering") camo.transition({ type: "LLM_STREAM_START" });
  else if (phase === "done") {
    camo.transition({ type: "TASK_DONE" });
    camo.returnToIdle(1500);
  }
  else camo.returnToIdle(700);
});

watch(() => settingsStore.settings.layout.scale, (nextScale) => {
  scale.value = nextScale;
  if (isPetWindow.value) syncPetWindowSize(nextScale);
});

watch(() => settingsStore.settings.appearance, (appearance) => {
  applyAppearance(appearance);
}, { deep: true });

watch(() => settingsStore.settings.windowPreferences, () => {
  applyLocalWindowVariables();
  applyCurrentWindowPreferences(currentWindowKind);
  resetCurrentWindowPosition(currentWindowKind);
}, { deep: true });

function handlePetAffection() {
  camo.transition({ type: "PET_CLICKED" });
  camo.returnToIdle(500);
  affectionStore.adjust("pet_single_click", 1, { dailyLimit: 5 });
}

function handlePetOpenChat() {
  toggleToolWindow("chat");
  camo.transition({ type: "PET_CLICKED" });
  camo.returnToIdle(400);
}

function toggleDarkMode() {
  settingsStore.updateAppearance({
    darkMode: nextDarkModePreference(settingsStore.settings.appearance.darkMode),
  });
  closeContextMenu();
}

function closeChatPanel() {
  closeCurrentWindow();
}

function closeSettingsPanel() {
  closeCurrentWindow();
}

function closeReminderPanel() {
  closeCurrentWindow();
}

function handlePetDrag(pos: { x: number; y: number }) {
  if (isTauri) return;
  petOffset.value = pos;
}

function handleContextMenu(e: MouseEvent) {
  if (!isPetWindow.value) return;
  e.preventDefault();
  if (isTauri) {
    void openContextMenuWindow(e.clientX, e.clientY);
    return;
  }
  contextMenu.value = {
    show: true,
    x: Math.min(e.clientX, window.innerWidth - 200),
    y: e.clientY > window.innerHeight - 400 ? window.innerHeight - 400 : Math.max(4, e.clientY),
  };
}

const toastMessage = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToastMsg(msg: string, duration = 3000) {
  toastMessage.value = msg;
  showToast.value = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { showToast.value = false; }, duration);
}

const TOAST_KEY = "camo:toast";

function publishToast(msg: string, duration = 3000) {
  try {
    localStorage.setItem(TOAST_KEY, JSON.stringify({ msg, duration, t: Date.now() }));
  } catch {}
}

async function handleCheckUpdate() {
  if (isTauri) {
    await runUpdateCheck();
  } else {
    showToastMsg("检查更新仅在桌面应用内可用。", 3000);
  }
  closeContextMenu();
}

function closeContextMenu() {
  contextMenu.value.show = false;
  if (isContextMenuWindow.value) closeCurrentWindow().catch(() => {});
}

function toggleLock() {
  const current = settingsStore.settings.windowPreferences.pet.locked;
  settingsStore.updateWindowPreferences({ pet: { ...settingsStore.settings.windowPreferences.pet, locked: !current } });
  closeContextMenu();
}

function openSettings() {
  void openToolWindow("settings").finally(closeContextMenu);
}

function openReminders() {
  void openToolWindow("reminders").finally(closeContextMenu);
}

function openNotes() {
  void openToolWindow("notes").finally(closeContextMenu);
}

function startFocusMode() {
  if (!isPetWindow.value) {
    try { localStorage.setItem("camo:command", JSON.stringify({ cmd: "toggle-focus", t: Date.now() })); } catch {}
    closeContextMenu();
    return;
  }
  closeContextMenu();
  const dur = settingsStore.settings.focusDuration * 60;
  focusRemaining.value = dur;
  isFocusing.value = true;
  camo.transition({ type: "FOCUS_START" });
  if (focusTimer) clearInterval(focusTimer);
  focusTimer = setInterval(() => {
    focusRemaining.value--;
    if (focusRemaining.value <= 0) {
      stopFocusMode();
      showToastMsg("专注完成！休息一下吧。");
      playReminderSound("exercise", settingsStore.settings.appearance.soundVolume);
    }
  }, 1000);
}

function stopFocusMode() {
  if (!isPetWindow.value) {
    try { localStorage.setItem("camo:command", JSON.stringify({ cmd: "toggle-focus", t: Date.now() })); } catch {}
    closeContextMenu();
    return;
  }
  if (focusTimer) { clearInterval(focusTimer); focusTimer = undefined; }
  isFocusing.value = false;
  focusRemaining.value = 0;
  camo.returnToIdle(0);
}

function formatFocusTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function exitApp() {
  closeContextMenu();
  try {
    const { getAllWindows } = await import("@tauri-apps/api/window");
    const windows = await getAllWindows();
    await Promise.all(windows.map((win) => win.close().catch(() => {})));
  } catch {
    window.close();
  }
}

async function doUpdate() {
  publishToast("正在下载更新...", 5000);
  await publishUpdateDialogData({ status: "downloading", message: "正在下载更新..." });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      await update.downloadAndInstall();
      publishToast("更新已安装，重启应用后生效。", 5000);
      await publishUpdateDialogData({ status: "installed", message: "更新已安装，重启应用后生效。" });
      await closeCurrentWindow();
    } else {
      await publishUpdateDialogData({ status: "latest", message: "当前已是最新版本。" });
    }
  } catch {
    await publishUpdateDialogData({ status: "error", message: "下载更新失败，请稍后重试。" });
  }
}

function closeUpdateDialog() {
  closeCurrentWindow().catch(() => {});
}

function startUpdateDialogDrag(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("button")) return;
  if (!isTauri) return;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
    .catch(() => {});
}

function handleWheel(e: WheelEvent) {
  if (e.deltaY < 0) {
    scale.value = Math.min(2, +(scale.value + 0.05).toFixed(2));
  } else {
    scale.value = Math.max(0.5, +(scale.value - 0.05).toFixed(2));
  }
  settingsStore.updateLayout({ scale: scale.value });
  syncPetWindowSize(scale.value);
}
</script>

<template>
  <main
    class="camo-workspace"
    :class="`window-${currentWindowKind}`"
    @contextmenu="handleContextMenu"
    @click="closeContextMenu"
  >
    <ChatPanel
      v-if="currentWindowKind === 'chat'"
      standalone
      :locked="currentBehavior.locked"
      @close="closeChatPanel"
    />
    <CamoPet
      v-if="currentWindowKind === 'pet'"
      :state="state"
      :asset="asset"
      :panel-open="false"
      :scale="scale"
      :offset="petOffset"
      :locked="currentBehavior.locked"
      :status-style="statusStyle"
      @single-click="handlePetAffection"
      @double-click="handlePetOpenChat"
      @wheel="handleWheel"
      @drag="handlePetDrag"
    />

    <div v-if="showToast" class="startup-toast">
      {{ toastMessage }}
    </div>

    <div v-if="isFocusing && isPetWindow" class="focus-timer">
      {{ formatFocusTime(focusRemaining) }}
    </div>

    <div
      v-if="contextMenu.show || isContextMenuWindow"
      data-camo-surface
      class="context-menu"
      :class="{ standalone: isContextMenuWindow }"
      :style="isContextMenuWindow ? undefined : { left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <button class="context-item" @click="openSettings">设置</button>
      <button class="context-item" @click="openReminders">提醒</button>
      <button class="context-item" @click="openNotes">便签</button>
      <button class="context-item" @click="toggleLock">{{ settingsStore.settings.windowPreferences.pet.locked ? '✓ 已锁定' : '锁定位置' }}</button>
      <button class="context-item" @click="toggleDarkMode">{{ darkModeLabel(settingsStore.settings.appearance.darkMode) }}</button>
      <button v-if="isTauri" class="context-item" @click="handleCheckUpdate">检查更新</button>
      <button class="context-item" @click="isFocusing ? stopFocusMode() : startFocusMode()">{{ isFocusing ? '停止专注' : '开始专注' }}</button>
      <button class="context-item danger" @click="exitApp">退出 Camo</button>
    </div>

    <div v-if="isUpdateDialog" data-camo-surface class="update-dialog" @pointerdown="startUpdateDialogDrag" @click.stop>
      <div v-if="updateData.status === 'checking' || updateData.status === 'downloading'" class="update-body">
        <span class="update-msg">{{ updateData.message || '正在检查更新...' }}</span>
      </div>
      <div v-else-if="updateData.version" class="update-body">
        <span class="update-msg">发现新版本 {{ updateData.version }}，是否下载？</span>
        <div class="update-actions">
          <button class="update-btn primary" @click="doUpdate">下载</button>
          <button class="update-btn" @click="closeUpdateDialog">取消</button>
        </div>
      </div>
      <div v-else class="update-body">
        <span class="update-msg">{{ updateData.message || '当前已是最新版本。' }}</span>
        <div class="update-actions">
          <button class="update-btn primary" @click="closeUpdateDialog">确定</button>
        </div>
      </div>
      <button class="update-close" aria-label="关闭" @click.stop="closeUpdateDialog">×</button>
    </div>
    <SettingsPanel
      v-if="currentWindowKind === 'settings'"
      standalone
      :locked="currentBehavior.locked"
      :pet-side="petSide"
      @close="closeSettingsPanel"
      @check-update="handleCheckUpdate"
    />
    <ReminderPanel
      v-if="currentWindowKind === 'reminders'"
      standalone
      :locked="currentBehavior.locked"
      :pet-side="petSide"
      @close="closeReminderPanel"
    />
    <NotesPanel
      v-if="currentWindowKind === 'notes'"
      standalone
      :locked="currentBehavior.locked"
      @close="closeCurrentWindow"
    />
    <StickyNoteWindow v-if="currentWindowKind === 'sticky-note'" />
    <ReminderBubble v-if="currentWindowKind === 'pet' || currentWindowKind === 'reminder-alert'" />
  </main>
</template>

<style>
.camo-workspace {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 12px;
  padding: 14px;
}
.camo-workspace.window-pet {
  display: grid;
  place-items: center;
  padding: 0;
}
.camo-workspace.window-chat,
.camo-workspace.window-settings,
.camo-workspace.window-reminders,
.camo-workspace.window-notes,
.camo-workspace.window-sticky-note {
  display: block;
  padding: 0;
  background: transparent;
}
.camo-workspace.window-reminder-alert {
  display: grid;
  place-items: center;
  padding: 0;
  background: transparent;
}
.camo-workspace.window-context-menu {
  display: block;
  padding: 0;
  background: transparent;
}
html[data-tauri] .camo-workspace { background: transparent; }
.chat-panel { align-self: flex-end; }

.pet-shell {
  position: relative;
  flex: 0 0 auto;
  width: 156px;
  height: 188px;
  display: grid;
  place-items: end center;
  user-select: none;
  opacity: var(--camo-pet-opacity, 1);
}
.pet-button {
  position: relative;
  width: 138px;
  height: 150px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  filter: drop-shadow(0 18px 26px rgba(50,38,71,0.2));
  animation: camo-float 3.5s ease-in-out infinite;
  transition: transform 180ms ease, filter 180ms ease;
}
.pet-button:hover {
  transform: translateY(-2px) scale(1.02);
  filter: drop-shadow(0 20px 30px rgba(50,38,71,0.25));
}
.pet-button:active { transform: translateY(1px) scale(0.98); }
.pet-image {
  display: block;
  width: 132px;
  height: 132px;
  object-fit: contain;
  pointer-events: none;
}
.state-dot {
  position: absolute;
  right: 12px;
  bottom: 14px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #8d63e8;
  border: 2px solid rgba(255,255,255,0.9);
  box-shadow: 0 0 0 5px rgba(141,99,232,0.12);
}
.state-dot.style-pill {
  width: 34px;
  border-radius: 999px;
}
.state-dot[data-state="thinking"],
.state-dot[data-state="answering"] { background: #3b82f6; }
.state-dot[data-state="water"] { background: #06b6d4; }
.state-dot[data-state="exercise"],
.state-dot[data-state="done"] { background: #22c55e; }
html[data-camo-status-preset="cool"] .state-dot { background: #0ea5e9; }
html[data-camo-status-preset="cool"] .state-dot[data-state="water"] { background: #14b8a6; }
html[data-camo-status-preset="warm"] .state-dot { background: #f59e0b; }
html[data-camo-status-preset="warm"] .state-dot[data-state="exercise"],
html[data-camo-status-preset="warm"] .state-dot[data-state="done"] { background: #f97316; }

.chat-panel {
  width: min(360px, calc(100vw - 190px));
  height: min(510px, calc(100vh - 28px));
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  overflow: hidden;
  border: 1px solid var(--camo-border);
  border-radius: 18px;
  color: var(--camo-text);
  background: color-mix(in srgb, var(--camo-surface) var(--camo-tool-opacity-pct), transparent);
  box-shadow: 0 24px 64px rgba(53,42,70,0.2);
  backdrop-filter: blur(24px);
}
.chat-panel.standalone-panel {
  width: 100vw;
  height: 100vh;
  border: 1px solid rgba(71,53,93,0.16);
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(53,42,70,0.22);
}
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(79,58,105,0.08);
  cursor: grab;
  user-select: none;
}
.chat-header:active { cursor: grabbing; }
.eyebrow {
  margin: 0;
  color: var(--camo-primary);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: #666;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
}
.close-btn:hover { background: rgba(0,0,0,0.06); }
.status {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(95,79,118,0.08);
  color: var(--camo-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.status.active { color: #315ea8; background: rgba(59,130,246,0.12); }
.session-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(79,58,105,0.06);
  position: relative;
}
.session-selector {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #4a3d5c;
  overflow: hidden;
}
.session-selector:hover { background: rgba(95,79,118,0.06); }
.session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arrow { font-size: 10px; color: #999; }
.sess-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 4px;
  color: #666;
  line-height: 1;
}
.sess-btn:hover { background: rgba(0,0,0,0.06); }
.session-dropdown {
  position: absolute;
  top: 100%;
  left: 8px;
  right: 8px;
  background: #fff;
  border: 1px solid rgba(79,58,105,0.12);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 10;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: none;
}
.session-dropdown::-webkit-scrollbar { display: none; }
.session-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  color: #4a3d5c;
}
.session-item:hover { background: rgba(95,79,118,0.05); }
.session-item.active { background: rgba(113,87,157,0.08); font-weight: 600; }
.item-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.del-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #999;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 1;
}
.del-btn:hover { color: #e53e3e; background: rgba(229,62,62,0.08); }
.message-list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 12px;
  overflow-y: auto;
}
.message {
  max-width: 86%;
  padding: 10px 12px;
  border-radius: 15px;
  font-size: 14px;
  line-height: 1.45;
}
.message p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.thinking-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(120,80,200,0.06);
  font-size: 11px;
  color: #7c3aed;
  font-weight: 500;
  margin-bottom: 4px;
}
.thinking-active {
  border-color: rgba(124,58,237,0.25);
  background: rgba(120,80,200,0.05);
}
.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #7c3aed;
  font-weight: 600;
  margin-bottom: 4px;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(124,58,237,0.2);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.thinking-block {
  margin-bottom: 6px;
  border: 1px solid rgba(120,80,200,0.12);
  border-radius: 6px;
  padding: 4px 6px;
  background: rgba(120,80,200,0.04);
  font-size: 11px;
}
.thinking-block summary {
  cursor: pointer;
  color: #7c3aed;
  font-size: 10px;
  font-weight: 600;
  user-select: none;
}
.thinking-text {
  margin: 2px 0 0;
  font-size: 10px;
  color: inherit;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.4;
}
.thinking-text p { margin: 0; }
.thinking-text ol, .thinking-text ul { margin: 0; padding-left: 14px; }
.thinking-text li { margin: 0; }
.thinking-text code {
  background: rgba(0,0,0,0.05);
  padding: 0 2px;
  border-radius: 2px;
  font-size: 9px;
}
.msg-content { margin: 0; }
.msg-content p { margin: 0 0 4px; }
.msg-content p:last-child { margin-bottom: 0; }
.msg-content code {
  background: rgba(0,0,0,0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-family: monospace;
}
.msg-content pre {
  background: rgba(0,0,0,0.06);
  padding: 6px 8px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 4px 0;
}
.msg-content pre code {
  background: none;
  padding: 0;
  font-size: 11px;
}
.msg-content ul, .msg-content ol {
  margin: 4px 0;
  padding-left: 18px;
}
.msg-content li { margin: 2px 0; }
.msg-content h1, .msg-content h2, .msg-content h3 {
  font-size: 13px;
  margin: 6px 0 2px;
}
.message.user .msg-content code {
  background: rgba(255,255,255,0.2);
}
.message.assistant {
  align-self: flex-start;
  color: var(--camo-chat-text);
  background: color-mix(in srgb, var(--camo-surface-strong) 88%, var(--camo-primary) 12%);
  border-bottom-left-radius: 5px;
}
.message.assistant .msg-content,
.message.assistant .msg-content *,
.message.assistant .thinking-text,
.message.assistant .thinking-text * {
  color: inherit;
}
.message.user {
  align-self: flex-end;
  color: #fff;
  background: var(--camo-primary);
  border-bottom-right-radius: 5px;
}
.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(79,58,105,0.08);
}
.composer input {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(79,58,105,0.12);
  border-radius: 12px;
  color: var(--camo-text);
  background: var(--camo-surface-strong);
  outline: none;
}
.composer input:focus {
  border-color: rgba(127,90,240,0.62);
  box-shadow: 0 0 0 3px rgba(127,90,240,0.12);
}
.composer button {
  height: 40px;
  min-width: 58px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  color: #fff;
  background: #2f293a;
  font-weight: 700;
}
.composer button:disabled { opacity: 0.45; }
.stop-btn {
  height: 40px;
  width: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #ef4444;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.stop-btn:hover { background: #dc2626; }
.stop-icon {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 2px;
}

/* Hidden scrollbars */
.message-list,
.tab-body,
.thinking-text {
  scrollbar-width: none;
}
.message-list::-webkit-scrollbar,
.tab-body::-webkit-scrollbar,
.thinking-text::-webkit-scrollbar {
  display: none;
}

@keyframes camo-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -8px; }
}

.context-menu {
  position: fixed;
  padding: 5px;
  border-radius: 12px;
  background: var(--camo-surface-strong);
  border: 1px solid var(--camo-border);
  box-shadow: 0 4px 12px rgba(53,42,70,0.14);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  z-index: 9999;
  user-select: none;
}
.context-menu.standalone {
  position: static;
  width: 100vw;
  height: 100vh;
  justify-content: flex-start;
}
.context-item {
  display: block;
  width: 100%;
  padding: 4px 7px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--camo-menu-text);
  font-size: 11px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.35;
}
.context-item:hover { background: rgba(127,90,240,0.1); color: var(--camo-menu-text); }
.context-item.danger { color: #d92d20; }
.context-item.danger:hover { background: rgba(217,45,32,0.08); color: #b42318; }
.camo-workspace.window-update-dialog {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
}
.update-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 8px;
  width: max-content;
  min-width: 0;
  max-width: calc(100vw - 2px);
  padding: 9px 14px;
  border-radius: 999px;
  background: var(--camo-surface-strong);
  border: 1px solid var(--camo-border);
  box-shadow: 0 6px 16px rgba(28, 20, 40, 0.10);
  color: var(--camo-text);
  font-size: 12px;
  line-height: 1.2;
  user-select: none;
}
.update-close {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: -4px -4px 0 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--camo-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.update-close:hover {
  background: rgba(127,90,240,0.1);
  color: var(--camo-text);
}
.update-body {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: auto;
  min-width: 0;
}
.update-msg {
  flex: 0 0 auto;
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
}
.update-actions {
  display: flex;
  gap: 5px;
  flex: 0 0 auto;
}
.update-btn {
  min-width: 52px;
  padding: 5px 13px;
  border-radius: 9px;
  border: 1px solid var(--camo-border);
  background: var(--camo-surface);
  color: var(--camo-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.update-btn:hover {
  border-color: color-mix(in srgb, var(--camo-primary) 48%, var(--camo-border));
}
.update-btn.primary {
  background: var(--camo-primary);
  border-color: var(--camo-primary);
  color: #fff;
}
.focus-timer {
  position: fixed;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--camo-surface-strong) 92%, transparent);
  border: 1px solid var(--camo-border);
  color: var(--camo-text);
  font-size: 13px;
  font-weight: 700;
  z-index: 8001;
  pointer-events: none;
}
.sticky-note {
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--camo-surface-strong) 85%, transparent);
  border: 1px solid var(--camo-border);
  color: var(--camo-muted);
  font-size: 11px;
  max-width: 300px;
  z-index: 8000;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.startup-toast {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  max-width: calc(100vw - 12px);
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--camo-surface-strong) 96%, transparent);
  border: 1px solid var(--camo-border);
  color: var(--camo-bubble-text);
  font-size: 13px;
  line-height: 1.2;
  font-weight: 600;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  z-index: 9999;
  pointer-events: none;
  animation: toast-fade 3s ease-out forwards;
  animation-delay: 0s;
}
@keyframes toast-fade {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -55%) scale(0.95); }
}
</style>
