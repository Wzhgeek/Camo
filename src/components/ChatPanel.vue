<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useChatStore } from "../stores/chatStore";

const chat = useChatStore();
const { messages, isResponding } = storeToRefs(chat);
const draft = ref("");
const listRef = ref<HTMLElement | null>(null);

const canSend = computed(() => draft.value.trim().length > 0 && !isResponding.value);

async function submitMessage() {
  if (!canSend.value) return;
  const content = draft.value;
  draft.value = "";
  await chat.sendMessage(content);
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: "smooth" });
  },
);
</script>

<template>
  <aside class="chat-panel" aria-label="Camo chat panel">
    <header class="chat-header">
      <div>
        <p class="eyebrow">Camo</p>
        <h1>轻量助手</h1>
      </div>
      <span class="status" :class="{ active: isResponding }">
        {{ isResponding ? "思考中" : "待机" }}
      </span>
    </header>

    <div ref="listRef" class="message-list">
      <article
        v-for="message in messages"
        :key="message.id"
        class="message"
        :class="message.role"
      >
        <p>{{ message.content }}</p>
      </article>
    </div>

    <form class="composer" @submit.prevent="submitMessage">
      <input
        v-model="draft"
        :disabled="isResponding"
        autocomplete="off"
        placeholder="问 Camo 一件事"
      />
      <button type="submit" :disabled="!canSend" aria-label="Send message">发送</button>
    </form>
  </aside>
</template>
