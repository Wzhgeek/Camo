<script setup lang="ts">
import { ref } from "vue";
import type { CamoState } from "../core/camo/state";

const props = defineProps<{
  state: CamoState;
  asset: string;
  panelOpen: boolean;
  scale: number;
  offset: { x: number; y: number };
}>();

const emit = defineEmits<{
  click: [];
  wheel: [e: WheelEvent];
  drag: [pos: { x: number; y: number }];
}>();

const isTauri = !!((window as any).__TAURI_INTERNALS__);
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

function onPointerDown(e: PointerEvent) {
  if (isTauri) {
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => {});
    return;
  }
  dragging.value = true;
  dragStart.value = { x: e.clientX - props.offset.x, y: e.clientY - props.offset.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  emit("drag", { x: e.clientX - dragStart.value.x, y: e.clientY - dragStart.value.y });
}

function onPointerUp() {
  dragging.value = false;
}
</script>

<template>
  <section
    class="pet-shell"
    :class="{ 'panel-open': panelOpen }"
    :style="{ zoom: scale, transform: `translate(${offset.x}px, ${offset.y}px)` }"
    aria-label="Camo desktop pet"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @wheel.prevent="emit('wheel', $event)"
  >
    <button
      class="pet-button"
      type="button"
      :aria-label="`Camo is ${state}`"
      @dblclick="emit('click')"
    >
      <img class="pet-image" :src="asset" :alt="`Camo ${state}`" draggable="false" />
      <span class="state-dot" :data-state="state" />
    </button>
  </section>
</template>
