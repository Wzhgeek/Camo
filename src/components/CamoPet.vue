<script setup lang="ts">
import { ref } from "vue";
import type { CamoState } from "../core/camo/state";
import { isTauri } from "../core/platform";

const tauriWindow = isTauri ? import("@tauri-apps/api/window") : null;

const props = defineProps<{
  state: CamoState;
  asset: string;
  panelOpen: boolean;
  scale: number;
  offset: { x: number; y: number };
  locked?: boolean;
  statusStyle?: "dot" | "pill" | "hidden";
}>();

const emit = defineEmits<{
  click: [];
  wheel: [e: WheelEvent];
  drag: [pos: { x: number; y: number }];
}>();

const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const pointerDownPos = ref({ x: 0, y: 0 });
const hasDragged = ref(false);
const DRAG_THRESHOLD = 5;

let clickCount = 0;
let clickTimer: ReturnType<typeof setTimeout> | undefined;
const DBLCLICK_DELAY = 300;

function onPointerDown(e: PointerEvent) {
  if (props.locked) return;
  hasDragged.value = false;
  pointerDownPos.value = { x: e.clientX, y: e.clientY };
  dragging.value = true;
  dragStart.value = { x: e.clientX - props.offset.x, y: e.clientY - props.offset.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (props.locked) return;
  const dx = e.clientX - pointerDownPos.value.x;
  const dy = e.clientY - pointerDownPos.value.y;
  if (Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
  hasDragged.value = true;
  if (!dragging.value) return;
  if (isTauri) {
    dragging.value = false;
    tauriWindow!.then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
    return;
  }
  emit("drag", { x: e.clientX - dragStart.value.x, y: e.clientY - dragStart.value.y });
}

function onPointerUp() {
  dragging.value = false;
}

function onPetClick() {
  if (hasDragged.value) return;
  clickCount++;
  if (clickCount === 2) {
    clearTimeout(clickTimer);
    clickCount = 0;
    emit("click");
  } else {
    clickTimer = setTimeout(() => { clickCount = 0; }, DBLCLICK_DELAY);
  }
}
</script>

<template>
  <section
    data-camo-surface
    class="pet-shell"
    :class="{ 'panel-open': panelOpen }"
    :style="{ zoom: scale, transform: `translate(${offset.x}px, ${offset.y}px)` }"
    aria-label="Camo desktop pet"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onPetClick"
    @wheel.prevent="emit('wheel', $event)"
  >
    <button class="pet-button" type="button" :aria-label="`Camo is ${state}`">
      <img class="pet-image" :src="asset" :alt="`Camo ${state}`" draggable="false" />
      <span
        v-if="statusStyle !== 'hidden'"
        class="state-dot"
        :class="`style-${statusStyle ?? 'dot'}`"
        :data-state="state"
      />
    </button>
  </section>
</template>
