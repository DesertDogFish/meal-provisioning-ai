import { test, expect, type Page } from '@playwright/test';

/**
 * P2 (PLAN.md): Playwright e2e — основной user-флоу в mock-режиме.
 * Сценарий из плана: логин → продукт+дубль → поход+спаренные даты →
 * сводка план/факт/калории/humanize → фолбэк → смена режима + очистка кеша.
 */

const ADMIN = { email: 'admin@provision.app', password: 'password123' };

async function login(page: Page, creds = ADMIN) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(creds.email);
  await page.getByPlaceholder('••••••••').fill(creds.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  // Детерминированный старт: НЕ трогаем localStorage — очистка снесла бы
  // accessToken/mockData, залогиненные тесты отбрасывались бы на /login.
  // Фиксируем mock-режим до загрузки бандла (client читает 'apiMode' при старте).
  await page.addInitScript(() => localStorage.setItem('apiMode', 'mock'));
});

test('E2E-01 логин админа → дашборд', async ({ page }) => {
  await login(page);
  await expect(page.locator('h1').first()).toBeVisible();
});

test('E2E-02 пользователь без прав на /products (redirect)', async ({ page }) => {
  await login(page, { email: 'user@provision.app', password: 'password123' });
  await page.goto('/products');
  // ProtectedRoute adminOnly → <Navigate to="/dashboard" replace/>
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
});

test('E2E-03 продукт + предупреждение о дубле', async ({ page }) => {
  await login(page);
  await page.goto('/products');
  // CI-3: кнопка получила aria-label «Добавить продукт» (доступное имя целиком),
  // прежний регистрозависимый /Продукт/ его не матчил → таймаут.
  await page.getByRole('button', { name: 'Добавить продукт' }).click();
  // soft-duplicate: в сиде есть «Гречка» (KG); форма по умолчанию тоже KG →
  // жёсткий дубль. Берём другую единицу ('л') — тогда checkDuplicate даёт soft-предупреждение.
  await page.getByPlaceholder('Например: Гречка ядрица').fill('Гречка');
  await page.getByRole('button', { name: 'л', exact: true }).click();
  // debounce checkDuplicate = 300ms (ProductsPage)
  await expect(page.getByText(/Есть «Гречка» в другой единице/)).toBeVisible({ timeout: 8_000 });
});

test('E2E-04 создание похода со спаренными датами (CR-3)', async ({ page }) => {
  await login(page);
  await page.goto('/trips');
  await page.getByRole('button', { name: /Создать поход/ }).click();
  await page.getByLabel(/Название/).fill('Поход на Алтай');
  const start = page.locator('#start-date');
  const end = page.locator('#end-date');
  await start.fill('2026-07-01');
  // спаривание пикеров: min у end подтягивается за start (DateRange)
  await expect(end).toHaveAttribute('min', '2026-07-01');
  await end.fill('2026-07-05');
  await page.getByLabel('Количество человек').fill('4');
  // в модалке и под ней есть похожие кнопки («Создать первый поход») — скопимся
  // на оверлее модалки, чтобы не словить strict-mode. CI-3: прежний скоуп .fixed
  // уехал вместе с дизайн-паком — модалки теперь рендерятся порталом в .modal-overlay.
  await page.locator('.modal-overlay').getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Поход на Алтай').first()).toBeVisible({ timeout: 15_000 });
});

test('E2E-05 сводка поездки: закупки/стоимость/калории', async ({ page }) => {
  await login(page);
  // детерминированный вход: создаём свой поход через UI и идём в него по testid
  await page.goto('/trips');
  await page.getByRole('button', { name: /Создать поход/ }).click();
  await page.getByLabel(/Название/).fill('Тестовый маршрут');
  await page.locator('#start-date').fill('2026-08-01');
  await page.locator('#end-date').fill('2026-08-03');
  await page.locator('.modal-overlay').getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByText('Тестовый маршрут').first()).toBeVisible({ timeout: 15_000 });
  const card = page.locator('[data-testid^="trip-card-"]').first();
  await card.click();
  await expect(page).toHaveURL(/\/trips\/trip-/, { timeout: 15_000 });
  // Вновь созданный поход без дней: «Список закупок» рендерится только на вкладке
  // shopping; «Сводка»/«Калории/приём» — на вкладке person. Проверяем обе вкладки.
  await page.getByRole('button', { name: 'Закупка на поход' }).click();
  await expect(page.getByText('Список закупок на весь поход')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Итого:/)).toBeVisible();
  await page.getByRole('button', { name: 'На человека' }).click();
  await expect(page.getByText('Сводка')).toBeVisible();
  await expect(page.getByText('Калории/приём')).toBeVisible();
  await expect(page.getByText(/₽/).first()).toBeVisible();
});

test('E2E-06 фолбэк: принудительный real без бэкенда → не падаем', async ({ page }) => {
  await login(page);
  await page.evaluate(() => localStorage.setItem('apiMode', 'real'));
  await page.reload();
  // watchdog/health-check должен либо показать статус бэкенда, либо вернуть в демо — но не белый экран
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByText(/демо-режим|бэкенд/i).first()).toBeVisible({ timeout: 20_000 });
});

test('E2E-07 смена режима через модалку бейджа', async ({ page }) => {
  await login(page);
  const badge = page.getByText(/демо-режим/).first();
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  // карточки режимов в модалке — кликабельные div (не <button>)
  await page.getByText('Бэкенд', { exact: true }).click();
  await expect(page.getByText(/АКТИВЕН/)).toBeVisible({ timeout: 15_000 });
});

test('E2E-08 очистка демо-кеша с подтверждением', async ({ page }) => {
  await login(page);
  const badge = page.getByText(/демо-режим/).first();
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await badge.click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: /Сбросить демо-данные/ }).click();
  // после resetSeedData() идёт reload — снова видимый бейдж demo-режима
  await expect(page.getByText(/демо-режим/).first()).toBeVisible({ timeout: 15_000 });
});

test('E2E-09 поход с сидами: открывается, имена блюд видны, добавление приёма (U6/U7)', async ({ page }) => {
  await login(page, { email: 'user@provision.app', password: 'password123' });
  await page.goto('/dashboard');
  // U6: сидовый поход (userId 2 = user@) открывается без белого экрана/краша
  await page.locator('[data-testid^="trip-card-"]', { hasText: 'Карельский' }).first().click();
  await expect(page).toHaveURL(/\/trips\/trip1/, { timeout: 15_000 });
  await expect(page.getByText('Поход на Карельский перешеек').first()).toBeVisible();

  // День по умолчанию свёрнут — раскрываем первый (5 приёмов пищи)
  await page.getByText('5 приёмов пищи').first().click();

  // U7: в меню видны НАЗВАНИЯ блюд, а не пустые строки
  await expect(page.getByText('Овсяная каша').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Гречка с тушёнкой').first()).toBeVisible();
  await expect(page.locator('[aria-label="Состав приёма: Рис с рыбой"]')).toHaveCount(1);

  // Добавление приёма: модалка не должна ломаться (U6), комбобокс блюда внутри оверлея
  await page.locator('button[title="Добавить приём пищи"]').first().click();
  const overlay = page.locator('.modal-overlay');
  await expect(overlay.getByRole('heading', { name: 'Добавить приём пищи' })).toBeVisible();
  await overlay.getByRole('combobox', { name: 'Поиск блюда' }).fill('Рис с рыбой');
  await page.getByRole('option', { name: /Рис с рыбой/ }).first().click();
  await overlay.getByRole('button', { name: 'Добавить', exact: true }).click();

  // Модалка закрылась, в дне стало два приёма «Рис с рыбой» (был обед + новый)
  await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('[aria-label="Состав приёма: Рис с рыбой"]')).toHaveCount(2, { timeout: 10_000 });
});
