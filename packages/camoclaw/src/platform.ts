const hasWindow = typeof window !== "undefined";
export const isTauri = !!(hasWindow && (window as any).__TAURI_INTERNALS__);
