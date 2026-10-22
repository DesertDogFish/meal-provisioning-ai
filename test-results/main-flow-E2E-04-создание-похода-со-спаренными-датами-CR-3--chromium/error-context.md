# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: main-flow.spec.ts >> E2E-04 создание похода со спаренными датами (CR-3)
- Location: e2e/main-flow.spec.ts:46:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/Людей|Количество людей/)

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - complementary [ref=f1e4]:
    - generic [ref=f1e10]:
      - heading "Провиант" [level=1] [ref=f1e11]
      - paragraph [ref=f1e12]: Планировщик питания
    - navigation [ref=f1e13]:
      - link "Мои походы" [ref=f1e14] [cursor=pointer]:
        - /url: /dashboard
      - link "Походы" [ref=f1e19] [cursor=pointer]:
        - /url: /trips
      - link "Каталог блюд" [ref=f1e23] [cursor=pointer]:
        - /url: /recipes
      - link "Ошибки (демо)" [ref=f1e29] [cursor=pointer]:
        - /url: /errors-demo
      - link "Продукты" [ref=f1e32] [cursor=pointer]:
        - /url: /products
      - link "Интеграции" [ref=f1e35] [cursor=pointer]:
        - /url: /integrations
      - link "Журнал синков" [ref=f1e38] [cursor=pointer]:
        - /url: /sync-logs
    - generic [ref=f1e41]:
      - generic [ref=f1e42]:
        - generic [ref=f1e43]: AU
        - generic [ref=f1e44]:
          - paragraph [ref=f1e45]: Admin User
          - paragraph [ref=f1e46]: admin@provision.app
      - button "Выйти" [ref=f1e47]
  - generic [ref=f1e52]:
    - generic "Клик для настройки режима" [ref=f1e53] [cursor=pointer]: демо-режим
    - main [ref=f1e56]:
      - generic [ref=f1e57]:
        - generic [ref=f1e58]:
          - generic [ref=f1e59]:
            - heading "Походы" [level=1] [ref=f1e60]
            - paragraph [ref=f1e61]: Управление вашими походами и запасами
          - button "Новый поход" [ref=f1e62]
        - generic [ref=f1e66]:
          - heading "Новый поход" [level=2] [ref=f1e67]
          - generic [ref=f1e68]:
            - generic [ref=f1e69]:
              - generic [ref=f1e70]: Название
              - textbox "Название" [ref=f1e71]:
                - /placeholder: Поход на Алтай
                - text: Поход на Алтай
            - generic [ref=f1e72]:
              - generic [ref=f1e73]:
                - generic [ref=f1e74]: Дата начала
                - textbox "Дата начала" [ref=f1e75]:
                  - /placeholder: Выберите дату
                  - text: 2026-07-01
              - generic [ref=f1e76]:
                - generic [ref=f1e77]: Дата окончания
                - textbox "Дата окончания" [active] [ref=f1e78]:
                  - /placeholder: Выберите дату
                  - text: 2026-07-05
            - generic [ref=f1e79]:
              - generic [ref=f1e80]: Количество человек
              - spinbutton "Количество человек" [ref=f1e81]: "4"
            - generic [ref=f1e82]:
              - generic [ref=f1e83]: Заметки
              - textbox "Заметки" [ref=f1e84]:
                - /placeholder: Особенности похода...
          - generic [ref=f1e85]:
            - button "Отмена" [ref=f1e86]
            - button "Создать" [ref=f1e87]
        - generic [ref=f1e88]:
          - paragraph [ref=f1e91]: У вас пока нет походов
          - button "Создать первый поход" [ref=f1e92] [cursor=pointer]
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
  34  |   await expect(page).not.toHaveURL(/\/products$/);
  35  | });
  36  | 
  37  | test('E2E-03 продукт + предупреждение о дубле', async ({ page }) => {
  38  |   await login(page);
  39  |   await page.goto('/products');
  40  |   await page.getByRole('button', { name: /Продукт/ }).first().click();
  41  |   await page.getByPlaceholder('Например: Гречка ядрица').fill('Гречка ядрица');
  42  |   // debounce checkDuplicate = 300ms (ProductsPage)
  43  |   await expect(page.getByText(/Есть «Гречка ядрица»/)).toBeVisible({ timeout: 8_000 });
  44  | });
  45  | 
  46  | test('E2E-04 создание похода со спаренными датами (CR-3)', async ({ page }) => {
  47  |   await login(page);
  48  |   await page.goto('/trips');
  49  |   await page.getByRole('button', { name: /Новый поход/ }).click();
  50  |   await page.getByLabel(/Название/).fill('Поход на Алтай');
  51  |   const start = page.locator('#start-date');
  52  |   const end = page.locator('#end-date');
  53  |   await start.fill('2026-07-01');
  54  |   // спаривание пикеров: min у end подтягивается за start (DateRange)
  55  |   await expect(end).toHaveAttribute('min', '2026-07-01');
  56  |   await end.fill('2026-07-05');
> 57  |   await page.getByLabel(/Людей|Количество людей/).fill('4');
      |                                                   ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  58  |   await page.getByRole('button', { name: 'Создать' }).click();
  59  |   await expect(page.getByText('Поход на Алтай').first()).toBeVisible({ timeout: 15_000 });
  60  | });
  61  | 
  62  | test('E2E-05 сводка поездки: закупки/стоимость/калории', async ({ page }) => {
  63  |   await login(page);
  64  |   await page.goto('/trips');
  65  |   await page.locator('a[href*="/trips/"]').first().click();
  66  |   await expect(page.getByText('Список закупок на весь поход')).toBeVisible({ timeout: 15_000 });
  67  |   await expect(page.getByText('Сводка')).toBeVisible();
  68  |   await expect(page.getByText('Калории/приём')).toBeVisible();
  69  |   await expect(page.getByText(/₽/).first()).toBeVisible();
  70  | });
  71  | 
  72  | test('E2E-06 фолбэк: принудительный real без бэкенда → не падаем', async ({ page }) => {
  73  |   await login(page);
  74  |   await page.evaluate(() => localStorage.setItem('apiMode', 'real'));
  75  |   await page.reload();
  76  |   // watchdog/health-check должен либо показать статус бэкенда, либо вернуть в демо — но не белый экран
  77  |   await expect(page.locator('body')).toBeVisible();
  78  |   await expect(page.getByText(/демо-режим|бэкенд/i).first()).toBeVisible({ timeout: 20_000 });
  79  | });
  80  | 
  81  | test('E2E-07 смена режима через модалку бейджа', async ({ page }) => {
  82  |   await login(page);
  83  |   const badge = page.getByText(/демо-режим/).first();
  84  |   await expect(badge).toBeVisible({ timeout: 15_000 });
  85  |   await badge.click();
  86  |   await page.getByRole('button', { name: /бэкенд|реальный/i }).first().click();
  87  |   await expect(page.getByText(/бэкенд/i).first()).toBeVisible({ timeout: 15_000 });
  88  | });
  89  | 
  90  | test('E2E-08 очистка демо-кеша с подтверждением', async ({ page }) => {
  91  |   await login(page);
  92  |   const badge = page.getByText(/демо-режим/).first();
  93  |   await expect(badge).toBeVisible({ timeout: 15_000 });
  94  |   await badge.click();
  95  |   page.once('dialog', d => d.accept());
  96  |   await page.getByRole('button', { name: /Сбросить демо-данные/ }).click();
  97  |   // после resetSeedData() идёт reload — снова видимый бейдж demo-режима
  98  |   await expect(page.getByText(/демо-режим/).first()).toBeVisible({ timeout: 15_000 });
  99  | });
  100 | 
```