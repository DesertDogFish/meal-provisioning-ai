import { test, expect, type Page } from '@playwright/test';

/**
 * План plans/done/2026-10-31-ux-audit-navigation.md (п.10): e2e-регресс связности.
 * Сценарии:
 *  N-1 «блюдо → в меню → предвыбор → добавлено» (п.1);
 *  N-2 «① → CTA ② → CTA ③ → отметить всё → CTA ④ → отчёт → Поделиться-фолбэк» (п.2);
 *  N-3 «продукт → в рецептах → фильтр → рецепт → в меню похода» (п.6);
 *  N-4 канон /trips и редиректы (п.8; полный набор легаси-маршрутов —
 *      cleanup-redirects.spec.ts, здесь — что внутренние переходы идут БЕЗ редиректа);
 *  N-5 пустые состояния всех этапов (п.3) + создание похода открывает этап ① (п.9).
 * Прогон в песочнице агента — библиотечным chromium (KB-16), полный runner — CI (BL-32).
 */

const ADMIN = { email: 'admin@provision.app', password: 'password123' };
const USER = { email: 'user@provision.app', password: 'password123' };

async function login(page: Page, creds = ADMIN) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(creds.email);
  await page.getByPlaceholder('••••••••').fill(creds.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  // Детерминированный старт: mock-режим до загрузки бандла (паттерн main-flow.spec)
  await page.addInitScript(() => localStorage.setItem('apiMode', 'mock'));
});

test('N-1 блюдо → «В меню похода…» → предвыбор блюда → добавлено (navigation-п.1)', async ({ page }) => {
  await login(page, USER);
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'Добавить «Овсяная каша» в меню похода' }).click();
  const sheet = page.getByTestId('recipe-to-menu-sheet');
  await expect(sheet).toBeVisible();
  await page.getByTestId('menu-sheet-trip-trip1').click();
  await page.getByTestId(/^menu-sheet-day-/).first().click();

  // deep-link: этап ① + модалка приёма; одноразовые параметры чистятся из URL
  await expect(page).toHaveURL(/\/trips\/trip1\?stage=menu/, { timeout: 15_000 });
  await expect(page).toHaveURL(/^(?!.*addMeal)(?!.*recipe=).*$/, { timeout: 10_000 });

  // блюдо ПРЕДВЫБРАНО — повторный поиск не нужен (суть бага «рецепт теряется»)
  const overlay = page.locator('.modal-overlay');
  await expect(overlay.getByRole('heading', { name: 'Добавить приём пищи' })).toBeVisible();
  await expect(overlay.getByTestId('meal-preview')).toContainText('Овсяная каша');

  const before = await page.locator('[aria-label="Состав приёма: Овсяная каша"]').count();
  // Enter вместо координатного клика: в момент фокуса модалка смещается на ~30px
  // (scroll-into-view переполненного оверлея), и клик мышью может попасть между
  // pointerdown/up — commit не срабатывает (KB-29). Enter по фокусу независим от позиции.
  const addBtn = overlay.getByRole('button', { name: 'Добавить', exact: true });
  await expect(addBtn).toBeEnabled({ timeout: 10_000 });
  await addBtn.press('Enter');
  await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 10_000 });
  // день получил +1 приём: было «5 приёмов пищи» → «6 приёмов пищи» (свёрнутый день)
  if (before === 0) {
    await expect(page.getByText('6 приёмов пищи').first()).toBeVisible({ timeout: 10_000 });
  } else {
    await expect(page.locator('[aria-label="Состав приёма: Овсяная каша"]')).toHaveCount(before + 1, { timeout: 10_000 });
  }
});

test('N-2 ① → CTA ② → CTA ③ → всё взято → CTA ④ → чеки → отчёт → Поделиться-фолбэк (navigation-п.2)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page, USER);
  await page.goto('/trips/trip1?stage=menu');

  // ① меню собрано → CTA «К закупке ②»
  await expect(page.getByTestId('stage-next-cta')).toHaveText(/К закупке ②/);
  await page.getByTestId('stage-next-cta').click();
  await expect(page).toHaveURL(/stage=shopping/);

  // ② есть позиции → CTA «К списку в магазине ③»
  await expect(page.getByTestId('stage-next-cta')).toHaveText(/К списку в магазине ③/, { timeout: 10_000 });
  await page.getByTestId('stage-next-cta').click();
  await expect(page).toHaveURL(/stage=store/);

  // ③ «Отметить всё» (с брендовым подтверждением) → CTA «Ввести чеки ④»
  await page.getByTestId('checklist-all').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('stage-next-cta')).toHaveText(/Ввести чеки ④/, { timeout: 10_000 });
  await page.getByTestId('stage-next-cta').click();
  await expect(page).toHaveURL(/stage=checks/);

  // ④ вводим чек по каждой позиции → CTA «Отчёт и поделиться».
  // Несколько проходов: после Enter строки перерендериваются (итги/доступность),
  // за один проход часть позиций остаётся незаполненной.
  const cta4 = page.getByTestId('stage-next-cta');
  for (let pass = 0; pass < 6; pass++) {
    if (/Отчёт и поделиться/.test(await cta4.innerText().catch(() => ''))) break;
    const actualInputs = page.locator('input[data-testid^="actual-input-"]');
    const n = await actualInputs.count();
    expect(n, 'в сид-походе должны быть позиции для чека').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const input = actualInputs.nth(i);
      if (await input.isDisabled().catch(() => true)) continue;
      const v = await input.inputValue().catch(() => '100');
      if (v && v !== '0') continue;
      await input.fill('100');
      await input.press('Enter');
    }
  }
  await expect(cta4).toHaveText(/Отчёт и поделиться/, { timeout: 15_000 });
  await page.getByTestId('stage-next-cta').click();
  await expect(page).toHaveURL(/\/trips\/trip1\/report/, { timeout: 15_000 });

  // Поделиться: navigator.share в десктоп-chromium нет → фолбэк-копирование в буфер
  await page.getByTestId('report-share').click();
  await expect(page.getByText('Текст итога скопирован — вставьте в мессенджер')).toBeVisible({ timeout: 10_000 });
});

test('N-3 продукт → «В рецептах: N» → фильтр рецептов → «В меню похода…» без тупика (navigation-п.6)', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/products');
  const usageLink = page.locator('[data-testid^="product-usage-link-"]').first();
  await expect(usageLink).toBeVisible({ timeout: 15_000 });
  const href = await usageLink.getAttribute('href');
  expect(href).toMatch(/^\/recipes\?ingredient=/);
  await usageLink.click();

  // фильтр применён: параметр в URL (shareable) + чип ингредиента + непустой список
  await expect(page).toHaveURL(/\/recipes\?ingredient=/, { timeout: 15_000 });
  await expect(page.getByTestId('recipes-ingredient-chip')).toBeVisible();
  await expect(page.locator('[data-testid^="recipe-to-menu-"]').first()).toBeVisible();

  // рецепт → «В меню похода…»: sheet со списком походов → день → deep-link ①
  // с предвыбранным блюдом (тупика нет ни у пользователя с походами, ни без —
  // второй случай покрыт юнит-тестом RecipesPage «Походов нет — создайте поход»)
  await page.locator('[data-testid^="recipe-to-menu-"]').first().click();
  await expect(page.getByTestId('recipe-to-menu-sheet')).toBeVisible();
  await page.getByTestId('menu-sheet-trip-trip1').click();
  await page.getByTestId(/^menu-sheet-day-/).first().click();
  await expect(page).toHaveURL(/\/trips\/trip1\?stage=menu/, { timeout: 15_000 });
  const overlay3 = page.locator('.modal-overlay');
  await expect(overlay3.getByRole('heading', { name: 'Добавить приём пищи' })).toBeVisible();
  await expect(overlay3.getByTestId('meal-preview')).toContainText('Гречка с тушёнкой');
  // KB-29: Enter вместо клика — модалка смещается в момент фокуса
  await overlay3.getByRole('button', { name: 'Отмена' }).press('Enter');
  await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 10_000 });
});

test('N-4 канон /trips: сайдбар ведёт напрямую, legacy /dashboard — редирект (navigation-п.8)', async ({ page }) => {
  await login(page, ADMIN);
  // внутренний переход БЕЗ редиректа: пункт сайдбара «Походы» → href /trips
  const navLink = page.locator('nav a[href="/trips"]').first();
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/\/trips(\/?$|\?)/);

  // legacy-маршруты остаются рабочими (полный набор — cleanup-redirects.spec.ts)
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
});

test('N-5 создание похода → этап ①; пустые состояния ②③④ с рабочими CTA (navigation-п.3/п.9)', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/trips');

  // п.9: после создания — сразу этап ① нового похода (не список)
  await page.getByRole('button', { name: /Создать поход/ }).click();
  await page.getByLabel(/Название/).fill('Пустой поход');
  await page.locator('#start-date').fill('2026-09-01');
  await page.locator('#end-date').fill('2026-09-02');
  await page.locator('.modal-overlay').getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/trip-\d+\?stage=menu/, { timeout: 15_000 });
  await expect(page.getByText('Поход создан — добавьте первый приём пищи')).toBeVisible();

  // ②③④ без меню — empty-state с рабочими CTA. ВАЖНО: переходы — чипсами этапов
  // (SPA), НЕ page.goto: mock-сервер живёт в памяти страницы, полный reload
  // сбросил бы созданный поход (mock живёт в памяти страницы — см. комментарий к N-5).
  await page.getByTestId('stage-chip-shopping').click();
  await expect(page).toHaveURL(/stage=shopping/);
  await expect(page.getByTestId('shopping-empty')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('shopping-empty-cta').click();
  await expect(page).toHaveURL(/stage=menu/);

  await page.getByTestId('stage-chip-store').click();
  await expect(page).toHaveURL(/stage=store/);
  await expect(page.getByTestId('checklist-empty')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('checklist-empty-cta').click();
  await expect(page).toHaveURL(/stage=menu/);

  await page.getByTestId('stage-chip-checks').click();
  await expect(page).toHaveURL(/stage=checks/);
  await expect(page.getByTestId('checks-empty')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('checks-empty-cta').click();
  await expect(page).toHaveURL(/stage=shopping/);

  // список походов обновлён: новый поход виден. Возврат — goBack() (SPA):
  // page.goto сбросил бы in-memory mock вместе с созданным походом.
  // settle 300 мс: popstate не должен попасть в незакоммиченный переход роутера
  // (поймано прогоном в песочнице: goBack сразу после push терялся).
  await page.waitForTimeout(300);
  await page.goBack();
  await expect(page).toHaveURL(/\/trips(\/?$|\?)/);
  await expect(page.getByText('Пустой поход').first()).toBeVisible({ timeout: 15_000 });
});
