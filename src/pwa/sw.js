/* ============================================================
   Провиант · service worker (BL-28)
   Минимальный офлайн-слой поверх уже работающего localStorage:
   приложение открывается на телефоне без сети, данные походов
   остаются в localStorage (BL-27), сеть — только для API.

   Стратегии:
   - навигация (HTML)  — network-first, при офлайне — оболочка из кэша;
   - статика сборки    — stale-while-revalidate (мгновенный ответ + фоновое
                         обновление), имена файлов у Vite хэшированные;
   - запросы к API/авторизации НЕ кэшируются никогда.

   Версия кэша поднимается при изменении логики — старые чистятся в activate.
   ============================================================ */

const CACHE = "providant-shell-v1";
const API_CACHE = "providant-api-v1";
const OFFLINE_URL = "/";

/** Оболочка: без неё офлайн-запуск не имеет смысла. */
const APP_SHELL = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

/** Запросы, которые кэш обходят стороной: данные и авторизация всегда из сети. */
function isBypassed(url, request) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/auth/")) return true;
  if (url.pathname === "/sw.js") return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll падает целиком из-за одного 404 — кладём по одному.
      await Promise.all(
        APP_SHELL.map((asset) =>
          cache.add(new Request(asset, { cache: "reload" })).catch(() => undefined)
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE && key !== API_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isBypassed(url, request)) return;

  // Навигация: сеть в приоритете (свежий index.html → актуальные чанки),
  // офлайн — отдаём оболочку, SPA-роутер сам разберёт путь.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(OFFLINE_URL, response.clone()).catch(() => undefined);
          return response;
        } catch (error) {
          const cached = (await caches.match(request)) || (await caches.match(OFFLINE_URL));
          if (cached) return cached;
          throw error;
        }
      })()
    );
    return;
  }

  // API GET: network-first, при офлайне — кэш.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        } catch (error) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw error;
        }
      })()
    );
    return;
  }

  // Статика: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            cache.put(request, response.clone()).catch(() => undefined);
          }
          return response;
        })
        .catch(() => undefined);

      return cached || (await network) || Response.error();
    })()
  );
});
