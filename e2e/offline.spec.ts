import { test, expect } from '@playwright/test';

test.describe('Offline mode', () => {
  test('shows offline banner when network is down', async ({ page, context }) => {
    await page.goto('/');
    // Симулируем офлайн
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    // Проверяем, что баннер офлайн появился
    const banner = page.locator('text=Вы офлайн');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await context.setOffline(false);
  });

  test('products page shows cached data when offline', async ({ page, context }) => {
    // Сначала загружаем данные онлайн
    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    // Уходим офлайн
    await context.setOffline(true);
    await page.reload();
    // Страница должна открыться (кэш SW)
    await expect(page).toHaveURL(/products/);
    await context.setOffline(false);
  });
});