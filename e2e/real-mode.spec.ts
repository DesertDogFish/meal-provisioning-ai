import { test, expect, type Page } from '@playwright/test';

/**
 * P0-3: e2e в РЕАЛЬНОМ режиме против поднятого docker compose стека.
 *
 * Предыстория: фронтенд грузил цены со несуществующего GET /admin/prices, а реальный
 * эндпоинт был закрыт для ADMIN — в real-режиме страницы походов падали с
 * «Не удалось загрузить данные» даже у админа, а обычный USER не получил бы цены никогда.
 * После фикса (GET /api/v1/prices для всех аутентифицированных) тест проверяет, что
 * обычный USER видит цены в своём походе.
 *
 * Требования к окружению (CI job real-e2e в .github/workflows/e2e-nightly.yml):
 *   docker compose up -d --build  →  frontend :3000, backend :8080 (VITE_API_MODE=real)
 * Запуск локально: E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/real-mode.spec.ts
 */

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const BACKEND = process.env.E2E_BACKEND_URL || 'http://localhost:8080';

async function apiRegister(email: string, password: string): Promise<string | null> {
  // идемпотентная регистрация нового пользователя напрямую через API бэкенда
  const res = await fetch(`${BACKEND}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, firstName: 'E2E', lastName: 'Real' }),
  });
  if (res.ok) return (await res.json()).accessToken as string;
  if (res.status === 409) {
    // уже существует (повторный прогон) — логинимся
    const login = await fetch(`${BACKEND}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (login.ok) return (await login.json()).accessToken as string;
  }
  return null;
}

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe('REAL mode (docker compose stack)', () => {
  test.skip(
    // ВАЖНО: у test.skip по сигнатуре (details, testInfo) ПЕРВЫЙ аргумент — FixtureNames;
    // пустой деструктурирующий паттерн `{}` запрещён линтером (no-empty-pattern),
    // а второй параметр (testInfo) в skip-условии не используется.
    async () => {
      try {
        const meta = await fetch(`${BACKEND}/api/v1/meta`, { signal: AbortSignal.timeout(3000) });
        return !meta.ok;
      } catch {
        return true; // бэкенд недоступен -> skip (в mock-only CI не валим job)
      }
    },
    'backend not running (docker compose stack required)'
  );

  test('REAL-01 обычный USER загружает поход и видит цены (P0-3 regression)', async ({ page }) => {
    const stamp = Date.now();
    const email = `real-user-${stamp}@provision.test`;
    // Свой пароль свежерегистрированного пользователя (не секрет из конфига).
    const password = `E2e-Real-${stamp}`;

    // 1. Подготовка данных через API под обычным USER (не админом!)
    const token = await apiRegister(email, password);
    test.skip(token === null, 'auth/register failed against backend');

    const tripRes = await fetch(`${BACKEND}/api/v1/trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: `E2E Real ${stamp}`,
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        peopleCount: 2,
      }),
    });
    expect(tripRes.ok).toBeTruthy();
    // trip используется в URL перехода ниже (проверка, что UI открывает именно этот поход)
    const trip = (await tripRes.json()) as { id: number };

    // Прямая проверка контракта: USER теперь получает 200 на /prices (было 403/404)
    const pricesRes = await fetch(`${BACKEND}/api/v1/prices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pricesRes.status).toBe(200);
    expect(Array.isArray(await pricesRes.json())).toBeTruthy();

    // 2. UI: логин тем же пользователем в real-режиме (фронт контейнера собран с VITE_API_MODE=real)
    await loginViaUi(page, email, password);

    // 3. Открываем созданный поход напрямую по id: страница НЕ должна падать с «Не удалось загрузить данные»
    await page.goto(`${BASE}/trips/${trip.id}`);
    await expect(page.getByText('Не удалось загрузить данные')).not.toBeVisible({ timeout: 20_000 });
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // 5. Вкладки с расчётом цен (Закупка/Сводка) открываются без ошибки загрузки
    const shoppingTab = page.getByRole('button', { name: 'Закупка на поход' });
    if (await shoppingTab.isVisible().catch(() => false)) {
      await shoppingTab.click();
      await expect(page.getByText('Список закупок на весь поход')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Не удалось загрузить данные')).not.toBeVisible();
    }
  });
});
