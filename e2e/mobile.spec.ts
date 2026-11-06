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
  await page.getByPlaceholder('ivan@example.com').fill(creds.email);
  await page.getByPlaceholder('••••••••').fill(creds.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/trips(\?|$)/, { timeout: 15_000 });
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
  await expectNoHorizontalScroll(page, '/trips');

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
  const tab = page.getByTestId('stage-bar-shopping');
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
  await page.getByTestId('stage-bar-store').click();
  const tip = page.locator('.checklist-head [data-testid="info-tip"]').first();
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
  await page.getByTestId('stage-bar-store').click();
  const progress = page.getByTestId('checklist-progress');
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '0');

  const firstRow = page.locator('[data-testid^="checklist-row-"]').first();
  const ingId = ((await firstRow.getAttribute('data-testid')) ?? '').replace('checklist-row-', '');
  const box = page.getByTestId(`bought-checkbox-${ingId}`);
  await firstRow.click();
  await expect(box).toBeChecked();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');

  // «Осталось · N» скрывает отмеченную позицию (подзадача 5: кнопка, не чекбокс)
  await page.getByTestId('checklist-only-missing').click();
  await expect(box).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'чеклист');
});

test('M-06 «Снять всё» — опасное действие только через подтверждение', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByTestId('stage-bar-store').click();
  await page.locator('[data-testid^="checklist-row-"]').first().click();
  await expect(page.getByTestId('checklist-progress')).toHaveAttribute('aria-valuenow', '1');

  await page.getByTestId('checklist-kebab').click();
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
  await page.getByTestId('checklist-kebab').click();
  await page.getByTestId('checklist-none').click();
  await page.getByTestId('confirm-yes').click();
  await expect(page.getByTestId('checklist-progress')).toHaveAttribute('aria-valuenow', '0');
});

test('M-07 этап ④ «Чеки и итог»: карточный режим, значения подписаны, скролла страницы нет', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByTestId('stage-bar-checks').click();
  // bugs-trip-checks-stage пп.1–2: блока «Кто сколько должен» и липкой полосы
  // «План · Факт · Δ» на этапе ④ больше нет (итог — один, внизу таблицы)
  await expect(page.getByTestId('who-owes')).toHaveCount(0);
  await expect(page.getByTestId('planfact-strip')).toHaveCount(0);
  const mobile = page.getByTestId('checks-mobile');
  await expect(mobile).toBeVisible();
  await expectNoHorizontalScroll(page, 'чеки и итог');
  // компактная строка позиции: только стоимость («+ стоимость, ₽» / NumberField);
  // «плана» и бейджа отклонения в строке нет (пп.3–4), неподведённая строка
  // подсвечена .row-attention (п.6)
  const firstLine = page.locator('[data-testid^="checkline-"]').first();
  await expect(firstLine).toBeVisible();
  await expect(firstLine).not.toContainText('план');
  await expect(page.locator('.checkline.row-attention').first()).toBeVisible();
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

  await page.getByTestId('stage-bar-store').click();
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

test('M-10 этапы: переходы таб-баром, ?stage= в URL, состояние не теряется', async ({ page }) => {
  await openSeededTrip(page);
  await expect(page).toHaveURL(/stage=menu|\/trips\/trip1/);
  await page.getByTestId('stage-bar-shopping').click();
  await expect(page).toHaveURL(/stage=shopping/);
  // вид списка закупки переключается в один тап (подзадача 3);
  // bugs-trip-shopping-stage п.5: вид «На человека» удалён — только «На поход»/«По дням»
  await expect(page.getByTestId('shopping-view-person')).toHaveCount(0);
  await page.getByTestId('shopping-view-days').click();
  await expect(page.getByTestId('shopping-view-days')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Предварительная закупка по дням')).toBeVisible();
  // возврат в меню и обратно — вид закупки сохранён (состояние этапа локальное)
  await page.getByTestId('stage-bar-menu').click();
  await expect(page).toHaveURL(/stage=menu/);
  await page.getByTestId('stage-bar-shopping').click();
  await expect(page.getByTestId('shopping-view-days')).toHaveAttribute('aria-selected', 'true');
  // прямая ссылка на этап (детерминизм e2e)
  await page.goto('/trips/trip1?stage=checks');
  // bugs-trip-checks-stage п.1: «кто должен» убран с этапа ④ — только чек
  await expect(page.getByTestId('who-owes')).toHaveCount(0);
  await expect(page.getByTestId('checks-mobile')).toBeVisible();
  await expectNoHorizontalScroll(page, 'этапы');
});

test('M-11 полоса похода: тап раскрывает sheet с KPI, Esc закрывает', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByTestId('trip-strip').click();
  const sheet = page.getByTestId('trip-summary-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Стоимость');
  const box = await sheet.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('M-12 чек одним тапом по строке: «+ стоимость, ₽» → ввод → итоги', async ({ page }) => {
  await openSeededTrip(page);
  // отмечаем «взято» на этапе ③ — без этого ввод чека закрыт
  await page.getByTestId('stage-bar-store').click();
  const row = page.locator('[data-testid^="checklist-row-"]').first();
  const ingId = ((await row.getAttribute('data-testid')) ?? '').replace('checklist-row-', '');
  await row.click();
  await page.getByTestId('stage-bar-checks').click();
  const line = page.getByTestId(`checkline-${ingId}`);
  await expect(line).toBeVisible();
  const add = page.getByTestId(`fact-add-${ingId}`);
  await expect(add).toBeVisible();
  await add.click();
  const input = page.getByTestId(`actual-input-mobile-${ingId}`);
  await expect(input).toBeVisible();
  await input.fill('100');
  await input.press('Enter');
  // после ввода строка показывает NumberField с суммой, а не кнопку
  await expect(page.getByTestId(`actual-input-${ingId}`).first()).toBeVisible();
  await expectNoHorizontalScroll(page, 'ввод чека');
});

test('M-13 отчёт: in-app маршрут читается в одну колонку, «Поделиться» даёт текст', async ({ page }) => {
  await openSeededTrip(page);
  await page.goto('/trips/trip1/report');
  await expect(page.getByTestId('trip-report')).toBeVisible();
  await expect(page.getByTestId('report-owe')).toBeVisible();
  await expect(page.getByTestId('report-menu')).toBeVisible();
  await expectNoHorizontalScroll(page, 'отчёт');
  // фолбэк «Поделиться» — копирование текста итога
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('report-share').click();
  await expect(page.getByText(/Текст итога скопирован/).first()).toBeVisible({ timeout: 8_000 });
});

// UX-осмотр 31.10 (подзадача 5, KB-33): на 390px было три переключателя этапов
// (степпер, протёкший из-под `hidden` десктопный .seg, нижний таб-бар), два из
// них обрезаны справа. Проверяем, что осталась ровно одна мобильная навигация.
test('M-11 KB-33: одна мобильная навигация этапов, .seg скрыт, обрезки нет', async ({ page }) => {
  await openSeededTrip(page);

  // redesign п.6: десктопный .seg-дубль этапов УДАЛЁН из DOM целиком
  // (ранее — display:none на mobile; теперь этапы переключаются чипами/таб-баром)
  await expect(page.getByTestId('desktop-stage-seg')).toHaveCount(0);

  // степпера-дубля больше нет
  await expect(page.locator('.stage-stepper')).toHaveCount(0);
  await expect(page.getByTestId('stage-stepper')).toHaveCount(0);

  // ровно одна ВИДИМАЯ nav «Этапы похода» — нижний таб-бар
  const visibleStageNavs = await page.evaluate(() => Array
    .from(document.querySelectorAll('nav[aria-label="Этапы похода"]'))
    .filter((n) => n.getBoundingClientRect().height > 0).length);
  expect(visibleStageNavs).toBe(1);

  // ничего не обрезано справа (overflowX = 0), в т.ч. у под-навигации вида закупки
  const clipped = await page.evaluate(() => Array
    .from(document.querySelectorAll('nav[aria-label="Этапы похода"]'))
    .map((el) => el.scrollWidth - el.clientWidth)
    .filter((d) => d > 1));
  expect(clipped, 'обрезка справа у навигации этапов').toEqual([]);
  await expectNoHorizontalScroll(page, '/trips/trip1 (навигация этапов)');

  // единственный переключатель действительно работает
  await page.getByTestId('stage-bar-store').click();
  await expect(page).toHaveURL(/stage=store/);
  await page.getByTestId('stage-bar-menu').click();
  await expect(page).toHaveURL(/stage=menu/);
});

// bugs-trip-menu-stage п.6: нижняя панель этапов должна быть прижата к низу
// вьюпорта БЕЗ зазора («вроде внизу, но с зазором» — баг владельца 03.11).
// В headless-Chromium safe-area-inset = 0, поэтому геометрию проверяем как
// инвариант (bottom:0 → низ бара = низ вьюпорта, ширина = ширина вьюпорта);
// реальный зазор на iPhone лечится viewport-fit=cover в index.html +
// env(safe-area-inset-bottom)-паддингом бара (инвариант meta — src/viewportMeta.test.ts).
test('M-14 п.6: .stage-bar прижат к низу вьюпорта, без просвета фона', async ({ page }) => {
  await openSeededTrip(page);

  const bar = page.locator('nav.stage-bar');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  const vp = page.viewportSize()!;
  expect(box, 'stage-bar не отрисован').not.toBeNull();
  // прижат к низу (допуск 1px на дробные координаты) и к боковым краям
  expect(Math.abs(box!.y + box!.height - vp.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box!.x + box!.width - vp.width)).toBeLessThanOrEqual(1);
  // под баром нет ничего видимого: точка на 2px ниже низа бара — вне вьюпорта
  const below = await page.evaluate(() => {
    const el = document.querySelector('nav.stage-bar')!;
    const r = el.getBoundingClientRect();
    return { gap: window.innerHeight - r.bottom };
  });
  expect(below.gap).toBeLessThanOrEqual(1);
  await expectNoHorizontalScroll(page, '/trips/trip1 (stage-bar)');
});

// bugs-trip-checks-stage п.7: длинный список магазина/чека — липкий поиск,
// прокрутка к совпадению ближе к центру, подсветка, явная индикация промаха.
test('M-15 п.7: поиск в чеклисте — липкий контрол, подсветка совпадения, «Не найдено»', async ({ page }) => {
  await openSeededTrip(page);
  await page.getByTestId('stage-bar-store').click();
  const input = page.getByTestId('checklist-search-input');
  await expect(input).toBeVisible();

  // (а) контрол в липкой шапке: после прокрутки страницы он остаётся видимым
  // mobile-390 — WebKit, где mouse.wheel не поддерживается: скроллим программно
  await page.evaluate(() => window.scrollBy(0, 300));
  await expect(input).toBeVisible();
  const box = await input.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);

  // (б) ввод — первое совпадение подсвечено (.search-hit на строке списка)
  const firstName = (await page.locator('.checklist-row .font-bold').first().innerText()).trim();
  await input.fill(firstName);
  await expect(page.getByTestId('checklist-search-count')).toBeVisible();
  await expect(page.locator('[data-search-id].search-hit').first()).toBeVisible();

  // (в) промах — явная индикация
  await input.fill('zzz-такого-нет');
  await expect(page.getByTestId('checklist-search-none')).toHaveText('Не найдено');

  // очистка — подсветка снята
  await page.getByTestId('checklist-search-clear').click();
  await expect(page.locator('[data-search-id].search-hit')).toHaveCount(0);
  await expectNoHorizontalScroll(page, 'поиск в чеклисте');
});
