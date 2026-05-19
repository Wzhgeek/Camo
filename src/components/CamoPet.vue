<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CamoState } from "../core/camo/state";

defineProps<{
  state: CamoState;
  asset: string;
  panelOpen: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();

async function startWindowDrag() {
  try {
    await getCurrentWindow().startDragging();
  } catch {
    // Browser preview has no Tauri window bridge; desktop builds use the API.
  }
}
</script>

<template>
  <section class="pet-shell" :class="{ 'panel-open': panelOpen }" aria-label="Camo desktop pet">
    <div class="drag-zone" data-tauri-drag-region @pointerdown="startWindowDrag" />
    <button class="pet-button" type="button" :aria-label="`Camo is ${state}`" @click="emit('click')">
      <img class="pet-image" :src="asset" :alt="`Camo ${state}`" draggable="false" />
      <span class="state-dot" :data-state="state" />
    </button>
  </section>
</template>
