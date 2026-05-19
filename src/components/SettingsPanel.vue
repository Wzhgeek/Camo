<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore } from "../stores/settingsStore";

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ petSide?: "left" | "right" }>();
const store = useSettingsStore();
const { settings } = storeToRefs(store);

const tab = ref<"llm" | "prompt" | "about">("llm");
const provider = ref(settings.value.llm.provider);
const baseUrl = ref(settings.value.llm.baseUrl);
const apiKey = ref(settings.value.llm.apiKey);
const model = ref(settings.value.llm.model);
const systemPrompt = ref(settings.value.systemPrompt);
const saved = ref(false);

const pos = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });

const panelStyle = computed(() => {
  if (pos.value.x !== 0 || pos.value.y !== 0) {
    return { left: `calc(50% + ${pos.value.x}px)`, top: `calc(50% + ${pos.value.y}px)`, transform: 'translate(-50%, -50%)' };
  }
  if (props.petSide === "left") {
    return { left: '180px', top: '50%', transform: 'translateY(-50%)' };
  }
  return { right: '180px', top: '50%', transform: 'translateY(-50%)', left: 'auto' };
});

watch(() => settings.value.llm, (llm) => {
  provider.value = llm.provider;
  baseUrl.value = llm.baseUrl;
  apiKey.value = llm.apiKey;
  model.value = llm.model;
}, { immediate: true });

watch(() => settings.value.systemPrompt, (p) => {
  systemPrompt.value = p;
}, { immediate: true });

function save() {
  store.updateLLM({
    provider: provider.value,
    baseUrl: baseUrl.value,
    apiKey: apiKey.value,
    model: model.value,
  });
  store.updateSystemPrompt(systemPrompt.value);
  saved.value = true;
  setTimeout(() => { saved.value = false; }, 1200);
}

function cancel() { emit("close"); }

function onDragStart(e: PointerEvent) {
  dragging.value = true;
  dragStart.value = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onDragMove(e: PointerEvent) {
  if (!dragging.value) return;
  pos.value = { x: e.clientX - dragStart.value.x, y: e.clientY - dragStart.value.y };
}
function onDragEnd() { dragging.value = false; }
</script>

<template>
  <div
    class="settings-panel"
    :style="panelStyle"
  >
    <div
      class="drag-handle"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
    >
      <span class="title">设置</span>
      <button class="close-btn" @pointerdown.stop @click="cancel">×</button>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'llm' }" @click="tab = 'llm'">LLM</button>
      <button :class="{ active: tab === 'prompt' }" @click="tab = 'prompt'">提示词</button>
      <button :class="{ active: tab === 'about' }" @click="tab = 'about'">关于</button>
    </div>

    <div class="tab-body">
      <div v-show="tab === 'llm'" class="tab-content">
        <div class="row">
          <label>Provider</label>
          <select v-model="provider">
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
        <div class="row">
          <label>Base URL</label>
          <input v-model="baseUrl" placeholder="http://..." />
        </div>
        <div class="row">
          <label>API Key</label>
          <input v-model="apiKey" type="password" placeholder="sk-..." />
        </div>
        <div class="row">
          <label>Model</label>
          <input v-model="model" placeholder="qwen3.5:2b" />
        </div>
      </div>

      <div v-show="tab === 'prompt'" class="tab-content">
        <p class="hint">开场系统提示词，定义 Camo 的人格和行为</p>
        <textarea v-model="systemPrompt" rows="6" class="prompt-area"></textarea>
      </div>

      <div v-show="tab === 'about'" class="tab-content about">
        <p><b>Camo</b> — 轻量桌宠助手</p>
        <p>Tauri 2 + Vue 3 + TypeScript</p>
        <p style="opacity:0.6;font-size:10px">v0.1.0</p>
      </div>
    </div>

    <div class="footer">
      <span v-if="saved" class="saved-tip">已保存</span>
      <button class="btn cancel" @click="cancel">取消</button>
      <button class="btn save" @click="save">保存</button>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  position: fixed;
  width: 300px;
  min-width: 240px;
  max-width: 500px;
  min-height: 240px;
  max-height: 450px;
  resize: both;
  overflow: hidden;
  background: rgba(255,255,255,0.97);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  z-index: 9999;
  font-size: 11px;
  display: flex;
  flex-direction: column;
}
.drag-handle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  cursor: grab;
  user-select: none;
  background: rgba(120,80,200,0.08);
  border-radius: 10px 10px 0 0;
}
.drag-handle:active { cursor: grabbing; }
.title { font-weight: 600; font-size: 11px; }
.close-btn {
  background: none; border: none; font-size: 14px;
  cursor: pointer; color: #666; line-height: 1;
}
.tabs {
  display: flex; gap: 0; border-bottom: 1px solid #eee;
}
.tabs button {
  flex: 1; padding: 4px 0; border: none;
  background: none; font-size: 10px; cursor: pointer;
  color: #666; transition: all 0.15s;
}
.tabs button.active {
  color: #7c3aed; border-bottom: 2px solid #7c3aed;
}
.tab-body { flex: 1; padding: 8px; overflow-y: auto; }
.tab-content { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 6px; }
.row label { min-width: 52px; font-size: 10px; color: #555; }
.row select, .row input {
  flex: 1; padding: 3px 5px; border: 1px solid #ddd;
  border-radius: 4px; font-size: 10px; outline: none;
}
.row input[type="checkbox"] { flex: none; width: 13px; height: 13px; }
.empty { color: #999; font-size: 10px; text-align: center; padding: 12px 0; }
.hint { margin: 0 0 4px; font-size: 10px; color: #888; }
.prompt-area {
  width: 100%; border: 1px solid #ddd; border-radius: 4px;
  font-size: 10px; padding: 5px; resize: vertical; outline: none;
  font-family: inherit;
}
.about { color: #555; }
.about p { margin: 3px 0; font-size: 11px; }
.footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 6px; padding: 5px 8px; border-top: 1px solid #eee;
}
.saved-tip { font-size: 10px; color: #22c55e; margin-right: auto; }
.btn {
  padding: 3px 10px; border-radius: 4px; font-size: 10px;
  border: 1px solid #ddd; cursor: pointer;
}
.btn.save { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.btn.cancel { background: #fff; color: #555; }
</style>
