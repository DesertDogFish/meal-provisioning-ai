import React from "react";
import ReactDOM from "react-dom/client";
// design-pack: tokens.css подключается ПЕРВЫМ (единственный источник правды токенов),
// затем приложение переопределяет/дополняет их алиасами совместимости.
import "../provisions/design-pack/tokens.css";
import "./index.css";
import { initTheme } from "./theme";
import App from "./App.tsx";

// data-theme на <html> до первой отрисовки — без вспышки неверной темы (п.1 DESIGN_MIGRATION).
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

import { syncManager } from "./sync/SyncManager";

// BL-28: PWA. Регистрируем service worker только в прод-сборке — в dev он кэшировал
// бы HMR-модули и «залипал» на старых чанках. Файл отдаёт плагин pwa-assets
// (src/pwa/sw.js → /sw.js при build). Ошибки регистрации не ломают приложение:
// PWA — улучшение, а не обязательный слой.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* офлайн-режим недоступен — приложение работает как обычный сайт */
    });
  });
}

// Слушаем сообщения от Service Worker (background sync)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_QUEUE') {
      syncManager.syncAll();
    }
  });
}

// Refresh rotation при появлении сети
if (import.meta.env.VITE_OFFLINE_ENABLED === 'true') {
  window.addEventListener('online', async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      const { api } = await import('./api/client');
      const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080/api/v1';
      try {
        await api.get('/auth/me'); // триггерит refresh если 401
      } catch {
        // игнорируем — офлайн или сессия потеряна
      }
    }
  });
  syncManager.startAutoSync();
}
