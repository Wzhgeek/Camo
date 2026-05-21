<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore } from "../stores/settingsStore";
import { PROVIDER_PRESETS } from "../core/llm/types";
import type { LLMProviderName } from "../core/llm/types";
import { isTauri } from "../core/platform";
import { getAutostartEnabled, setAutostartEnabled } from "../core/autostart";
import { version } from "../../package.json";
import { playReminderSound } from "../core/audio";

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ petSide?: "left" | "right"; standalone?: boolean; locked?: boolean }>();
const tauriWindow = isTauri ? import("@tauri-apps/api/window") : null;
const store = useSettingsStore();
const { settings } = storeToRefs(store);

const tab = ref<"llm" | "prompt" | "personalization" | "system" | "about">("llm");
const provider = ref<LLMProviderName>(settings.value.llm.provider);
const baseUrl = ref(settings.value.llm.baseUrl);
const apiKey = ref(settings.value.llm.apiKey);
const model = ref(settings.value.llm.model);
const systemPrompt = ref(settings.value.systemPrompt);
const saved = ref(false);
const autostartBusy = ref(false);
const autostartError = ref("");

const pos = ref({ x: 0, y: 0 });
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const pointerDownPos = ref({ x: 0, y: 0 });
const DRAG_THRESHOLD = 5;

const panelStyle = computed(() => {
  if (props.standalone) return {};
  if (pos.value.x !== 0 || pos.value.y !== 0) {
    return { left: `calc(50% + ${pos.value.x}px)`, top: `calc(50% + ${pos.value.y}px)`, transform: 'translate(-50%, -50%)' };
  }
  if (props.petSide === "left") {
    return { left: '180px', top: '50%', transform: 'translateY(-50%)' };
  }
  return { right: '180px', top: '50%', transform: 'translateY(-50%)', left: 'auto' };
});

const FONT_SIZE_PRESET_MAP: Record<string, number> = { small: 12, medium: 14, large: 16 };

watch(() => settings.value.appearance.fontSizePreset, (preset) => {
  store.updateAppearance({ fontSizePx: FONT_SIZE_PRESET_MAP[preset] ?? 14 });
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

onMounted(async () => {
  try {
    const enabled = await getAutostartEnabled();
    store.updateSystemPreferences({ autostart: enabled });
  } catch {}
});

function onProviderChange() {
  const preset = PROVIDER_PRESETS[provider.value];
  if (preset) {
    baseUrl.value = preset.baseUrl;
    model.value = preset.defaultModel;
  }
}

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

async function onAutostartChange(e: Event) {
  const enabled = (e.target as HTMLInputElement).checked;
  autostartBusy.value = true;
  autostartError.value = "";
  try {
    await setAutostartEnabled(enabled);
    store.updateSystemPreferences({ autostart: enabled });
  } catch {
    autostartError.value = "开机自启动设置失败";
    store.updateSystemPreferences({ autostart: !enabled });
  } finally {
    autostartBusy.value = false;
  }
}

function onDragStart(e: PointerEvent) {
  if (props.locked) return;
  dragging.value = true;
  pointerDownPos.value = { x: e.clientX, y: e.clientY };
  dragStart.value = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onDragMove(e: PointerEvent) {
  if (props.locked) return;
  if (!dragging.value) return;
  if (isTauri) {
    const dx = e.clientX - pointerDownPos.value.x;
    const dy = e.clientY - pointerDownPos.value.y;
    if (Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
    dragging.value = false;
    tauriWindow!.then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
    return;
  }
  pos.value = { x: e.clientX - dragStart.value.x, y: e.clientY - dragStart.value.y };
}
function onDragEnd() { dragging.value = false; }
function playPreview(type: "water" | "exercise" | "normal") { playReminderSound(type, settings.value.appearance.soundVolume); }
</script>

<template>
  <div
    data-camo-surface
    class="settings-panel"
    :class="{ 'standalone-panel': standalone }"
    :style="panelStyle"
  >
    <div
      class="drag-handle"
      @pointerdown="onDragStart"
      @pointermove="onDragMove"
      @pointerup="onDragEnd"
      @pointercancel="onDragEnd"
    >
      <span class="title">设置</span>
      <button class="close-btn" @pointerdown.stop @click="cancel">×</button>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'llm' }" @click="tab = 'llm'">LLM</button>
      <button :class="{ active: tab === 'prompt' }" @click="tab = 'prompt'">提示词</button>
      <button :class="{ active: tab === 'personalization' }" @click="tab = 'personalization'">个性化</button>
      <button :class="{ active: tab === 'system' }" @click="tab = 'system'">系统</button>
      <button :class="{ active: tab === 'about' }" @click="tab = 'about'">关于</button>
    </div>

    <div class="tab-body">
      <div v-show="tab === 'llm'" class="tab-content">
        <div class="row">
          <label>供应商</label>
          <select v-model="provider" @change="onProviderChange">
            <option v-for="(preset, key) in PROVIDER_PRESETS" :key="key" :value="key">{{ preset.label }}</option>
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
          <input v-model="model" placeholder="模型名称" />
        </div>
      </div>

      <div v-show="tab === 'prompt'" class="tab-content">
        <p class="hint">开场系统提示词，定义 Camo 的人格和行为</p>
        <textarea v-model="systemPrompt" rows="6" class="prompt-area"></textarea>
      </div>

      <div v-show="tab === 'personalization'" class="tab-content">
        <div class="settings-group">
          <h3>主题</h3>
        <div class="theme-row">
          <button
            class="theme-btn"
            :class="{ selected: settings.theme === 'grey' }"
            @click="store.updateTheme('grey')"
          >
            <img src="/camo/grey/camo_idle.png" class="theme-preview" />
            <span>灰色</span>
          </button>
          <button
            class="theme-btn"
            :class="{ selected: settings.theme === 'perple' }"
            @click="store.updateTheme('perple')"
          >
            <img src="/camo/perple/camo_idle.png" class="theme-preview" />
            <span>紫色</span>
          </button>
        </div>
        </div>

        <div class="settings-group">
          <h3>文字</h3>
          <div class="row">
            <label>字体</label>
            <select v-model="settings.appearance.fontFamily">
              <option value="system">系统默认</option>
              <option value="serif">衬线</option>
              <option value="mono">等宽</option>
            </select>
          </div>
          <div class="row">
            <label>内容字号</label>
            <select v-model="settings.appearance.fontSizePreset">
              <option value="small">小</option>
              <option value="medium">中</option>
              <option value="large">大</option>
            </select>
            <input v-model.number="settings.appearance.fontSizePx" type="number" min="11" max="20" />
          </div>
          <div class="row">
            <label>面板字号</label>
            <select v-model.number="settings.appearance.uiFontSizePx">
              <option v-for="s in [9,10,11,12,13,14,15,16,17,18,20,22,24,26]" :key="s" :value="s">{{ s }}px</option>
            </select>
          </div>
        </div>

        <div class="settings-group">
          <h3>深色模式</h3>
          <div class="row">
            <label>模式</label>
            <select v-model="settings.appearance.darkMode">
              <option value="auto">自动</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div class="row">
            <label>时间</label>
            <input v-model="settings.appearance.darkStartTime" type="time" />
            <span class="unit">至</span>
            <input v-model="settings.appearance.darkEndTime" type="time" />
          </div>
        </div>

        <div class="settings-group">
          <h3>桌宠显示</h3>
          <div class="row">
            <label>尺寸</label>
            <input v-model.number="settings.layout.scale" type="range" min="0.5" max="2" step="0.05" />
            <span class="value">{{ Math.round(settings.layout.scale * 100) }}%</span>
          </div>
          <div class="row">
            <label>透明度</label>
            <input v-model.number="settings.windowPreferences.pet.opacity" type="range" min="0.35" max="1" step="0.05" />
            <span class="value">{{ Math.round(settings.windowPreferences.pet.opacity * 100) }}%</span>
          </div>
          <div class="row">
            <label>位置</label>
            <select v-model="settings.windowPreferences.pet.positionMode">
              <option value="free">自由拖动</option>
              <option value="left-bottom">左下角</option>
              <option value="right-bottom">右下角</option>
            </select>
          </div>
        </div>

        <div class="settings-group">
          <h3>状态与气泡</h3>
          <div class="row">
            <label>状态</label>
            <select v-model="settings.appearance.statusIndicatorStyle">
              <option value="dot">圆点</option>
              <option value="pill">胶囊</option>
              <option value="hidden">隐藏</option>
            </select>
            <select v-model="settings.appearance.statusColorPreset">
              <option value="default">默认</option>
              <option value="cool">冷色</option>
              <option value="warm">暖色</option>
            </select>
          </div>
          <div class="row">
            <label>气泡</label>
            <select v-model="settings.appearance.bubbleStyle">
              <option value="compact">紧凑</option>
              <option value="standard">标准</option>
              <option value="soft">柔和</option>
            </select>
          </div>
          <div class="row">
            <label>气泡透明</label>
            <input v-model.number="settings.appearance.bubbleOpacity" type="range" min="0.5" max="1" step="0.05" />
            <span class="value">{{ Math.round(settings.appearance.bubbleOpacity * 100) }}%</span>
          </div>
          <div class="row">
            <label>圆角</label>
            <input v-model.number="settings.appearance.bubbleRadius" type="range" min="8" max="28" step="1" />
            <span class="value">{{ settings.appearance.bubbleRadius }}px</span>
          </div>
        </div>

        <div class="settings-group">
          <h3>音效</h3>
          <div class="row">
            <label>提醒音效</label>
            <select v-model="settings.appearance.reminderSound">
              <option value="off">关闭</option>
              <option value="simple">简单音调</option>
            </select>
          </div>
          <div v-if="settings.appearance.reminderSound !== 'off'" class="preview-row">
            <button class="preview-btn" @click="playPreview('water')">💧 试听</button>
            <button class="preview-btn" @click="playPreview('exercise')">💪 试听</button>
            <button class="preview-btn" @click="playPreview('normal')">🔔 试听</button>
          </div>
          <div v-if="settings.appearance.reminderSound !== 'off'" class="row">
            <label>音量</label>
            <input v-model.number="settings.appearance.soundVolume" type="range" min="0" max="1" step="0.05" />
            <span class="value">{{ Math.round(settings.appearance.soundVolume * 100) }}%</span>
          </div>
        </div>
      </div>

      <div v-show="tab === 'system'" class="tab-content">
        <div class="settings-group">
          <h3>系统偏好</h3>
          <label class="check-row">
            <input type="checkbox" :checked="settings.systemPreferences.autostart" :disabled="autostartBusy" @change="onAutostartChange" />
            <span>开机自启动</span>
          </label>
          <p v-if="autostartError" class="error-tip">{{ autostartError }}</p>
        </div>

        <div class="settings-group">
          <h3>桌宠窗口</h3>
          <label class="check-row"><input v-model="settings.windowPreferences.pet.alwaysOnTop" type="checkbox" /> 始终置顶</label>
          <label class="check-row"><input v-model="settings.windowPreferences.pet.locked" type="checkbox" /> 窗口锁定</label>
          <label class="check-row"><input v-model="settings.windowPreferences.pet.rememberPosition" type="checkbox" /> 记住上次位置</label>
        </div>

        <div class="settings-group">
          <h3>功能面板</h3>
          <label class="check-row"><input v-model="settings.windowPreferences.tools.alwaysOnTop" type="checkbox" /> 始终置顶</label>
          <label class="check-row"><input v-model="settings.windowPreferences.tools.locked" type="checkbox" /> 窗口锁定</label>
          <label class="check-row"><input v-model="settings.windowPreferences.tools.rememberPosition" type="checkbox" /> 记住上次位置</label>
          <div class="row">
            <label>透明度</label>
            <input v-model.number="settings.windowPreferences.tools.opacity" type="range" min="0.45" max="1" step="0.05" />
            <span class="value">{{ Math.round(settings.windowPreferences.tools.opacity * 100) }}%</span>
          </div>
        </div>
      </div>

      <div v-show="tab === 'about'" class="tab-content about">
        <p><b>Camo</b> — 轻量桌宠助手</p>
        <p>Tauri 2 + Vue 3 + TypeScript</p>
        <p>开发者：<b>wangzihan</b></p>
        <p>GitHub：<a href="https://github.com/wzhgeek/camo" target="_blank">wzhgeek/camo</a></p>
        <p style="opacity:0.6;font-size:10px;margin-top:6px">v{{ version }}</p>
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
  resize: none;
  overflow: hidden;
  color: var(--camo-text);
  background: color-mix(in srgb, var(--camo-surface-strong) var(--camo-tool-opacity-pct), transparent);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  z-index: 9999;
  font-size: var(--camo-ui-font-size);
  display: flex;
  flex-direction: column;
}
.settings-panel.standalone-panel {
  position: relative;
  inset: auto;
  width: 100vw;
  height: 100vh;
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
  border: 1px solid rgba(71,53,93,0.14);
  border-radius: 16px;
  box-shadow: 0 20px 56px rgba(53,42,70,0.2);
}
.settings-panel.standalone-panel .drag-handle {
  border-radius: 16px 16px 0 0;
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
.title { font-weight: 600; }
.close-btn {
  background: none; border: none; font-size: 1.2em;
  cursor: pointer; color: #666; line-height: 1;
}
.tabs {
  display: flex; gap: 0; border-bottom: 1px solid #eee;
}
.tabs button {
  flex: 1; padding: 4px 0; border: none;
  background: none; font-size: 0.9em; cursor: pointer;
  color: #666; transition: all 0.15s;
}
.tabs button.active {
  color: var(--camo-primary); border-bottom: 2px solid var(--camo-primary);
}
.tab-body { flex: 1; padding: 8px; overflow-y: auto; }
.tab-content { display: flex; flex-direction: column; gap: 6px; }
.row { display: flex; align-items: center; gap: 6px; }
.row label { min-width: 52px; font-size: 0.9em; color: var(--camo-muted); }
.row select, .row input {
  flex: 1; padding: 3px 5px; border: 1px solid #ddd;
  border-radius: 4px; font-size: 0.9em; outline: none;
  min-width: 0;
}
.row input[type="checkbox"] { flex: none; width: 13px; height: 13px; }
.row input[type="color"] { flex: 0 0 44px; height: 24px; padding: 1px; }
.row input[type="range"] { min-width: 80px; }
.empty { color: #999; font-size: 0.9em; text-align: center; padding: 12px 0; }
.hint { margin: 0 0 4px; font-size: 0.9em; color: #888; }
.prompt-area {
  width: 100%; border: 1px solid #ddd; border-radius: 4px;
  font-size: 0.9em; padding: 5px; resize: vertical; outline: none;
  font-family: inherit;
}
.about { color: #555; }
.about p { margin: 3px 0; }
.theme-row {
  display: flex; gap: 12px; justify-content: center; padding: 8px 0;
}
.theme-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 6px 10px; border: 2px solid #ddd; border-radius: 8px;
  background: #fafafa; cursor: pointer; font-size: 0.9em; color: #555;
  transition: all 0.15s;
}
.theme-btn:hover { border-color: #7c3aed; }
.theme-btn.selected { border-color: #7c3aed; background: rgba(124,58,237,0.06); color: #7c3aed; }
.theme-preview { width: 48px; height: 48px; object-fit: contain; }
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--camo-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--camo-surface) 72%, transparent);
}
.settings-group h3 {
  margin: 0;
  font-size: 1em;
  color: var(--camo-text);
}
.preview-row {
  display: flex;
  gap: 6px;
}
.preview-btn {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--camo-border);
  border-radius: 6px;
  background: var(--camo-surface);
  color: var(--camo-text);
  font-size: 0.85em;
  cursor: pointer;
  text-align: center;
}
.preview-btn:hover {
  background: rgba(124,58,237,0.08);
}
.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  color: var(--camo-text);
}
.check-row input { width: 13px; height: 13px; }
.value,
.unit {
  flex: 0 0 auto;
  min-width: 32px;
  font-size: 0.9em;
  color: var(--camo-muted);
}
.error-tip {
  margin: 0;
  font-size: 0.9em;
  color: #dc2626;
}
.footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 6px; padding: 5px 8px; border-top: 1px solid #eee;
}
.saved-tip { font-size: 0.9em; color: #22c55e; margin-right: auto; }
.btn {
  padding: 3px 10px; border-radius: 4px; font-size: 0.9em;
  border: 1px solid #ddd; cursor: pointer;
}
.btn.save { background: #7c3aed; color: #fff; border-color: #7c3aed; }
.btn.cancel { background: #fff; color: #555; }
</style>
