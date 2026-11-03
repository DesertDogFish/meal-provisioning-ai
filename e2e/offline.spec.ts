import { test, expect } from '@playwright/test';

test.describe('Offline mode', () => {
  test('shows offline banner when network is down', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    const banner = page.locator('text=Вы офлайн');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await context.setOffline(false);
  });
});