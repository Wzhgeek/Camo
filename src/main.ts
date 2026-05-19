import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/theme.css";
import { initDatabase } from "./core/storage/database";

const isTauri = !!(window as any).__TAURI_INTERNALS__;

if (isTauri) {
  document.documentElement.setAttribute("data-tauri", "");
}

initDatabase()
  .then(() => {
    createApp(App).use(createPinia()).mount("#app");
  })
  .catch((err) => {
    console.warn("Database init failed, falling back:", err);
    createApp(App).use(createPinia()).mount("#app");
  });
