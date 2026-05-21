<script setup lang="ts">
import { computed, ref } from "vue";
import { useSettingsStore, type StickyNoteConfig } from "../stores/settingsStore";
import { openStickyNoteWindow } from "../core/windowManager";
import { isTauri } from "../core/platform";
const tauriWindow = isTauri ? import("@tauri-apps/api/window") : null;

const emit = defineEmits<{ close: [] }>();
defineProps<{ standalone?: boolean; locked?: boolean }>();

const store = useSettingsStore();
const draft = ref("");
const notes = computed(() => store.settings.stickyNotes);

function saveNotes(next: StickyNoteConfig[]) {
  store.updateStickyNotes(next);
}

function addNote() {
  const text = draft.value.trim();
  if (!text) return;
  const note: StickyNoteConfig = { id: crypto.randomUUID(), text, enabled: true };
  saveNotes([note, ...notes.value]);
  draft.value = "";
  if (isTauri) void openStickyNoteWindow(note.id, 0);
}

function updateNote(id: string, patch: Partial<StickyNoteConfig>) {
  saveNotes(notes.value.map((note) => (note.id === id ? { ...note, ...patch } : note)));
  const index = notes.value.findIndex((note) => note.id === id);
  const next = notes.value.find((note) => note.id === id);
  if (isTauri && (patch.enabled ?? next?.enabled)) void openStickyNoteWindow(id, Math.max(index, 0));
  if (isTauri && patch.enabled === false) void closeStickyNoteWindow(id);
}

function removeNote(id: string) {
  saveNotes(notes.value.filter((note) => note.id !== id));
  if (isTauri) void closeStickyNoteWindow(id);
}

function showAll() {
  notes.value.forEach((note, index) => {
    if (note.enabled) void openStickyNoteWindow(note.id, index);
  });
}

async function closeStickyNoteWindow(id: string) {
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = await WebviewWindow.getByLabel(`sticky-note-${id}`);
    await win?.close().catch(() => {});
  } catch {}
}

function startDrag() {
  if (!tauriWindow) return;
  tauriWindow.then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
}

function checkedValue(event: Event) {
  return (event.target as HTMLInputElement).checked;
}

function textValue(event: Event) {
  return (event.target as HTMLTextAreaElement).value;
}

function openNote(note: StickyNoteConfig) {
  const enabledNotes = notes.value.filter((item) => item.enabled);
  const index = Math.max(enabledNotes.findIndex((item) => item.id === note.id), 0);
  void openStickyNoteWindow(note.id, index);
}
</script>

<template>
  <section data-camo-surface class="notes-panel" :class="{ standalone }">
    <header class="notes-title" @pointerdown="locked ? undefined : startDrag()">
      <strong>便签</strong>
      <button @click="emit('close')">×</button>
    </header>
    <div class="notes-compose">
      <textarea v-model="draft" rows="3" placeholder="写一个便签..." />
      <button class="primary" @click="addNote">新增</button>
    </div>
    <div class="notes-actions">
      <button @click="showAll">显示全部</button>
    </div>
    <div class="notes-list">
      <article v-for="note in notes" :key="note.id" class="note-row">
        <label>
          <input type="checkbox" :checked="note.enabled" @change="updateNote(note.id, { enabled: checkedValue($event) })" />
          <span>显示</span>
        </label>
        <textarea :value="note.text" rows="2" @change="updateNote(note.id, { text: textValue($event) })" />
        <div>
          <button @click="openNote(note)">打开</button>
          <button class="danger" @click="removeNote(note.id)">删除</button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.notes-panel {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  background: color-mix(in srgb, var(--camo-surface-strong) var(--camo-tool-opacity-pct), transparent);
  color: var(--camo-text);
  border: 1px solid var(--camo-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-size: 12px;
}
.notes-title {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--camo-border);
  user-select: none;
  font-size: 13px;
}
.notes-title button,
.notes-actions button,
.note-row button,
.notes-compose button {
  border: 1px solid var(--camo-border);
  background: var(--camo-surface);
  color: var(--camo-text);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.25;
}
.notes-title button { border: 0; background: transparent; font-size: 16px; padding: 2px 6px; }
.notes-compose { display: grid; grid-template-columns: 1fr 54px; gap: 8px; padding: 10px; }
.notes-compose textarea,
.note-row textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border: 1px solid var(--camo-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--camo-surface);
  color: var(--camo-text);
  font-size: 12px;
  line-height: 1.35;
}
.primary { background: var(--camo-primary) !important; border-color: var(--camo-primary) !important; color: #fff !important; }
.notes-actions { padding: 0 10px 8px; }
.notes-list { overflow: auto; padding: 0 10px 10px; display: grid; gap: 8px; }
.note-row { display: grid; gap: 6px; padding: 8px; border: 1px solid var(--camo-border); border-radius: 10px; background: color-mix(in srgb, var(--camo-surface) 82%, transparent); }
.note-row label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--camo-muted); }
.note-row div { display: flex; gap: 6px; justify-content: flex-end; }
.danger { color: #d92d20 !important; }
</style>
