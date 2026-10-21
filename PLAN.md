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

**Текущая фаза:** Batch 3 Migration (5 компонентов) + Удаление AppContext

## Next Step

**Задача 2: Миграция Батча 3 (Ядро похода) + Удаление AppContext**

Файлы для миграции:
1. `src/pages/TripsPage.tsx` — убрать AppContext, использовать API клиент
2. `src/pages/TripDetailPage.tsx` — убрать AppContext, использовать API клиент
3. `src/components/PriceOverridesTab.tsx` — убрать AppContext, использовать API клиент
4. `src/components/SubstitutionModal.tsx` — убрать AppContext, использовать API клиент
5. `src/pages/RecipesPage.tsx` — убрать AppContext, использовать API клиент

После миграции:
- Удалить `src/store/AppContext.tsx`
- Удалить папку `src/store/` (если пуста)
- Убрать файлы из `excludedFiles` в `.eslintrc.cjs`
- Глобальный поиск не должен находить AppContext

Критерий готовности:
- В этих 5 файлах нет импортов AppContext или mockData
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
- **Migrated:** 8 (Batch 1: 4, Batch 2: 4)
- **In Progress:** 0
- **Remaining:** 5 (Batch 3)

## Timeline

- **Week 1:** ✅ Batch 2 migration (4 компонента) — ЗАВЕРШЕНО
- **Week 2:** Batch 3 migration + удаление AppContext ← ТЕКУЩАЯ
- **Week 3:** Усиление mock + контрактные тесты
- **Week 4:** Интеграционные тесты backend
- **Week 5:** Фикс бага агрегации стоимости
- **Week 6:** Гигиена CI и кода

## Notes

- Все изменения в архитектуре отражаются в ARCHITECTURE.md
- Все изменения в плане отражаются в этом файле
- Правила для агентов — в AGENTS.md
- Основная документация — в README.md
- **Никаких новых MD-файлов!** Только обновление существующих.
