<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { getCurrentWindow } from "@tauri-apps/api/window";
import CamoPet from "./components/CamoPet.vue";
import ChatPanel from "./components/ChatPanel.vue";
import { useCamoStore } from "./stores/camoStore";

const camo = useCamoStore();
const { state, asset } = storeToRefs(camo);
const panelOpen = ref(false);
const scale = ref(1);
const contextMenu = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });

function handlePetClick() {
  panelOpen.value = !panelOpen.value;
  camo.transition({ type: "PET_CLICKED" });
  camo.returnToIdle(850);
}

function handleContextMenu(e: MouseEvent) {
  contextMenu.value = { show: true, x: e.clientX, y: e.clientY };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

async function exitApp() {
  try {
    await getCurrentWindow().close();
  } catch {
    // ignore in browser preview
  }
}

function handleWheel(e: WheelEvent) {
  if (e.deltaY < 0) {
    scale.value = Math.min(2, +(scale.value + 0.05).toFixed(2));
  } else {
    scale.value = Math.max(0.5, +(scale.value - 0.05).toFixed(2));
  }
}
</script>

<template>
  <main
    class="camo-workspace"
    :class="{ expanded: panelOpen }"
    @contextmenu.prevent="handleContextMenu"
    @click="closeContextMenu"
  >
    <Transition name="panel">
      <ChatPanel v-if="panelOpen" />
    </Transition>
    <CamoPet
      :state="state"
      :asset="asset"
      :panel-open="panelOpen"
      :scale="scale"
      @click="handlePetClick"
      @wheel="handleWheel"
    />

    <div
      v-if="contextMenu.show"
      class="context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <button class="context-item danger" @click="exitApp">退出 Camo</button>
    </div>
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
  background: transparent;
}

.chat-panel {
  align-self: flex-end;
}

.pet-shell {
  position: relative;
  flex: 0 0 auto;
  width: 156px;
  height: 188px;
  display: grid;
  place-items: end center;
  user-select: none;
}

.drag-zone {
  position: absolute;
  top: 0;
  left: 50%;
  width: 68px;
  height: 22px;
  border-radius: 999px;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(92, 67, 135, 0.16);
  box-shadow: 0 8px 22px rgba(69, 50, 94, 0.14);
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
  filter: drop-shadow(0 18px 26px rgba(50, 38, 71, 0.2));
  animation: camo-float 3.5s ease-in-out infinite;
  transition:
    transform 180ms ease,
    filter 180ms ease;
}

.pet-button:hover {
  transform: translateY(-2px) scale(1.02);
  filter: drop-shadow(0 20px 30px rgba(50, 38, 71, 0.25));
}

.pet-button:active {
  transform: translateY(1px) scale(0.98);
}

.pet-button:focus-visible {
  outline: 3px solid rgba(127, 90, 240, 0.34);
  outline-offset: 5px;
  border-radius: 28px;
}

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
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 5px rgba(141, 99, 232, 0.12);
}

.state-dot[data-state="thinking"],
.state-dot[data-state="answering"] {
  background: #3b82f6;
  box-shadow: 0 0 0 5px rgba(59, 130, 246, 0.14);
}

.state-dot[data-state="water"] {
  background: #06b6d4;
  box-shadow: 0 0 0 5px rgba(6, 182, 212, 0.14);
}

.state-dot[data-state="exercise"],
.state-dot[data-state="done"] {
  background: #22c55e;
  box-shadow: 0 0 0 5px rgba(34, 197, 94, 0.14);
}

.chat-panel {
  width: min(360px, calc(100vw - 190px));
  height: min(510px, calc(100vh - 28px));
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
  border: 1px solid rgba(71, 53, 93, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 24px 64px rgba(53, 42, 70, 0.2);
  backdrop-filter: blur(24px);
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid rgba(79, 58, 105, 0.08);
}

.eyebrow {
  margin: 0 0 2px;
  color: #71579d;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.chat-header h1 {
  margin: 0;
  color: #231d2d;
  font-size: 18px;
  line-height: 1.2;
}

.status {
  flex: 0 0 auto;
  min-width: 56px;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(95, 79, 118, 0.08);
  color: #6b6078;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

.status.active {
  color: #315ea8;
  background: rgba(59, 130, 246, 0.12);
}

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

.message p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.assistant {
  align-self: flex-start;
  color: #31293d;
  background: rgba(244, 240, 249, 0.95);
  border-bottom-left-radius: 5px;
}

.message.user {
  align-self: flex-end;
  color: #ffffff;
  background: #7f5af0;
  border-bottom-right-radius: 5px;
}

.composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(79, 58, 105, 0.08);
}

.composer input {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(79, 58, 105, 0.12);
  border-radius: 12px;
  color: #231d2d;
  background: rgba(255, 255, 255, 0.92);
  outline: none;
}

.composer input:focus {
  border-color: rgba(127, 90, 240, 0.62);
  box-shadow: 0 0 0 3px rgba(127, 90, 240, 0.12);
}

.composer button {
  height: 40px;
  min-width: 58px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  background: #2f293a;
  font-weight: 700;
}

.composer button:disabled {
  opacity: 0.45;
}

.panel-enter-active,
.panel-leave-active {
  transition:
    opacity 160ms ease,
    transform 180ms ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(12px) scale(0.98);
}

@keyframes camo-float {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -8px;
  }
}

@media (max-width: 520px) {
  .camo-workspace {
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
  }

  .chat-panel {
    width: calc(100vw - 28px);
    height: min(420px, calc(100vh - 214px));
  }
}

/* ---- Context Menu ---- */
.context-menu {
  position: fixed;
  min-width: 120px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(71, 53, 93, 0.12);
  box-shadow: 0 12px 36px rgba(53, 42, 70, 0.22);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 9999;
  user-select: none;
}

.context-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #272230;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}

.context-item:hover {
  background: rgba(127, 90, 240, 0.1);
  color: #5f3dc0;
}

.context-item.danger {
  color: #d92d20;
}

.context-item.danger:hover {
  background: rgba(217, 45, 32, 0.08);
  color: #b42318;
}
</style>
