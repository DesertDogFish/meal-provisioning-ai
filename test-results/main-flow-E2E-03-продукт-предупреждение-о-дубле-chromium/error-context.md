# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: main-flow.spec.ts >> E2E-03 продукт + предупреждение о дубле
- Location: e2e/main-flow.spec.ts:37:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Есть «Гречка ядрица»/)
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/Есть «Гречка ядрица»/) with timeout 8000ms
  - waiting for getByText(/Есть «Гречка ядрица»/)

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
  - heading "Продукты" [level=1]
  - paragraph: 18 продуктов · 15 категорий
  - button "Продукт":
    - img
    - text: Продукт
  - img
  - textbox "Поиск по названию или штрихкоду..."
  - combobox:
    - 'option "Единица: все" [selected]'
    - option "кг"
    - option "л"
    - option "шт"
    - option "уп"
  - combobox:
    - 'option "Цена: любая" [selected]'
    - option "есть цена"
    - option "нет цены"
  - combobox:
    - 'option "Интеграция: все" [selected]'
    - option "привязаны к OFF"
    - option "не привязаны"
  - table:
    - rowgroup:
      - row "Продукт ↑ Категория Ед. Упаковка Цена В рецептах Действия":
        - columnheader "Продукт ↑"
        - columnheader "Категория"
        - columnheader "Ед."
        - columnheader "Упаковка"
        - columnheader "Цена"
        - columnheader "В рецептах"
        - columnheader "Действия"
    - rowgroup:
      - row "Вода Жидкости L развес нет цены 36":
        - cell "Вода"
        - cell "Жидкости"
        - cell "L"
        - cell "развес"
        - cell "нет цены"
        - cell "36"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Гречка Крупы KG развес нет цены 5":
        - cell "Гречка"
        - cell "Крупы"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "5"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Колбаса варёная Мясо KG развес нет цены 8":
        - cell "Колбаса варёная"
        - cell "Мясо"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "8"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Лук Овощи KG развес нет цены 22":
        - cell "Лук"
        - cell "Овощи"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "22"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Макароны Крупы KG развес нет цены 11":
        - cell "Макароны"
        - cell "Крупы"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "11"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Масло подсолнечное Масла L развес нет цены 14":
        - cell "Масло подсолнечное"
        - cell "Масла"
        - cell "L"
        - cell "развес"
        - cell "нет цены"
        - cell "14"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Морковь Овощи KG развес нет цены 9":
        - cell "Морковь"
        - cell "Овощи"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "9"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Овсяные хлопья Крупы KG развес нет цены 9":
        - cell "Овсяные хлопья"
        - cell "Крупы"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "9"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Рис Крупы KG развес нет цены 16":
        - cell "Рис"
        - cell "Крупы"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "16"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Рыбные консервы Консервы PCS развес нет цены 7":
        - cell "Рыбные консервы"
        - cell "Консервы"
        - cell "PCS"
        - cell "развес"
        - cell "нет цены"
        - cell "7"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Сахар Бакалея KG развес нет цены 22":
        - cell "Сахар"
        - cell "Бакалея"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "22"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Сгущёнка Консервы PCS развес нет цены 10":
        - cell "Сгущёнка"
        - cell "Консервы"
        - cell "PCS"
        - cell "развес"
        - cell "нет цены"
        - cell "10"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Соль Бакалея KG развес нет цены 15":
        - cell "Соль"
        - cell "Бакалея"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "15"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Сухое молоко Молочные KG развес нет цены 10":
        - cell "Сухое молоко"
        - cell "Молочные"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "10"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Сыр твёрдый Молочные KG развес нет цены 17":
        - cell "Сыр твёрдый"
        - cell "Молочные"
        - cell "KG"
        - cell "развес"
        - cell "нет цены"
        - cell "17"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Тушёнка говяжья уп. 8 PCS Консервы PCS 8 нет цены 17":
        - cell "Тушёнка говяжья уп. 8 PCS"
        - cell "Консервы"
        - cell "PCS"
        - cell "8"
        - cell "нет цены"
        - cell "17"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Хлеб Хлеб PCS развес нет цены 10":
        - cell "Хлеб"
        - cell "Хлеб"
        - cell "PCS"
        - cell "развес"
        - cell "нет цены"
        - cell "10"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
      - row "Чай Напитки PCS развес нет цены 3":
        - cell "Чай"
        - cell "Напитки"
        - cell "PCS"
        - cell "развес"
        - cell "нет цены"
        - cell "3"
        - cell:
          - button "Правка":
            - img
          - button "Удалить":
            - img
  - heading "Новый продукт" [level=2]
  - text: Название *
  - 'textbox "Например: Гречка ядрица"': Гречка ядрица
  - text: Категория *
  - combobox:
    - option "Выберите категорию..." [selected]
    - option "Крупы"
    - option "Консервы"
    - option "Напитки"
    - option "Молочное"
    - option "Овощи и зелень"
    - option "Фрукты и сухофрукты"
    - option "Сладкое"
    - option "Бакалея"
    - option "Специи"
    - option "Мясо"
    - option "Рыба"
    - option "Хлеб"
    - option "Масла"
    - option "Жидкости"
    - option "Прочее"
  - text: Единица измерения *
  - button "кг"
  - button "л"
  - button "шт"
  - button "уп"
  - text: Калорийность на 100 г / 100 мл * (как на упаковке)
  - button "Уменьшить": −
  - spinbutton "как на упаковке"
  - button "Увеличить": +
  - paragraph: Всегда на 100 — не на порцию и не на упаковку
  - button "Отмена"
  - button "Сохранить" [disabled]
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
> 43  |   await expect(page.getByText(/Есть «Гречка ядрица»/)).toBeVisible({ timeout: 8_000 });
      |                                                        ^ Error: expect(locator).toBeVisible() failed
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
  57  |   await page.getByLabel(/Людей|Количество людей/).fill('4');
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