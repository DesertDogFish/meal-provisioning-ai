import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
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
function copyDesignPackAssets() {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
  return {
    name: "copy-design-pack-assets",
    apply: "build",
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

export default defineConfig({
  plugins: [react(), tailwindcss(), copyDesignPackAssets()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
