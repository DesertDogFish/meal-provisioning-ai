import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath } from "node:url";

/**
 * Fix-10 (п.4): index.html ссылается на /provisions/design-pack/tokens.css —
 * единственный источник правды токенов темы (DESIGN_MIGRATION 0.1). Vite в
 * прод-сборке копирует в dist только public/, поэтому на деплое (Vercel)
 * tokens.css отдавал 404 и ВСЯ тема (цвета/отступы/радиусы/шрифты) падала
 * в дефолты — сайт выглядел «странно». В dev проблема не видна: vite отдаёт
 * файлы корня проекта как есть.
 *
 * Плагин копирует в dist (emitFile — без дублирования в репозитории,
 * design-pack остаётся единственным источником):
 *  - provisions/design-pack/tokens.css → dist/provisions/design-pack/tokens.css
 *  - provisions/design-pack/og/og-cover.png → dist/og-cover.png (OG-карточка, Fix-10 п.5)
 */
/** @type {import("vite").Plugin} */
function copyDesignPackAssets() {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
  return {
    name: "copy-design-pack-assets",
    /** @type {import("vite").Plugin["apply"]} */ apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "provisions/design-pack/tokens.css",
        source: read("./provisions/design-pack/tokens.css"),
      });
      this.emitFile({
        type: "asset",
        fileName: "og-cover.png",
        source: read("./provisions/design-pack/og/og-cover.png"),
      });
      // Fix-11: boot-лоадер index.html ссылается на парус design-pack напрямую
      this.emitFile({
        type: "asset",
        fileName: "provisions/design-pack/assets/preloader.svg",
        source: read("./provisions/design-pack/assets/preloader.svg"),
      });
    },
  };
}

/**
 * BL-28: PWA-манифест и service worker лежат в src/pwa/ (рядом с кодом приложения —
 * единственный источник правды). Vite копирует в dist только public/, поэтому:
 *  - build  → файлы отдаются плагином в корень dist (manifest.json, sw.js);
 *  - dev    → middleware, иначе /manifest.json даёт 404 и «Добавить на главный экран»
 *             локально не проверяется.
 * sw.js обязан жить в корне сайта: его scope = каталог файла (иначе он не управляет /).
 */
function pwaAssets() {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
  const files = () => ({
    "manifest.json": read("./src/pwa/manifest.json"),
    "sw.js": read("./src/pwa/sw.js"),
  });
  return {
    name: "pwa-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (pathname !== "/manifest.json" && pathname !== "/sw.js") return next();
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const name = pathname === "/sw.js" ? "sw.js" : "manifest.json";
        res.setHeader(
          "Content-Type",
          name === "sw.js" ? "text/javascript; charset=utf-8" : "application/manifest+json; charset=utf-8"
        );
        res.setHeader("Cache-Control", "no-cache");
        res.end(files()[name]);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(files())) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyDesignPackAssets(), pwaAssets(), visualizer({ filename: "dist/stats.html", open: false, gzipSize: true, brotliSize: true })],
  build: {
    rollupOptions: {
      output: {
        /**
         * BL-47 / bugs-app-ui п.3: react-datepicker и date-fns (его единственная
         * зависимость-потребитель — DatePicker) вынесены в отдельный кешируемый
         * chunk «datepicker», чтобы календарная библиотека не раздувала index-чанк
         * приложения и переиспользовалась между сборками.
         */
        manualChunks(id) {
          if (
            id.includes("node_modules/react-datepicker") ||
            id.includes("node_modules/date-fns")
          ) {
            return "datepicker";
          }
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    // Vite 6 по умолчанию отвечает «Blocked request. This host is not allowed» на
    // запросы с чужим Host (защита от DNS-rebinding). При работе за обратным прокси
    // (контейнер-песочница, домен превью заранее неизвестен) хост разрешается явно —
    // только при VITE_ALLOW_ANY_HOST=true, локально поведение прежнее.
    ...(process.env.VITE_ALLOW_ANY_HOST === "true" ? { allowedHosts: true } : {}),
  },
});
