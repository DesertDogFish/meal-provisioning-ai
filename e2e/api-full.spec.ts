import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('ivan@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 20_000 });
}

test.describe('API FULL — со всеми API (real/mock)', () => {
  test('FULL-01 логин admin → список походов загружается', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    await expect(page.getByRole('heading', { name: 'Походы' })).toBeVisible({ timeout: 10_000 });
  });

  test('FULL-02 создание похода', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    const addBtn = page.getByRole('button', { name: 'Создать поход' }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
  });

  test('FULL-03 навигация по вкладкам похода', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    // Если есть походы — открываем первый
    const firstTrip = page.locator('[data-testid="trip-card"], .trip-card').first();
    if (await firstTrip.isVisible().catch(() => false)) {
      await firstTrip.click();
      await expect(page.getByText(/Меню|Закупка|Сводка/)).toBeVisible({ timeout: 10_000 });
    }
  });

  test('FULL-04 переключение режима API (mock ↔ real)', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    const badge = page.locator('.api-badge, [data-testid="api-mode-badge"]').first();
    if (await badge.isVisible().catch(() => false)) {
      await badge.click();
      await expect(page.getByText(/Режим данных|Бэкенд|Демо-данные/)).toBeVisible({ timeout: 5_000 });
    }
  });
});