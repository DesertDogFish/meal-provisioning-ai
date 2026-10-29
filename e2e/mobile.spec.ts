import { test, expect, type Page } from '@playwright/test';

/**
 * Подзадача 10 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): e2e на мобильном
 * viewport. Запускается проектами `mobile-390` (iPhone 12, 390×844) и
 * `mobile-360` (360×640) — см. playwright.config.ts. Режим — mock.
 *
 * Проверяем требования владельца:
 *  1) смысловые связки не разрываются и не вызывают горизонтальный скролл;
 *  2) модалки/поповеры по центру и целиком в экране;
 *  3) основной текст читается без зума;
 *  4) чеклист пригоден для магазина одной рукой;
 *  5) «Снять всё»/«Отметить всё» — только через подтверждение.
 */

const USER = { email: 'user@provision.app', password: 'password123' };
const ADMIN = { email: 'admin@provision.app', password: 'password123' };

async function login(page: Page, creds = USER) {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(creds.email);
  await page.getByPlaceholder('••••••••').fill(creds.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/** Открыть сидовый поход с реальным меню (иначе чеклист пуст). */
async function openSeededTrip(page: Page) {
  await login(page);
  await page.locator('[data-testid^="trip-card-"]', { hasText: 'Карельский' }).first().click();
  await expect(page).toHaveURL(/\/trips\/trip1/, { timeout: 15_000 });
  await expect(page.getByText('Поход на Карельский перешеек').first()).toBeVisible();
}

/** Горизонтального скролла страницы быть не должно (главный симптом «не влезло»). */
async function expectNoHorizontalScroll(page: Page, where: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `горизонтальный скролл: ${where}`).toBeLessThanOrEqual(clientWidth + 1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('apiMode', 'mock'));
});

test('M-01 каркас: drawer открывается/закрывается, горизонтального скролла нет', async ({ page }) => {
  await login(page);
  await expectNoHorizontalScroll(page, '/dashboard');

  const burger = page.getByRole('button', { name: 'Открыть меню навигации' });
  await expect(burger).toBeVisible();
  await burger.click();
  const overlay = page.getByTestId('drawer-overlay');
  await expect(overlay).toBeVisible();
  // drawer не шире 85vw
  const aside = page.locator('aside.app-drawer');
  const box = await aside.boundingBox();
  expect(box!.width).toBeLessThanOrEqual((await page.evaluate(() => window.innerWidth)) * 0.85 + 1);
  // клик именно по затемнению, а не по центру элемента: центр перекрыт панелью
  // (drawer z-nav=60 выше overlay z-pop=40) — так же тапает пользователь
  const vp0 = page.viewportSize()!;
  await overlay.click({ position: { x: vp0.width - 12, y: 200 } });
  await expect(overlay).toHaveCount(0);
});

test('M-02 поход: KPI-связки целы, вкладки не рвут подписи', async ({ page }) => {
  await openSeededTrip(page);
  await expectNoHorizontalScroll(page, '/trips/trip1');

  // «Стоимость» и её подсказка — ОДНА связка (неразрывна)
  const costLabel = page.locator('.stat .keep-pair', { hasText: 'Стоимость' }).first();
  await expect(costLabel).toBeVisible();
  const labelBox = await costLabel.boundingBox();
  const tipBox = await costLabel.locator('[data-testid="info-tip"]').boundingBox();
  // иконка подсказки на той же строке, что и подпись (одинаковый вертикальный центр ±6px)
  expect(Math.abs((tipBox!.y + tipBox!.height / 2) - (labelBox!.y + labelBox!.height / 2)))
    .toBeLessThanOrEqual(6);

  // подписи вкладок — в одну строку
  const tab = page.getByRole('button', { name: 'Закупка на поход' });
  const tabBox = await tab.boundingBox();
  expect(tabBox!.height).toBeLessThanOrEqual(48);

  // Плавающий бейдж режима не должен наезжать на заголовок страницы: на мобильном
  // он закреплён внизу слева (на 360px `top-20 right-4` перекрывал «Поход на
  // Карельский перешеек»), внизу справа живёт `.scroll-top-btn` — не сталкиваем.
  const h1 = await page.locator('main h1').first().boundingBox();
  // инстансов бейджа в DOM два (inline в топбаре + десктопный fixed в hidden-lg
  // обёртке): на мобильном видим первый, .first() снимает strict-mode
  const badge = await page.getByTitle('Клик для настройки режима').first().boundingBox();
  const intersects = !(badge!.x + badge!.width <= h1!.x || h1!.x + h1!.width <= badge!.x
    || badge!.y + badge!.height <= h1!.y || h1!.y + h1!.height <= badge!.y);
  expect(intersects, 'бейдж режима пересекает заголовок страницы').toBe(false);

  // KPI-значения не вылезают за границы своих карточек (на 360px nowrap-связка
  // «Стоимость ⓘ» + «1 630 ₽» не помещалась в строку и значение обрезалось):
  // на телефоне карточка складывается в столбик (@media max-width 480px).
  const clippedStats = await page.evaluate(() => Array.from(document.querySelectorAll('main .stat'))
    .filter((card) => {
      const v = card.querySelector('.stat-value');
      if (!v) return false;
      const c = card.getBoundingClientRect();
      const r = v.getBoundingClientRect();
      return r.right > c.right + 1 || r.left < c.left - 1;
    }).length);
  expect(clippedStats, 'KPI-значение обрезано границей карточки').toBe(0);
});

test('M-03 InfoTip: подсказка открывается тапом и целиком в экране', async ({ page }) => {
  await openSeededTrip(page);
  const tip = page.locator('.stat .keep-pair', { hasText: 'Стоимость' }).first()
    .locator('[data-testid="info-tip"]');
  await tip.click();
  const pop = page.getByRole('tooltip');
  await expect(pop).toBeVisible();
  const box = await pop.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
  // нативного title нет — второго тултипа не будет
  await expect(tip).not.toHaveAttribute('title', /.+/);
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
});

test('M-04 модалка состава: по центру и целиком в экране', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByText('5 приёмов пищи').first().click();
  await page.locator('[aria-label="Состав приёма: Рис с рыбой"]').first().click();

  const overlay = page.locator('.modal-overlay');
  await expect(overlay).toBeVisible();
  const sheet = overlay.locator('.modal-wrap > *').first();
  const box = await sheet.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.height, 'модалка выше экрана').toBeLessThanOrEqual(vp.height);
  // по центру по обеим осям (допуск 4px на дробные координаты)
  expect(Math.abs((box!.x + box!.width / 2) - vp.width / 2)).toBeLessThanOrEqual(4);
  expect(Math.abs((box!.y + box!.height / 2) - vp.height / 2)).toBeLessThanOrEqual(4);
  // кнопки действий видны без скролла страницы: липкий футер внутри листа
  await expect(page.getByRole('button', { name: 'Сохранить состав' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('M-05 чеклист: отметка тапом по строке, фильтр, прогресс', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByRole('button', { name: 'Чеклист' }).click();
  const progress = page.getByTestId('checklist-progress');
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '0');

  const firstRow = page.locator('[data-testid^="checklist-row-"]').first();
  const ingId = ((await firstRow.getAttribute('data-testid')) ?? '').replace('checklist-row-', '');
  const box = page.getByTestId(`bought-checkbox-${ingId}`);
  await firstRow.click();
  await expect(box).toBeChecked();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');

  // «только не взятое» скрывает отмеченную позицию
  await page.getByTestId('checklist-only-missing').check();
  await expect(box).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'чеклист');
});

test('M-06 «Снять всё» — опасное действие только через подтверждение', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByRole('button', { name: 'Чеклист' }).click();
  await page.locator('[data-testid^="checklist-row-"]').first().click();
  await expect(page.getByTestId('checklist-progress')).toHaveAttribute('aria-valuenow', '1');

  await page.getByTestId('checklist-none').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Снять все отметки?');
  // диалог влезает в экран
  const box = await dialog.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.height).toBeLessThanOrEqual(vp.height);
  expect(box!.width).toBeLessThanOrEqual(vp.width);

  // отмена ничего не меняет
  await page.getByTestId('confirm-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('checklist-progress')).toHaveAttribute('aria-valuenow', '1');

  // подтверждение — сбрасывает
  await page.getByTestId('checklist-none').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('checklist-progress')).toHaveAttribute('aria-valuenow', '0');
});

test('M-07 «Закупка и чеки»: карточный режим, значения подписаны, скролла страницы нет', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByRole('button', { name: 'Закупка и чеки' }).click();
  const panel = page.locator('.table-cards').first();
  await expect(panel).toBeVisible();
  await expectNoHorizontalScroll(page, 'закупка и чеки');

  // подпись значения берётся из data-label (шапка таблицы на мобильном скрыта)
  const cell = panel.locator('td[data-label="Думали ₽"]').first();
  await expect(cell).toBeVisible();
  await expect(cell).toHaveAttribute('data-label', 'Думали ₽');
  // связка «Думали ₽» + подсказка в шапке не разорвана (проверяем на десктопной семантике)
  await expect(panel.locator('thead .keep-pair').first()).toHaveCount(1);
});

test('M-08 каталог продуктов: карточный режим без горизонтального скролла', async ({ page }) => {
  // админ-раздел доступен только админу
  await login(page, ADMIN);
  await page.goto('/products');
  await expect(page.getByTestId('product-row').first()).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page, '/products');
  await expect(page.locator('.table-cards td[data-label="Цена"]').first()).toBeVisible();
});

test('M-09 основной текст читается без зума (≥12px), поля ввода ≥16px', async ({ page }) => {
  await openSeededTrip(page);
  const minText = await page.evaluate(() => {
    const sizes: number[] = [];
    document.querySelectorAll('main p, main span, main td, main th, main button').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (!t) return;
      sizes.push(parseFloat(window.getComputedStyle(el).fontSize));
    });
    return Math.min(...sizes);
  });
  expect(minText).toBeGreaterThanOrEqual(12);

  await page.getByRole('button', { name: 'Чеклист' }).click();
  // Только текстовые/числовые поля: iOS зумит страницу при фокусе на input
  // с font-size < 16px. Чекбоксы в расчёт не берём — у них font-size на зум
  // не влияет, а их вычисленный размер наследуется от браузера (13.33px).
  const inputSizes = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(
      'main input[type="text"], main input[type="number"], main input:not([type])',
    ));
    return els.map((el) => parseFloat(window.getComputedStyle(el).fontSize));
  });
  expect(inputSizes.length, 'на вкладке «Чеклист» нет ни одного текстового поля').toBeGreaterThan(0);
  expect(Math.min(...inputSizes)).toBeGreaterThanOrEqual(16);
});
