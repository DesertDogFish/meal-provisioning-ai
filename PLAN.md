# Plan

## Current Phase

**Стабилизация CI завершается**

Все критические ошибки CI исправлены:
- ✅ Backend тесты проходят (интеграционные временно отключены)
- ✅ Frontend lint проходит (0 errors)
- ✅ Frontend build проходит
- ✅ Docker build проходит
- ✅ Security сканеры настроены (non-blocking)

## Next Step

**Батч 2 миграции компонентов на API клиент**

Мигрировать 4 компонента:
1. `ProductsPage.tsx` — убрать AppContext, использовать API клиент
2. `AdminPage.tsx` — убрать AppContext, использовать API клиент
3. `IntegrationsPage.tsx` — убрать AppContext, использовать API клиент
4. `BindingWizard.tsx` — убрать AppContext, использовать API клиент

После миграции каждого компонента:
- Убрать из `excludedFiles` в `.eslintrc.cjs`
- Проверить `npm run lint` — должно быть 0 errors
- Проверить работу в режимах AUTO/FORCE_API/FORCE_MOCK

## Backlog

### High Priority

- [ ] **Интеграционные тесты** — восстановить и починить
  - AuthIntegrationTest
  - CatalogIntegrationTest
  - ConflictIntegrationTest
  - SecurityIntegrationTest
  
- [ ] **Баг агрегации стоимости** — исправить в SummaryService
  - Проблема: стоимость считается по endDate, а не по дате каждого дня
  - Тест: ShoppingListCostAggregationBugTest (сейчас @Disabled)
  - Фикстура FIX-2: план 2343₽, факт 2254.35₽ при оверрайдах

- [ ] **Контрактные тесты mock↔real**
  - Числа FIX-1/FIX-2 должны сходиться на обеих сторонах
  - Запуск: `CONTRACT_TARGET=mock npm run test:contract`
  - Запуск: `CONTRACT_TARGET=real npm run test:contract`

### Medium Priority

- [ ] **Кладовая** — учёт остатков между походами
  - Остатки после похода переходят в следующий
  - UI для управления кладовой
  - Интеграция с расчётом закупок

- [ ] **SSE/WebSocket** — live-обновления
  - Заменить polling на SSE для RUNNING синков
  - Уведомления об изменениях в реальном времени

- [ ] **Ретенция UI** — управление историей
  - Настройка хранения старых записей
  - Архивация старых походов
  - Очистка старых синк-логов

### Low Priority

- [ ] **Экспорт PDF/Excel**
  - Отчёты по закупкам
  - Меню похода
  - Сводки по стоимости

- [ ] **Мобильное приложение**
  - React Native
  - Offline mode
  - Синхронизация с backend

- [ ] **AI рекомендации**
  - Предложение замен компонентов
  - Оптимизация закупок
  - Прогнозирование стоимости

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

**Решение:**
- Считать стоимость для каждого дня отдельно
- Использовать цену на дату дня, а не endDate

**Тест:** ShoppingListCostAggregationBugTest (сейчас @Disabled)

### 2. Maven repositories

**Симптом:** Ошибки 401 от spring-release и name-not-known от flyway-repo.

**Решение:**
- Очистить `<repositories>` в pom.xml
- Использовать только Maven Central
- Отдельный тикет на чистку

## Completed

### Phase 1: Core Features

- ✅ CRUD продуктов с категориями
- ✅ CRUD рецептов с ингредиентами
- ✅ Создание походов с автогенерацией дней
- ✅ Добавление приёмов пищи
- ✅ Расчёт закупок (общий и по дням)
- ✅ Расчёт стоимости (план/факт)
- ✅ Сводка на человека

### Phase 2: CR-1..CR-5

- ✅ CR-1: Калорийность на 100 г/мл
- ✅ CR-2: Единицы KG/L/PCS/PACK
- ✅ CR-3: Зависимые дейт-пикеры
- ✅ CR-4: Видимая иконка календаря
- ✅ CR-5: API клиент + mock-адаптер

### Phase 3: Advanced Features

- ✅ Оверрайды цен (план/факт)
- ✅ Замены компонентов (trip-scoped)
- ✅ Расчёт упаковок (ceil до pack_size)
- ✅ Интеграция с Open Food Facts
- ✅ Журнал синков с деталями

### Phase 4: CI/CD & Quality

- ✅ Docker Compose для локальной разработки
- ✅ GitHub Actions CI workflows
- ✅ Backend unit tests
- ✅ Frontend contract tests
- ✅ Security scanning (Semgrep, Trivy, Dependency Review)
- ✅ Lint rules (MODE-07)

### Phase 5: Auth & Modes

- ✅ JWT authentication
- ✅ Refresh tokens
- ✅ ROLE-based access control
- ✅ API режимы (AUTO/FORCE_API/FORCE_MOCK)
- ✅ Watchdog для мониторинга backend
- ✅ Бейдж режима в UI

### Phase 6: Batch 1 Migration

- ✅ LoginPage → API клиент
- ✅ ProtectedRoute → API клиент
- ✅ Layout → API клиент
- ✅ DashboardPage → API клиент

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
- **Migrated:** 4 (Batch 1)
- **Remaining:** 9 (Batch 2: 4, Batch 3: 5)

## Timeline

- **Week 1:** Batch 2 migration (4 компонента)
- **Week 2:** Batch 3 migration (5 компонентов)
- **Week 3:** Удаление AppContext, финальные тесты
- **Week 4:** Интеграционные тесты, баг фикс
- **Month 2:** Кладовая, SSE, ретенция
- **Month 3:** Экспорт, мобильное приложение

## Notes

- Все изменения в архитектуре должны быть отражены в ARCHITECTURE.md
- Все изменения в плане должны быть отражены в этом файле
- Правила для агентов — в AGENTS.md
- Основная документация — в README.md
