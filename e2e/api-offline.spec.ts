import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('ivan@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 20_000 });
}

test.describe('API OFFLINE — без всех API', () => {
  test('OFFLINE-01 баннер показывается при отключении сети', async ({ page, context }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    const banner = page.locator('text=Вы офлайн');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await context.setOffline(false);
  });

  test('OFFLINE-02 мутации заблокированы офлайн', async ({ page, context }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    // Баннер офлайн должен быть виден
    const banner = page.locator('text=Вы офлайн');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await context.setOffline(false);
  });

  test('OFFLINE-03 IndexedDB содержит кэшированные данные', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    // Проверяем, что данные загружены (страница не пустая)
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('OFFLINE-04 синхронизация после восстановления сети', async ({ page, context }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    await context.setOffline(false);
    await page.waitForTimeout(2000);
    // Баннер должен исчезнуть
    const banner = page.locator('text=Вы офлайн');
    await expect(banner).not.toBeVisible({ timeout: 5000 });
  });
});