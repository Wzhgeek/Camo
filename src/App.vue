<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import CamoPet from "./components/CamoPet.vue";
import ChatPanel from "./components/ChatPanel.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import ReminderPanel from "./components/ReminderPanel.vue";
import ReminderBubble from "./components/ReminderBubble.vue";
import { useCamoStore } from "./stores/camoStore";
import { useChatStore } from "./stores/chatStore";
import { useReminderStore } from "./stores/reminderStore";
import { useSettingsStore } from "./stores/settingsStore";
import { ReminderScheduler } from "./core/reminder/scheduler";
import { isTauri } from "./core/platform";
import {
  applyCurrentWindowPreferences,
  closeCurrentWindow,
  currentWindowKind,
  installWindowFramePersistence,
  openToolWindow,
  resetCurrentWindowPosition,
  syncPetWindowSize,
  toggleToolWindow,
} from "./core/windowManager";
import { applyAppearance, darkModeLabel, nextDarkModePreference } from "./core/appearance";
import { playReminderSound } from "./core/audio";
import type { UnlistenFn } from "@tauri-apps/api/event";

const camo = useCamoStore();
const chatStore = useChatStore();
const reminderStore = useReminderStore();
const settingsStore = useSettingsStore();
const { state, asset } = storeToRefs(camo);
const { llmPhase } = storeToRefs(chatStore);
const scale = ref(settingsStore.settings.layout.scale);
const petOffset = ref({ x: 0, y: 0 });
const contextMenu = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
const isPetWindow = computed(() => currentWindowKind === "pet");
const currentBehavior = computed(() => isPetWindow.value
  ? settingsStore.settings.windowPreferences.pet
  : settingsStore.settings.windowPreferences.tools);
const statusStyle = computed(() => settingsStore.settings.appearance.statusIndicatorStyle);

const petSide = computed<"left" | "right">(() => {
  const midX = window.innerWidth / 2;
  return petOffset.value.x < -midX + 200 ? "left" : "right";
});

const scheduler = new ReminderScheduler(
  (reminder) => {
    const typeMap = { water: "water", exercise: "exercise", normal: "normal" } as const;
    const t = typeMap[reminder.type];
    if (settingsStore.settings.appearance.reminderSound) playReminderSound(t);
    camo.transition({ type: "REMINDER_TRIGGERED", reminderType: t });
    reminderStore.trigger(reminder);
  },
  () => settingsStore.settings.waterReminder,
  (ts) => reminderStore.setNextWaterAt(ts),
  (id, ts) => reminderStore.setNextTrigger(id, ts),
);

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
let frameUnlisteners: UnlistenFn[] = [];

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

  if (isPetWindow.value) {
    scheduler.start();
    syncPetWindowSize(scale.value);
    window.addEventListener("mousemove", resetInactivityTimer, { passive: true });
    window.addEventListener("keydown", resetInactivityTimer, { passive: true });
    window.addEventListener("click", resetInactivityTimer, { passive: true });
    resetInactivityTimer();
  }
});

onUnmounted(() => {
  frameUnlisteners.forEach((unlisten) => unlisten());
  frameUnlisteners = [];
  if (isPetWindow.value) scheduler.stop();
  clearInactivityTimer();
  window.removeEventListener("mousemove", resetInactivityTimer);
  window.removeEventListener("keydown", resetInactivityTimer);
  window.removeEventListener("click", resetInactivityTimer);
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

function handlePetClick() {
  toggleToolWindow("chat");
  camo.transition({ type: "PET_CLICKED" });
  camo.returnToIdle(400);
}

function toggleDarkMode() {
  contextMenu.value.show = false;
  settingsStore.updateAppearance({
    darkMode: nextDarkModePreference(settingsStore.settings.appearance.darkMode),
  });
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
  const menuW = 100;
  const menuH = 124;
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
  const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
  contextMenu.value = { show: true, x, y };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

function toggleLock() {
  contextMenu.value.show = false;
  const current = settingsStore.settings.windowPreferences.pet.locked;
  settingsStore.updateWindowPreferences({ pet: { ...settingsStore.settings.windowPreferences.pet, locked: !current } });
}

function openSettings() {
  contextMenu.value.show = false;
  openToolWindow("settings");
}

function openReminders() {
  contextMenu.value.show = false;
  openToolWindow("reminders");
}

async function exitApp() {
  contextMenu.value.show = false;
  try {
    const { getAllWindows } = await import("@tauri-apps/api/window");
    const windows = await getAllWindows();
    await Promise.all(windows.map((win) => win.close().catch(() => {})));
  } catch {
    window.close();
  }
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
      @click="handlePetClick"
      @wheel="handleWheel"
      @drag="handlePetDrag"
    />

    <div
      v-if="contextMenu.show"
      data-camo-surface
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <button class="context-item" @click="openSettings">设置</button>
      <button class="context-item" @click="openReminders">提醒</button>
      <button class="context-item" @click="toggleLock">{{ settingsStore.settings.windowPreferences.pet.locked ? '✓ 已锁定' : '锁定位置' }}</button>
      <button class="context-item" @click="toggleDarkMode">{{ darkModeLabel(settingsStore.settings.appearance.darkMode) }}</button>
      <button class="context-item danger" @click="exitApp">退出 Camo</button>
    </div>

    <SettingsPanel
      v-if="currentWindowKind === 'settings'"
      standalone
      :locked="currentBehavior.locked"
      :pet-side="petSide"
      @close="closeSettingsPanel"
    />
    <ReminderPanel
      v-if="currentWindowKind === 'reminders'"
      standalone
      :locked="currentBehavior.locked"
      :pet-side="petSide"
      @close="closeReminderPanel"
    />
    <ReminderBubble v-if="currentWindowKind === 'pet'" />
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
.camo-workspace.window-reminders {
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
  padding: 3px;
  border-radius: 6px;
  background: var(--camo-surface-strong);
  border: 1px solid var(--camo-border);
  box-shadow: 0 4px 12px rgba(53,42,70,0.14);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  z-index: 9999;
  user-select: none;
}
.context-item {
  display: block;
  width: 100%;
  padding: 3px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--camo-menu-text);
  font-size: 11px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  line-height: 1.6;
}
.context-item:hover { background: rgba(127,90,240,0.1); color: var(--camo-menu-text); }
.context-item.danger { color: #d92d20; }
.context-item.danger:hover { background: rgba(217,45,32,0.08); color: #b42318; }
</style>
