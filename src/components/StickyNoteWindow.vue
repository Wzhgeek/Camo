<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "../stores/settingsStore";
import { isTauri } from "../core/platform";

const store = useSettingsStore();
const noteId = new URLSearchParams(window.location.search).get("noteId") ?? "";
const note = computed(() => store.settings.stickyNotes.find((item) => item.id === noteId));

function startDrag(event: PointerEvent) {
  if ((event.target as HTMLElement | null)?.closest("button")) return;
  if (!isTauri) return;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
    .catch(() => {});
}

function closeNote() {
  if (!isTauri) return;
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().close())
    .catch(() => {});
}
</script>

<template>
  <article v-if="note && note.enabled" data-camo-surface class="sticky-note-window" @pointerdown="startDrag">
    <p>{{ note.text }}</p>
    <button aria-label="关闭" @click.stop="closeNote">×</button>
  </article>
</template>

<style scoped>
.sticky-note-window {
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding: 10px 28px 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--camo-border);
  background: color-mix(in srgb, var(--camo-surface-strong) 92%, transparent);
  color: var(--camo-text);
  box-shadow: 0 8px 18px rgba(28, 20, 40, 0.10);
  overflow: hidden;
  cursor: move;
}
p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
button {
  position: absolute;
  top: 5px;
  right: 6px;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--camo-muted);
  cursor: pointer;
}
button:hover {
  background: rgba(127,90,240,0.1);
  color: var(--camo-text);
}
</style>
