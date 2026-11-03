import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('ivan@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 20_000 });
}

test.describe('API TOKEN — логин с API, потом без API', () => {
  test('TOKEN-01 логин с API (real/mock) → токен сохранён', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    // Проверяем, что токен сохранён в localStorage
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(token).toBeTruthy();
    expect(token).toContain('mock-access-token');
  });

  test('TOKEN-02 перезагрузка страницы → автологин по токену', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    // Перезагружаем страницу
    await page.reload();
    await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Походы' })).toBeVisible({ timeout: 10_000 });
  });

  test('TOKEN-03 логин со старым токеном без API (офлайн)', async ({ page, context }) => {
    // Сначала логинимся (получаем токен)
    await loginViaUi(page, 'admin@provision.app', 'password123');
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(token).toBeTruthy();

    // Отключаем сеть
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Перезагружаем — должен автологиниться по кэшированному токену
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
    } catch {
      // ERR_INTERNET_DISCONNECTED — нормально при офлайн
    }
    await page.waitForTimeout(2000);
    // Проверяем, что не редирект на логин
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
    await context.setOffline(false);
  });

  test('TOKEN-04 выход → токен очищен', async ({ page }) => {
    await loginViaUi(page, 'admin@provision.app', 'password123');
    // Ищем кнопку выхода
    const logoutBtn = page.getByRole('button', { name: /Выйти|Logout|Выход/ }).first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      const token = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(token).toBeNull();
    }
  });
});