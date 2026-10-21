# Plan

## Current Phase

**Миграция Батча 3: Ядро похода + Удаление AppContext**

Предыдущие фазы:
- ✅ Фаза 1: Core Features (CRUD продуктов, рецептов, походов)
- ✅ Фаза 2: CR-1..CR-5 (калорийность, единицы, даты, API клиент)
- ✅ Фаза 3: Advanced Features (оверрайды, замены, упаковки, интеграции)
- ✅ Фаза 4: CI/CD & Quality (Docker, GitHub Actions, тесты)
- ✅ Фаза 5: Auth & Modes (JWT, режимы AUTO/API/MOCK, watchdog)
- ✅ Фаза 6: Batch 1 Migration (LoginPage, ProtectedRoute, Layout, DashboardPage)
- ✅ Фаза 7: CI Fixes (Mockito, lint, SHA, prefer-const, Trivy, happy-dom)
- ✅ Фаза 8: Batch 2 Migration (ProductsPage, AdminPage, IntegrationsPage, BindingWizard)
- 🔄 Фаза 9: Batch 3 Migration - В ПРОЦЕССЕ (TripsPage ✅, TripDetailPage ✅, осталось 3 компонента)

**Текущая фаза:** Batch 3 Migration (3 компонента осталось) + Удаление AppContext

## Next Step

**Задача 2: Завершение Батча 3 + Удаление AppContext**

###已完成 (Done):
- ✅ `src/pages/TripsPage.tsx` — мигрирован на API клиент
- ✅ `src/pages/TripDetailPage.tsx` — мигрирован на API клиент

### Осталось мигрировать (3 компонента):
1. `src/components/PriceOverridesTab.tsx` — убрать AppContext, использовать API клиент
   - Сложность: высокая (494 строки, сложная логика расчётов)
   - Зависимости: calculateShoppingList, calculateDayShopping из utils/calculations
   - API endpoints: `/trips/{id}/price-overrides`, `/trips/{id}/summary/shopping`

2. `src/components/SubstitutionModal.tsx` — убрать AppContext, использовать API клиент
   - Сложность: средняя (200+ строк)
   - API endpoints: `/trips/{id}/substitutions`, `/ingredients/similar/{id}`

3. `src/pages/RecipesPage.tsx` — убрать AppContext, использовать API клиент
   - Сложность: средняя (300+ строк)
   - API endpoints: `/recipes`, `/recipes/{id}`

### После миграции всех компонентов:
- Удалить `src/store/AppContext.tsx`
- Удалить папку `src/store/` (если пуста)
- Убрать файлы из `excludedFiles` в `.eslintrc.cjs`
- Глобальный поиск не должен находить AppContext

### Критерий готовности:
- В этих 3 файлах нет импортов AppContext или mockData
- `npm run lint` и `npm run build` зелёные
- AppContext полностью удалён из проекта
- MODE-07 правило снова строгое для всего проекта

## Backlog

### Задача 2: Миграция Батча 3 + Удаление AppContext

Файлы:
- `src/pages/TripsPage.tsx`
- `src/pages/TripDetailPage.tsx`
- `src/components/PriceOverridesTab.tsx`
- `src/components/SubstitutionModal.tsx`
- `src/pages/RecipesPage.tsx`

После миграции:
- Удалить `src/store/AppContext.tsx`
- Удалить папку `src/store/` (если пуста)
- Убрать файлы из `excludedFiles` в `.eslintrc.cjs`
- Глобальный поиск не должен находить AppContext

### Задача 3: Усиление Mock-сервера и контрактных тестов

- Проверить `calculatedCaloriesPerServing` в mockServer.ts (формула CR-1)
- Убедиться, что PUT `/trips/:id/price-overrides` реально обновляет данные
- Добавить тесты на граничные случаи в contract.test.ts

### Задача 4: Реанимация интеграционных тестов (Backend)

Файлы:
- `AuthIntegrationTest.java` — починить `/auth/me` без токена (500 → 401)
- `CatalogIntegrationTest.java` — разобраться с 403 Forbidden
- `ConflictIntegrationTest.java` — убрать @Disabled
- `SecurityIntegrationTest.java` — убрать @Disabled

В SecurityConfig настроить `permitAll()` для публичных GET-запросов к каталогу.

### Задача 5: Фикс бага агрегации стоимости

**Проблема:** SummaryService берёт общее количество продукта за поход и умножает на цену на endDate. Если цена менялась во время похода, расчёт неверный.

**Решение:** Переписать логику — стоимость должна считаться посуммно по дням:
```
for each day:
  for each meal:
    amount = calculateAmountForMeal(...)
    price = getPriceForDate(day.date)
    cost = amount * price
    totalCost += cost
```

**Тест:** Вернуть `ShoppingListCostAggregationBugTest`, убрав `@Disabled`.

### Задача 6: Гигиена CI и кода

**Backend:**
- Удалить/закомментировать неработающие `<repository>` из `backend/pom.xml`:
  - spring-release (401)
  - flyway-repo (Name or service not known)
  - flyway-community-db-support (401)

**Frontend:**
- Пройтись по 7 warning'ам ESLint (react-hooks/exhaustive-deps)
- Добавить недостающие зависимости в useEffect
- Или обернуть функции в useCallback
- Или убрать лишние зависимости

## Known Bugs

### 1. Агрегация стоимости по endDate

**Симптом:** При изменении цен во время похода стоимость считается неверно.

**Пример:**
- Поход: 10-20 мая
- Гречка: 180₽ до 15 мая, 250₽ с 15 мая
- День 10 мая: 0.8 KG × 180₽ = 144₽ (правильно)
- День 20 мая: 0.8 KG × 250₽ = 200₽ (правильно)
- Итого: 344₽

**Текущая реализация:**
- Использует цену на endDate (20 мая) для всех дней
- Результат: 1.6 KG × 250₽ = 400₽ (неправильно!)

**Решение:** Считать стоимость для каждого дня отдельно.

**Тест:** ShoppingListCostAggregationBugTest (сейчас @Disabled)

### 2. Maven repositories

**Симптом:** Ошибки 401 от spring-release и name-not-known от flyway-repo.

**Решение:** Очистить `<repositories>` в pom.xml, использовать только Maven Central.

## Completed

### Phase 1: Core Features ✅
- CRUD продуктов с категориями
- CRUD рецептов с ингредиентами
- Создание походов с автогенерацией дней
- Добавление приёмов пищи
- Расчёт закупок (общий и по дням)
- Расчёт стоимости (план/факт)
- Сводка на человека

### Phase 2: CR-1..CR-5 ✅
- CR-1: Калорийность на 100 г/мл
- CR-2: Единицы KG/L/PCS/PACK
- CR-3: Зависимые дейт-пикеры
- CR-4: Видимая иконка календаря
- CR-5: API клиент + mock-адаптер

### Phase 3: Advanced Features ✅
- Оверрайды цен (план/факт)
- Замены компонентов (trip-scoped)
- Расчёт упаковок (ceil до pack_size)
- Интеграция с Open Food Facts
- Журнал синков с деталями

### Phase 4: CI/CD & Quality ✅
- Docker Compose для локальной разработки
- GitHub Actions CI workflows
- Backend unit tests
- Frontend contract tests
- Security scanning (Semgrep, Trivy, Dependency Review)
- Lint rules (MODE-07)

### Phase 5: Auth & Modes ✅
- JWT authentication
- Refresh tokens
- ROLE-based access control
- API режимы (AUTO/FORCE_API/FORCE_MOCK)
- Watchdog для мониторинга backend
- Бейдж режима в UI

### Phase 6: Batch 1 Migration ✅
- LoginPage → API клиент
- ProtectedRoute → API клиент
- Layout → API клиент
- DashboardPage → API клиент

### Phase 7: CI Fixes ✅
- Mockito 5.14.2 для JDK 21
- Lint правила и исключения
- Контрактные тесты FIX-1/FIX-2
- Happy-dom вместо jsdom
- Trivy non-blocking
- SHA пиннинг (потом откат на теги)
- prefer-const и unused vars

### Phase 8: Batch 2 Migration ✅
- ProductsPage → API клиент
- AdminPage → API клиент
- IntegrationsPage → API клиент
- BindingWizard → API клиент
- Все файлы мигрированы, нет импортов AppContext/mockData
- Build и lint проходят успешно

## Metrics

### Code
- **Backend:** ~150 файлов Java
- **Frontend:** ~50 файлов TypeScript/TSX
- **Migrations:** 11 файлов SQL (V1-V11)
- **Tests:** 9 backend + 3 frontend
- **Total:** ~200 файлов

### Coverage
- **Backend:** ~70% (unit + integration отключены)
- **Frontend:** ~30% (calc + mock + contract)
- **E2E:** 0% (не начато)

### Components Migration
- **Total:** 13 компонентов
- **Migrated:** 13 (Batch 1: 4, Batch 2: 4, Batch 3: 5) ✅ ЗАВЕРШЕНО
- **In Progress:** 0
- **Remaining:** 0

## Timeline

- **Week 1:** ✅ Batch 2 migration (4 компонента) — ЗАВЕРШЕНО
- **Week 2:** ✅ Batch 3 migration (5/5 завершено) — ЗАВЕРШЕНО
- **Week 3:** Удаление AppContext + усиление mock + контрактные тесты
- **Week 4:** Интеграционные тесты backend
- **Week 5:** Фикс бага агрегации стоимости
- **Week 6:** Гигиена CI и кода

## Тикет: Завершение Батча 3 миграции

### Цель
Мигрировать оставшиеся 3 компонента на API клиент и удалить AppContext полностью.

### Компоненты для миграции

#### 1. PriceOverridesTab.tsx (494 строки) ✅ ЗАВЕРШЕНО
**Сложность:** Высокая
**Миграция завершена:**
- ✅ Убран `useApp()` из AppContext
- ✅ Добавлены локальные состояния: `trip`, `recipes`, `prices`, `loading`, `error`
- ✅ Добавлена функция `loadData()` для загрузки данных через API
- ✅ Обновлены функции расчёта для работы с локальными данными
- ✅ Добавлены состояния loading/error
- ✅ Build проходит успешно

#### 2. SubstitutionModal.tsx (200+ строк) ✅ ЗАВЕРШЕНО
**Сложность:** Средняя
**Миграция завершена:**
- ✅ Убран `useApp()` из AppContext
- ✅ Добавлен импорт `api` из client.ts
- ✅ Заменены все `fetch` вызовы на `api` клиент
- ✅ Убраны ручные заголовки авторизации

#### 3. RecipesPage.tsx (300+ строк) ✅ ЗАВЕРШЕНО
**Сложность:** Средняя
**Миграция завершена:**
- ✅ Убран `useApp()` из AppContext
- ✅ Добавлен импорт `api` из client.ts
- ✅ Добавлены локальные состояния: `recipes`, `loading`, `error`
- ✅ Добавлена функция `loadRecipes()` для загрузки данных через API
- ✅ Обновлены все обращения к `state.recipes` на локальное состояние `recipes`
- ✅ Добавлены состояния loading/error

### После миграции всех компонентов

#### Удаление AppContext
1. Удалить файл `src/store/AppContext.tsx`
2. Удалить папку `src/store/` (если пуста)
3. Проверить, что нигде нет импортов AppContext:
   ```bash
   grep -r "AppContext" src/
   ```
4. Проверить, что нигде нет импортов useApp:
   ```bash
   grep -r "useApp" src/
   ```

#### Обновление ESLint конфигурации
1. Открыть `.eslintrc.cjs`
2. Убрать файлы из `excludedFiles`:
   - `src/components/PriceOverridesTab.tsx`
   - `src/components/SubstitutionModal.tsx`
   - `src/pages/RecipesPage.tsx`
3. Проверить, что правило MODE-07 снова строгое для всего проекта

#### Финальная проверка
1. Запустить `npm run lint` — должно быть 0 errors
2. Запустить `npm run build` — должно быть BUILD SUCCESS
3. Запустить `npm run test` — все тесты должны проходить
4. Проверить в браузере:
   - Страница "Закупка и чеки" работает
   - Модалка замены ингредиентов работает
   - Страница каталога рецептов работает

### Критерии готовности
- [ ] Все 3 компонента мигрированы на API клиент
- [ ] Нет импортов AppContext или useApp в мигрированных файлах
- [ ] AppContext.tsx удалён
- [ ] Папка src/store/ удалена (если пуста)
- [ ] ESLint конфигурация обновлена (файлы убраны из excludedFiles)
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — BUILD SUCCESS
- [ ] `npm run test` — все тесты проходят
- [ ] Все страницы работают в браузере

### Оценка времени
- PriceOverridesTab.tsx: 2-3 часа (высокая сложность)
- SubstitutionModal.tsx: 1-2 часа (средняя сложность)
- RecipesPage.tsx: 1-2 часа (средняя сложность)
- Удаление AppContext и проверка: 30 минут
- **Итого:** 4.5-7.5 часов

### Риски
1. **Сложность расчётов в PriceOverridesTab** — может потребоваться рефакторинг утилит
2. **Зависимости между компонентами** — нужно проверить, что все API endpoints реализованы в mockServer
3. **Типы данных** — нужно убедиться, что API возвращает данные в правильном формате

### Тестирование
После миграции каждого компонента:
1. Проверить в MOCK режиме — данные загружаются из mockServer
2. Проверить в REAL режиме — данные загружаются из backend
3. Проверить все CRUD операции — создание, чтение, обновление, удаление
4. Проверить обработку ошибок — loading/error состояния

---

## Тикет: Полировка UI — единый дизайн-системный апгрейд

**Приоритет:** P1 (после завершения миграции Батча 3)  
**Оценка:** 4–6 часов  
**Зависимости:** завершена миграция Батча 3 (иначе правки будут конфликтовать с переносом компонентов)

### Описание
Применить ко всем экранам приложения визуальные улучшения из прототипа proviant-products-v3.html. Цель — превратить интерфейс из «функционального прототипа» в «полированный SaaS-продукт» без изменения цветовой палитры и структуры.

**Референс:** файл proviant-products-v3.html (хранить в корне репо как эталон, не удалять).

### Чек-лист нововведений

#### 1. Глубина и свет (Refined Glassmorphism)
- Добавить CSS-переменные: `--surface-highlight`, `--glow-primary`, `--border-subtle`, `--border-highlight`
- Обновить `.card` / `.glass`: `backdrop-filter: blur(16px) saturate(120%)`, inset тень сверху + мягкая тень снизу
- Добавить hover-эффект на карточки: подсветка границы + усиление тени

#### 2. Микро-взаимодействия
- Глобальный transition: `all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` для кнопок, табов, чипов, полей
- Эффект нажатия: `transform: scale(0.97)` на `:active` для кнопок
- Улучшенный фокус полей: `box-shadow: 0 0 0 3px var(--glow-primary), inset 0 1px 2px rgba(0,0,0,0.2)`
- Анимация появления модалок: `slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)`

#### 3. Бейджи (chips) с обводкой
- Заменить сплошную заливку на полупрозрачный фон + цветную обводку
- Стили для `.tag.off`, `.tag.man`, `.tag.fire`, `.tag.ok`, `.tag.dn` по образцу из прототипа

#### 4. Таблицы
- Hover на строках: `tr:hover td { background: var(--surface-highlight); }`
- Убрать вертикальные разделители, оставить только горизонтальные `border-bottom`
- Плавный transition: `background 0.15s ease` на ячейках

#### 5. Типографика
- `letter-spacing: -0.02em` для h1, h2 (плотность заголовков)
- `letter-spacing: 0.03em` для `.mu` (читаемость мелких подписей)
- Сохранить `font-variant-numeric: tabular-nums` для чисел (уже есть)

#### 6. Empty States
- Заменить текстовые «Ничего не найдено» на SVG-иконку + описание + кнопка действия
- Единый стиль для всех пустых состояний (таблицы, списки, фильтры)

#### 7. Скелетоны (shimmer)
- Добавить класс `.skeleton` с градиентом и анимацией `shimmer 1.5s infinite`
- Применить в состояниях загрузки таблиц и карточек

#### 8. Humanize + русские лейблы единиц (CR-2, подтверждение)
- Словарь `UNIT_LABELS = { KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' }` — единый для всего UI
- Функция `humanize(amount, unit)`: 0.8 KG → 800 г, 0.25 L → 250 мл, 2 PCS → 2 шт, 1 PACK → 1 уп
- Применить во всех таблицах, фильтрах, модалках, сообщениях о дублях
- В UI нигде не должно встречаться «PCS», «KG», «L», «PACK» — только русские лейблы

### Критерии готовности
- [ ] Все 8 пунктов чек-листа применены ко всем экранам (Продукты, Цены, Рецепты, Походы, Интеграции, Журнал синков, Дашборд)
- [ ] Визуальная консистентность: карточки, кнопки, бейджи, модалки выглядят одинаково на всех страницах
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — SUCCESS
- [ ] В UI нигде нет «PCS»/«KG»/«L»/«PACK» (grep-проверка)
- [ ] Прототип proviant-products-v3.html остаётся в репо как живой референс

### Что НЕ делать
- ❌ Менять цветовую палитру (`--w1`, `--w2`, `--bg`, `--sf` остаются)
- ❌ Менять структуру страниц или логику компонентов
- ❌ Создавать новые CSS-фреймворки или подключать внешние библиотеки
- ❌ Писать отчёты в MD — только правка PLAN.md

### Связанные задачи в бэклоге
- **CR-2** (единицы кг/л/шт/уп) — уже реализован частично, эта задача завершает применение humanize везде
- **Миграция Батча 3** — должна быть завершена до начала этой задачи, чтобы не править один и тот же код дважды
- **Интеграционные тесты** — не блокируют, но после полировки стоит прогнать визуально (скриншоты ключевых экранов)

## Notes

- Все изменения в архитектуре отражаются в ARCHITECTURE.md
- Все изменения в плане отражаются в этом файле
- Правила для агентов — в AGENTS.md
- Основная документация — в README.md
- **Никаких новых MD-файлов!** Только обновление существующих.
