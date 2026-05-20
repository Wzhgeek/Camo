<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useSettingsStore } from "../stores/settingsStore";
import { useReminderStore } from "../stores/reminderStore";
import { reminderService } from "../core/reminder/reminderService";
import type { ReminderType, ScheduleKind, Reminder } from "../core/reminder/types";
import { Droplets, Bell } from "lucide-vue-next";
import { isTauri } from "../core/platform";

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ petSide?: "left" | "right"; standalone?: boolean }>();
const tauriWindow = isTauri ? import("@tauri-apps/api/window") : null;
const store = useSettingsStore();
const { settings } = storeToRefs(store);
const reminderStoreRef = useReminderStore();
const { nextWaterAt, nextTriggerMap, reminders } = storeToRefs(reminderStoreRef);

const now = ref(Date.now());
let tickTimer: number | undefined;

const waterEnabled = ref(settings.value.waterReminder.enabled);
const waterInterval = ref(settings.value.waterReminder.intervalMinutes);
const waterStart = ref(settings.value.waterReminder.startTime || "09:00");
const waterEnd = ref(settings.value.waterReminder.endTime || "22:00");

const showForm = ref(false);
const formTitle = ref("");
const formType = ref<ReminderType>("normal");
const formKind = ref<ScheduleKind>("once");
const formDate = ref("");
const formTime = ref("");
const formInterval = ref(60);

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

onMounted(() => {
  tickTimer = window.setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnmounted(() => { if (tickTimer) clearInterval(tickTimer); });

const waterCountdown = computed(() => {
  if (!waterEnabled.value || !nextWaterAt.value) return "";
  const diff = nextWaterAt.value - now.value;
  if (diff <= 0) return "即将提醒";
  return formatCountdown(diff);
});

function formatCountdown(diff: number): string {
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function countdown(r: Reminder): string {
  if (r.scheduleKind === "interval") {
    const nextTs = nextTriggerMap.value[r.id];
    if (nextTs) {
      const diff = nextTs - now.value;
      if (diff <= 0) return "即将提醒";
      return formatCountdown(diff);
    }
    const intervalMin = r.schedulePayload.intervalMinutes as number | undefined;
    return intervalMin ? `每 ${intervalMin} 分钟` : "循环";
  }
  if (r.scheduleKind === "daily") {
    const time = r.schedulePayload.time as string | undefined;
    if (!time) return "每天";
    const [h, m] = time.split(":").map(Number);
    const candidate = new Date(); candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() <= now.value) candidate.setDate(candidate.getDate() + 1);
    return formatCountdown(candidate.getTime() - now.value);
  }
  const runAt = r.schedulePayload.runAt as string | undefined;
  if (!runAt) return "--";
  const diff = new Date(runAt).getTime() - now.value;
  if (diff <= 0) return "已到时";
  return formatCountdown(diff);
}

function scheduleLabel(r: { scheduleKind: string }): string {
  const map: Record<string, string> = {
    once: "一次", daily: "每天", interval: "循环",
  };
  return map[r.scheduleKind] || r.scheduleKind;
}

function saveWater() {
  store.updateWaterReminder({
    enabled: waterEnabled.value,
    intervalMinutes: waterInterval.value,
    startTime: waterStart.value,
    endTime: waterEnd.value,
  });
}

function createReminder() {
  let payload: Record<string, unknown> = {};
  if (formKind.value === "once") {
    const dt = formDate.value && formTime.value
      ? new Date(`${formDate.value}T${formTime.value}`).toISOString()
      : new Date(Date.now() + 60 * 60000).toISOString();
    payload = { runAt: dt };
  } else if (formKind.value === "daily") {
    payload = { time: formTime.value || "09:00" };
  } else if (formKind.value === "interval") {
    payload = { intervalMinutes: formInterval.value };
  }
  reminderService.create({
    title: formTitle.value || "提醒",
    type: formType.value,
    scheduleKind: formKind.value,
    schedulePayload: payload,
  });
  formTitle.value = ""; formDate.value = ""; formTime.value = "";
  showForm.value = false;
  reminderStoreRef.refreshReminders();
}

function deleteReminder(id: string) { reminderService.delete(id); reminderStoreRef.refreshReminders(); }
function toggleReminder(id: string, enabled: boolean) { reminderService.update(id, { enabled }); reminderStoreRef.refreshReminders(); }

function onDragStart(e: PointerEvent) {
  dragging.value = true;
  pointerDownPos.value = { x: e.clientX, y: e.clientY };
  dragStart.value = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onDragMove(e: PointerEvent) {
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
</script>

<template>
  <div
    data-camo-surface
    class="reminder-panel"
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
      <span class="title">提醒管理</span>
      <button class="close-btn" @pointerdown.stop @click="emit('close')">×</button>
    </div>

    <div class="panel-body">
      <section class="water-section">
        <div class="water-row">
          <Droplets :size="13" color="#7c3aed" />
          <span class="water-label">喝水提醒</span>
          <input type="checkbox" v-model="waterEnabled" @change="saveWater" />
          <input type="number" v-model.number="waterInterval" min="1" class="num-input" :disabled="!waterEnabled" @change="saveWater" />
          <span class="unit">分钟</span>
        </div>
        <div v-if="waterEnabled" class="water-row">
          <input type="time" v-model="waterStart" class="time-input" @change="saveWater" />
          <span class="unit">~</span>
          <input type="time" v-model="waterEnd" class="time-input" @change="saveWater" />
          <span v-if="waterCountdown" class="water-cd">{{ waterCountdown }}</span>
        </div>
      </section>

      <section class="list-section">
        <div class="section-header">
          <span><Bell :size="14" color="#7c3aed" /> 提醒列表</span>
          <button class="add-btn" @click="showForm = !showForm">{{ showForm ? '取消' : '＋ 新建' }}</button>
        </div>
<!-- TEMPLATE_CONTINUE -->
        <div v-if="showForm" class="create-form">
          <div class="row">
            <label>标题</label>
            <input v-model="formTitle" placeholder="提醒内容" />
          </div>
          <div class="row">
            <label>类型</label>
            <select v-model="formType">
              <option value="normal">普通</option>
              <option value="water">喝水</option>
              <option value="exercise">运动</option>
            </select>
          </div>
          <div class="row">
            <label>周期</label>
            <select v-model="formKind">
              <option value="once">一次性</option>
              <option value="daily">每天</option>
              <option value="interval">循环间隔</option>
            </select>
          </div>
          <div v-if="formKind === 'once'" class="row">
            <label>日期</label>
            <input type="date" v-model="formDate" />
          </div>
          <div v-if="formKind !== 'interval'" class="row">
            <label>时间</label>
            <input type="time" v-model="formTime" />
          </div>
          <div v-if="formKind === 'interval'" class="row">
            <label>间隔</label>
            <input type="number" v-model.number="formInterval" min="1" class="num-input" />
            <span class="unit">分钟</span>
          </div>

          <button class="confirm-btn" @click="createReminder">创建</button>
        </div>

        <div v-if="reminders.length === 0 && !showForm" class="empty">暂无提醒</div>
        <div v-for="r in reminders" :key="r.id" class="reminder-row">
          <input type="checkbox" :checked="r.enabled" @change="toggleReminder(r.id, !r.enabled)" />
          <div class="reminder-info">
            <span class="r-title">{{ r.title }}</span>
            <span class="r-meta">{{ scheduleLabel(r) }} · <b class="countdown">{{ countdown(r) }}</b></span>
          </div>
          <button class="del-btn" @click="deleteReminder(r.id)">×</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.reminder-panel {
  position: fixed;
  width: 280px;
  min-width: 220px;
  max-width: 420px;
  min-height: 200px;
  max-height: 500px;
  resize: none;
  overflow: hidden;
  background: rgba(255,255,255,0.97);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18);
  z-index: 9999;
  font-size: 11px;
  display: flex;
  flex-direction: column;
}
.reminder-panel.standalone-panel {
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
.reminder-panel.standalone-panel .drag-handle {
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
.title { font-weight: 600; font-size: 11px; }
.close-btn {
  background: none; border: none; font-size: 14px;
  cursor: pointer; color: #666; line-height: 1;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: none;
}
.panel-body::-webkit-scrollbar { display: none; }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: #4a3d5c;
  margin-bottom: 6px;
}
.water-section {
  padding: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(124,58,237,0.08);
  background: rgba(124,58,237,0.03);
  border-radius: 8px;
}
.water-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  background: rgba(124,58,237,0.05);
  margin-bottom: 5px;
}
.water-row:last-child { margin-bottom: 0; }
.water-label { font-size: 11px; font-weight: 600; color: #5b21b6; margin-right: 2px; }
.water-cd {
  margin-left: auto;
  font-size: 10px;
  color: #7c3aed;
  font-weight: 600;
  white-space: nowrap;
  background: rgba(124,58,237,0.1);
  padding: 2px 6px;
  border-radius: 4px;
}
/* STYLE_CONTINUE */
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.row label { min-width: 36px; font-size: 10px; color: #555; }
.row input, .row select {
  flex: 1; padding: 3px 5px; border: 1px solid #ddd;
  border-radius: 4px; font-size: 10px; outline: none;
}
.row input[type="checkbox"] { flex: none; width: 13px; height: 13px; }
.num-input { width: 48px !important; flex: none !important; }
.time-input { width: 72px !important; flex: none !important; }
.unit { font-size: 10px; color: #666; }
.add-btn {
  background: none; border: 1px solid #ddd; border-radius: 4px;
  font-size: 10px; cursor: pointer; padding: 2px 6px; color: #7c3aed;
}
.add-btn:hover { background: rgba(124,58,237,0.06); }
.create-form {
  padding: 6px;
  margin-bottom: 6px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
}
.confirm-btn {
  width: 100%; margin-top: 6px; padding: 4px;
  background: #7c3aed; color: #fff; border: none;
  border-radius: 4px; font-size: 10px; cursor: pointer;
}
.confirm-btn:hover { background: #6d28d9; }
.empty { color: #999; font-size: 10px; text-align: center; padding: 12px 0; }
.reminder-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0; border-bottom: 1px solid #f5f5f5;
}
.reminder-info { flex: 1; display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.r-title { font-size: 11px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-meta { font-size: 9px; color: #888; }
.countdown { color: #7c3aed; font-weight: 600; }
.del-btn {
  background: none; border: none; color: #d92d20;
  cursor: pointer; font-size: 12px; padding: 0 3px;
}
</style>
