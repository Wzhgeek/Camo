import { defineStore } from "pinia";
import { ref } from "vue";
import { useCamoStore } from "./camoStore";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const useChatStore = defineStore("chat", () => {
  const messages = ref<ChatMessage[]>([
    createMessage("assistant", "你好，我是 Camo。可以问我问题，也可以让我先记一件事。"),
  ]);
  const isResponding = ref(false);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isResponding.value) return;

    const camo = useCamoStore();
    messages.value.push(createMessage("user", trimmed));
    isResponding.value = true;
    camo.transition({ type: "USER_SENT_MESSAGE" });

    await wait(450);
    camo.transition({ type: "LLM_STREAM_START" });
    await wait(650);

    messages.value.push(
      createMessage("assistant", `我先用 mock 回复记录一下：${trimmed}`),
    );
    isResponding.value = false;
    camo.returnToIdle(700);
  }

  return {
    messages,
    isResponding,
    sendMessage,
  };
});
