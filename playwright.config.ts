import { defineConfig, devices } from '@playwright/test';

/**
 * P2 (PLAN.md): Playwright e2e — 6–10 сценариев основного user-флоу.
 * Локальный гейт: `npx playwright test` (запускает dev-сервер сам, webServer).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // mock-сервер делит localStorage per-context, но последовательность стабильнее
  retries: 0,
  // list — для локального запуска; html — артефакт в CI (e2e-nightly.yml)
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    /* Фолбэки окружения (AGENTS.md §10 — причины пишем комментарием):
       - `--disable-dev-shm-usage`: в контейнерах (песочница агента, docker-CI)
         /dev/shm часто 64 МБ, и Chromium падает с «Target crashed» на рендере;
       - `--no-sandbox`/`--disable-setuid-sandbox` + `chromiumSandbox: false`:
         в контейнере без user-namespace sandbox не поднимается.
       На обычном раннере/CI флаги безопасны и ничего не меняют.
       ВАЖНО: в песочнице агента (2 vCPU / 1 ГБ RAM, /dev/shm 64 МБ) test-runner
       Playwright всё равно падает с «Target crashed» (V8 CodeRange OOM в
       gpu-process) — на обоих проектах и на чистом HEAD, т.е. это ограничение
       среды, а не дефект спеков. Библиотечный `chromium.launch()` в той же
       среде работает — им и проверяли мобильную вёрстку (см. план, «Результаты»). */
    chromiumSandbox: false,
    launchOptions: {
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.ts/ },
    /* Подзадача 10 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): мобильные viewport.
       `mobile-390` — iPhone 12 (390×844, hasTouch/isMobile), `mobile-360` — узкий
       Android (360×640): на этой ширине ловятся горизонтальный скролл и разрывы
       смысловых связок. Оба прогоняют только e2e/mobile.spec.ts. */
    { name: 'mobile-390', use: { ...devices['iPhone 12'] }, testMatch: /mobile\.spec\.ts/ },
    {
      name: 'mobile-360',
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 640 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
