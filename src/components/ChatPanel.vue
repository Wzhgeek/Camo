<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { marked } from "marked";
import { useChatStore } from "../stores/chatStore";
import { isTauri } from "../core/platform";

marked.setOptions({ breaks: true, gfm: true });

const emit = defineEmits<{ close: [] }>();
defineProps<{ standalone?: boolean }>();
const tauriWindow = isTauri ? import("@tauri-apps/api/window") : null;

const chat = useChatStore();
const { messages, isResponding, sessions, activeSessionId } = storeToRefs(chat);
const draft = ref("");
const listRef = ref<HTMLElement | null>(null);
const showSessionList = ref(false);

function newSession() {
  chat.createSession();
  showSessionList.value = false;
}
function switchTo(id: string) {
  chat.switchSession(id);
  showSessionList.value = false;
}
function deleteSess(id: string) {
  chat.deleteSession(id);
}
function clearConversation() {
  chat.clearMessages();
}
function closeDropdown() {
  if (showSessionList.value) showSessionList.value = false;
}

const canSend = computed(() => draft.value.trim().length > 0 && !isResponding.value);

function renderMd(text: string): string {
  if (!text) return "";
  return marked.parse(text, { async: false }) as string;
}

const dragging = ref(false);
const pointerDownPos = ref({ x: 0, y: 0 });
const DRAG_THRESHOLD = 5;

function onHeaderPointerDown(e: PointerEvent) {
  dragging.value = true;
  pointerDownPos.value = { x: e.clientX, y: e.clientY };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onHeaderPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const dx = e.clientX - pointerDownPos.value.x;
  const dy = e.clientY - pointerDownPos.value.y;
  if (Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;

  dragging.value = false;
  if (isTauri) {
    tauriWindow!.then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {});
  }
}

function onHeaderPointerUp() {
  dragging.value = false;
}

async function submitMessage() {
  if (!canSend.value) return;
  const content = draft.value;
  draft.value = "";
  await chat.sendMessage(content);
}

function scrollToBottom() {
  nextTick(() => {
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: "smooth" });
  });
}

watch(() => messages.value.length, scrollToBottom);
watch(() => messages.value[messages.value.length - 1]?.content, scrollToBottom);
</script>

<template>
  <aside data-camo-surface class="chat-panel" :class="{ 'standalone-panel': standalone }" @click="closeDropdown">
    <header
      class="chat-header"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="onHeaderPointerUp"
      @pointercancel="onHeaderPointerUp"
    >
      <p class="eyebrow">Camo</p>
      <div class="header-right">
        <span class="status" :class="{ active: isResponding }">
          {{ isResponding ? "思考中" : "待机" }}
        </span>
        <button class="close-btn" @pointerdown.stop @click="emit('close')" aria-label="关闭">×</button>
      </div>
    </header>

    <div class="session-bar">
      <div class="session-selector" @click.stop="showSessionList = !showSessionList">
        <span class="session-title">{{ sessions.find(s => s.id === activeSessionId)?.title || '新对话' }}</span>
        <span class="arrow">▾</span>
      </div>
      <button class="sess-btn" @click="newSession" title="新建会话">＋</button>
      <button class="sess-btn" @click="clearConversation" title="清除对话">🗑</button>
      <div v-if="showSessionList" class="session-dropdown">
        <div
          v-for="s in sessions" :key="s.id"
          class="session-item" :class="{ active: s.id === activeSessionId }"
          @click="switchTo(s.id)"
        >
          <span class="item-title">{{ s.title }}</span>
          <button v-if="sessions.length > 1" class="del-btn" @click.stop="deleteSess(s.id)" title="删除">×</button>
        </div>
      </div>
    </div>

    <div ref="listRef" class="message-list">
      <article
        v-for="message in messages"
        :key="message.id"
        class="message"
        :class="message.role"
      >
        <div v-if="message.isThinking" class="thinking-block thinking-active">
          <div class="thinking-header">
            <span class="spinner"></span>
            <span>思考中</span>
          </div>
          <div class="thinking-text" v-html="renderMd(message.thinking || '')"></div>
        </div>
        <details v-else-if="message.thinking" class="thinking-block">
          <summary>思考过程</summary>
          <div class="thinking-text" v-html="renderMd(message.thinking)"></div>
        </details>
        <div class="msg-content" v-html="renderMd(message.content)"></div>
      </article>
    </div>

    <form class="composer" @submit.prevent="submitMessage">
      <input
        v-model="draft"
        :disabled="isResponding"
        autocomplete="off"
        placeholder="问 Camo 一件事"
      />
      <button v-if="isResponding" type="button" class="stop-btn" @click="chat.stopResponse()" aria-label="停止">
        <span class="stop-icon"></span>
      </button>
      <button v-else type="submit" :disabled="!canSend" aria-label="Send message">发送</button>
    </form>
  </aside>
</template>
