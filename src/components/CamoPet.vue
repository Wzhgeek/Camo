<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CamoState } from "../core/camo/state";

defineProps<{
  state: CamoState;
  asset: string;
  panelOpen: boolean;
  scale: number;
}>();

const emit = defineEmits<{
  click: [];
  wheel: [e: WheelEvent];
}>();

async function startWindowDrag() {
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // ignore in browser preview
  }
}
</script>

<template>
  <section
    class="pet-shell"
    :class="{ 'panel-open': panelOpen }"
    :style="{ zoom: scale }"
    aria-label="Camo desktop pet"
    @pointerdown="startWindowDrag"
    @wheel.prevent="emit('wheel', $event)"
  >
    <div class="drag-zone" />
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
