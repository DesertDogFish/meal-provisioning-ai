import { test, expect, type Page } from '@playwright/test';

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.10): e2e-регрессия
 * легаси-маршрутов после демонтажа мёртвых страниц (п.1/п.2/п.3):
 *  - /admin        → /integrations            (стаб «Импорт» — админ-таб там)
 *  - /sync-logs    → /integrations?tab=logs   (журнал синков — таб «Журнал»)
 *  - /errors-demo  → /trips                   (демо ошибок удалено)
 *  - /dashboard    → /trips                   (канон списка походов)
 *  - неизвестный маршрут → /login → /trips    (залогиненный пользователь)
 * «Отчёт» = /report (in-app), печать = /print — покрыто mobile.spec.ts и
 * основным флоу; повторные запросы в ④ — юнит-тестами (PriceOverridesTab не
 * делает сетевых запросов вовсе, TripsPage.progress.test — один GET /trips).
 */

const ADMIN = { email: 'admin@provision.app', password: 'password123' };

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(ADMIN.email);
  await page.getByPlaceholder('••••••••').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('apiMode', 'mock'));
});

test('cleanup R1: /admin → /integrations, стадийный «Импорт» доступен админу', async ({ page }) => {
  await login(page);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/integrations(\?|$)/, { timeout: 15_000 });
  await expect(page.getByTestId('integrations-tab-import')).toBeVisible({ timeout: 10_000 });
});

test('cleanup R2: /sync-logs → /integrations?tab=logs', async ({ page }) => {
  await login(page);
  await page.goto('/sync-logs');
  await expect(page).toHaveURL(/\/integrations\?tab=logs/, { timeout: 15_000 });
  await expect(page.getByTestId('integrations-tab-logs')).toBeVisible({ timeout: 10_000 });
});

test('cleanup R3: /errors-demo и /dashboard → /trips', async ({ page }) => {
  await login(page);
  await page.goto('/errors-demo');
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
});

test('cleanup R4: неизвестный маршрут не оставляет тупика (→ /login → /trips)', async ({ page }) => {
  await login(page);
  await page.goto('/no-such-page');
  // catch-all → /login; LoginPage видит авторизованного пользователя → /trips
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
});
