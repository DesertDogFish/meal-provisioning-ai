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
- **Migrated:** 10 (Batch 1: 4, Batch 2: 4, Batch 3: 2)
- **In Progress:** 0
- **Remaining:** 3 (Batch 3: PriceOverridesTab, SubstitutionModal, RecipesPage)

## Timeline

- **Week 1:** ✅ Batch 2 migration (4 компонента) — ЗАВЕРШЕНО
- **Week 2:** 🔄 Batch 3 migration (2/5 завершено, осталось 3 компонента) ← ТЕКУЩАЯ
- **Week 3:** Удаление AppContext + усиление mock + контрактные тесты
- **Week 4:** Интеграционные тесты backend
- **Week 5:** Фикс бага агрегации стоимости
- **Week 6:** Гигиена CI и кода

## Тикет: Завершение Батча 3 миграции

### Цель
Мигрировать оставшиеся 3 компонента на API клиент и удалить AppContext полностью.

### Компоненты для миграции

#### 1. PriceOverridesTab.tsx (494 строки)
**Сложность:** Высокая
**Текущее использование AppContext:**
- `state.trips` — поиск похода по tripId
- `state.recipes` — для расчётов через calculateShoppingList
- `state.prices` — для расчётов через calculateShoppingList

**План миграции:**
1. Заменить `useApp()` на `useState` для локальных состояний
2. Добавить `useEffect` для загрузки данных через API:
   - `api.get(`/trips/${tripId}`)` — получить поход
   - `api.get('/recipes')` — получить рецепты
   - `api.get('/admin/prices')` — получить цены
3. Обновить функции расчёта:
   - `calculateShoppingList(trip, recipesMap, prices)` — использовать локальные состояния
   - `calculateDayShopping(trip, recipesMap, prices)` — использовать локальные состояния
4. Добавить состояния loading/error
5. Убрать все обращения к `state.*`

**API endpoints:**
- GET `/trips/{id}` — получить поход с днями и приёмами пищи
- GET `/recipes` — получить все рецепты
- GET `/admin/prices` — получить все цены
- GET `/trips/{id}/summary/shopping` — получить закупку (если есть)
- GET `/trips/{id}/summary/shopping/by-days` — получить закупку по дням (если есть)

**Особенности:**
- Компонент использует утилиты из `utils/calculations.ts`
- Нужно передавать правильные типы данных (Trip, Recipe[], Price[])
- Расчёты должны работать с локальными данными, а не с глобальным state

#### 2. SubstitutionModal.tsx (200+ строк)
**Сложность:** Средняя
**Текущее использование AppContext:**
- `state.ingredients` — список ингредиентов для замены
- `state.recipes` — список рецептов

**План миграции:**
1. Заменить `useApp()` на `useState` для локальных состояний
2. Добавить `useEffect` для загрузки данных через API:
   - `api.get('/admin/products')` — получить продукты
   - `api.get('/recipes')` — получить рецепты
3. Обновить поиск похожих ингредиентов:
   - `api.get(`/ingredients/similar/${fromId}`)` — получить похожие
4. Обновить создание замены:
   - `api.post(`/trips/${tripId}/substitutions`, {...})` — создать замену
5. Добавить состояния loading/error

**API endpoints:**
- GET `/admin/products` — получить все продукты
- GET `/recipes` — получить все рецепты
- GET `/ingredients/similar/{id}` — получить похожие ингредиенты
- POST `/trips/{id}/substitutions` — создать замену
- DELETE `/trips/{id}/substitutions/{subId}` — удалить замену

**Особенности:**
- Модальное окно для замены ингредиентов в рецепте
- Использует NumberField для ввода ratio
- Поиск похожих ингредиентов по категории

#### 3. RecipesPage.tsx (300+ строк)
**Сложность:** Средняя
**Текущее использование AppContext:**
- `state.recipes` — список рецептов
- `state.ingredients` — список ингредиентов (для фильтров)

**План миграции:**
1. Заменить `useApp()` на `useState` для локальных состояний
2. Добавить `useEffect` для загрузки данных через API:
   - `api.get('/recipes')` — получить рецепты
   - `api.get('/admin/products')` — получить продукты
3. Обновить фильтрацию и поиск:
   - Использовать локальные состояния recipes и ingredients
   - Фильтрация на клиенте (как сейчас)
4. Добавить состояния loading/error

**API endpoints:**
- GET `/recipes` — получить все рецепты
- GET `/admin/products` — получить все продукты

**Особенности:**
- Страница каталога рецептов
- Фильтры по типу приёма, категории, времени готовки
- Поиск по названию и ингредиентам
- Отображение карточек рецептов

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

## Notes

- Все изменения в архитектуре отражаются в ARCHITECTURE.md
- Все изменения в плане отражаются в этом файле
- Правила для агентов — в AGENTS.md
- Основная документация — в README.md
- **Никаких новых MD-файлов!** Только обновление существующих.
