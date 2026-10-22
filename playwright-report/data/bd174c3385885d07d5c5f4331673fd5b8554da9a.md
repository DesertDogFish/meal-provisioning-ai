# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: main-flow.spec.ts >> E2E-05 сводка поездки: закупки/стоимость/калории
- Location: e2e/main-flow.spec.ts:67:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Список закупок на весь поход')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('Список закупок на весь поход') with timeout 15000ms
  - waiting for getByText('Список закупок на весь поход')

```

```yaml
- complementary:
  - img
  - heading "Провиант" [level=1]
  - paragraph: Планировщик питания
  - navigation:
    - link "Мои походы":
      - /url: /dashboard
      - img
      - text: Мои походы
    - link "Походы":
      - /url: /trips
      - img
      - text: Походы
    - link "Каталог блюд":
      - /url: /recipes
      - img
      - text: Каталог блюд
    - link "Ошибки (демо)":
      - /url: /errors-demo
      - img
      - text: Ошибки (демо)
    - link "Продукты":
      - /url: /products
      - img
      - text: Продукты
    - link "Интеграции":
      - /url: /integrations
      - img
      - text: Интеграции
    - link "Журнал синков":
      - /url: /sync-logs
      - img
      - text: Журнал синков
  - text: AU
  - paragraph: Admin User
  - paragraph: admin@provision.app
  - button "Выйти":
    - img
    - text: Выйти
- text: демо-режим
- main:
  - paragraph: Не удалось загрузить данные
  - button "← Назад к походам"
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * P2 (PLAN.md): Playwright e2e — основной user-флоу в mock-режиме.
  5   |  * Сценарий из плана: логин → продукт+дубль → поход+спаренные даты →
  6   |  * сводка план/факт/калории/humanize → фолбэк → смена режима + очистка кеша.
  7   |  */
  8   | 
  9   | const ADMIN = { email: 'admin@provision.app', password: 'password123' };
  10  | 
  11  | async function login(page: Page, creds = ADMIN) {
  12  |   await page.goto('/login');
  13  |   await page.getByPlaceholder('you@example.com').fill(creds.email);
  14  |   await page.getByPlaceholder('••••••••').fill(creds.password);
  15  |   await page.getByRole('button', { name: 'Войти' }).click();
  16  |   await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  17  | }
  18  | 
  19  | test.beforeEach(async ({ page }) => {
  20  |   // Детерминированный старт: НЕ трогаем localStorage — очистка снесла бы
  21  |   // accessToken/mockData, залогиненные тесты отбрасывались бы на /login.
  22  |   // Фиксируем mock-режим до загрузки бандла (client читает 'apiMode' при старте).
  23  |   await page.addInitScript(() => localStorage.setItem('apiMode', 'mock'));
  24  | });
  25  | 
  26  | test('E2E-01 логин админа → дашборд', async ({ page }) => {
  27  |   await login(page);
  28  |   await expect(page.locator('h1').first()).toBeVisible();
  29  | });
  30  | 
  31  | test('E2E-02 пользователь без прав на /products (redirect)', async ({ page }) => {
  32  |   await login(page, { email: 'user@provision.app', password: 'password123' });
  33  |   await page.goto('/products');
  34  |   // ProtectedRoute adminOnly → <Navigate to="/dashboard" replace/>
  35  |   await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  36  | });
  37  | 
  38  | test('E2E-03 продукт + предупреждение о дубле', async ({ page }) => {
  39  |   await login(page);
  40  |   await page.goto('/products');
  41  |   await page.getByRole('button', { name: /Продукт/ }).first().click();
  42  |   // soft-duplicate: в сиде есть «Гречка» (KG); форма по умолчанию тоже KG →
  43  |   // жёсткий дубль. Берём другую единицу ('л') — тогда checkDuplicate даёт soft-предупреждение.
  44  |   await page.getByPlaceholder('Например: Гречка ядрица').fill('Гречка');
  45  |   await page.getByRole('button', { name: 'л', exact: true }).click();
  46  |   // debounce checkDuplicate = 300ms (ProductsPage)
  47  |   await expect(page.getByText(/Есть «Гречка» в другой единице/)).toBeVisible({ timeout: 8_000 });
  48  | });
  49  | 
  50  | test('E2E-04 создание похода со спаренными датами (CR-3)', async ({ page }) => {
  51  |   await login(page);
  52  |   await page.goto('/trips');
  53  |   await page.getByRole('button', { name: /Новый поход/ }).click();
  54  |   await page.getByLabel(/Название/).fill('Поход на Алтай');
  55  |   const start = page.locator('#start-date');
  56  |   const end = page.locator('#end-date');
  57  |   await start.fill('2026-07-01');
  58  |   // спаривание пикеров: min у end подтягивается за start (DateRange)
  59  |   await expect(end).toHaveAttribute('min', '2026-07-01');
  60  |   await end.fill('2026-07-05');
  61  |   await page.getByLabel('Количество человек').fill('4');
  62  |   // в модалке и под ней есть похожие кнопки — скопимся к форме, чтобы не словить strict-mode
  63  |   await page.locator('.fixed').getByRole('button', { name: 'Создать', exact: true }).click();
  64  |   await expect(page.getByText('Поход на Алтай').first()).toBeVisible({ timeout: 15_000 });
  65  | });
  66  | 
  67  | test('E2E-05 сводка поездки: закупки/стоимость/калории', async ({ page }) => {
  68  |   await login(page);
  69  |   // детерминированный вход: создаём свой поход через UI и идём в него по testid
  70  |   await page.goto('/trips');
  71  |   await page.getByRole('button', { name: /Новый поход/ }).click();
  72  |   await page.getByLabel(/Название/).fill('Тестовый маршрут');
  73  |   await page.locator('#start-date').fill('2026-08-01');
  74  |   await page.locator('#end-date').fill('2026-08-03');
  75  |   await page.locator('.fixed').getByRole('button', { name: 'Создать', exact: true }).click();
  76  |   await expect(page.getByText('Тестовый маршрут').first()).toBeVisible({ timeout: 15_000 });
  77  |   const card = page.locator('[data-testid^="trip-card-"]').first();
  78  |   await card.click();
  79  |   await expect(page).toHaveURL(/\/trips\/trip-/, { timeout: 15_000 });
> 80  |   await expect(page.getByText('Список закупок на весь поход')).toBeVisible({ timeout: 15_000 });
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  81  |   await expect(page.getByText('Сводка')).toBeVisible();
  82  |   await expect(page.getByText('Калории/приём')).toBeVisible();
  83  |   await expect(page.getByText(/₽/).first()).toBeVisible();
  84  | });
  85  | 
  86  | test('E2E-06 фолбэк: принудительный real без бэкенда → не падаем', async ({ page }) => {
  87  |   await login(page);
  88  |   await page.evaluate(() => localStorage.setItem('apiMode', 'real'));
  89  |   await page.reload();
  90  |   // watchdog/health-check должен либо показать статус бэкенда, либо вернуть в демо — но не белый экран
  91  |   await expect(page.locator('body')).toBeVisible();
  92  |   await expect(page.getByText(/демо-режим|бэкенд/i).first()).toBeVisible({ timeout: 20_000 });
  93  | });
  94  | 
  95  | test('E2E-07 смена режима через модалку бейджа', async ({ page }) => {
  96  |   await login(page);
  97  |   const badge = page.getByText(/демо-режим/).first();
  98  |   await expect(badge).toBeVisible({ timeout: 15_000 });
  99  |   await badge.click();
  100 |   // карточки режимов в модалке — кликабельные div (не <button>)
  101 |   await page.getByText('Бэкенд', { exact: true }).click();
  102 |   await expect(page.getByText(/АКТИВЕН/)).toBeVisible({ timeout: 15_000 });
  103 | });
  104 | 
  105 | test('E2E-08 очистка демо-кеша с подтверждением', async ({ page }) => {
  106 |   await login(page);
  107 |   const badge = page.getByText(/демо-режим/).first();
  108 |   await expect(badge).toBeVisible({ timeout: 15_000 });
  109 |   await badge.click();
  110 |   page.once('dialog', d => d.accept());
  111 |   await page.getByRole('button', { name: /Сбросить демо-данные/ }).click();
  112 |   // после resetSeedData() идёт reload — снова видимый бейдж demo-режима
  113 |   await expect(page.getByText(/демо-режим/).first()).toBeVisible({ timeout: 15_000 });
  114 | });
  115 | 
```