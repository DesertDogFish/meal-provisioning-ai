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
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
