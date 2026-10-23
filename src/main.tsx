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
