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
