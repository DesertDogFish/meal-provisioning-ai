# Plan: Фоновая синхронизация цен — LazyInitializationException «no Session» и фиктивные REQUIRES_NEW

Status: IN_PROGRESS
Created: 2026-10-28
Closed:

## Цель

Убрать падение фонового синка цен (`Запуск #10 · PRICES`, 28.10.2026 08:49:40, `ROSSTAT`):
`org.hibernate.LazyInitializationException: could not initialize proxy [com.provision.entity.Ingredient#160] - no Session`
в `IntegrationService.executePriceSync:333`. Синк обязан доходить до конца: писать цены,
постатейные `details.items` и честный статус (SUCCESS/PARTIAL/FAILED) в `sync_logs`.

Попутно — устранить второй дефект того же метода: `@Transactional(REQUIRES_NEW)`-методы
(`applyMappingPricesInTx`, `updateExternalProductInTx`, `finalizeSyncLog`) вызываются через `this.`
внутри того же бина → Spring-прокси обходится, «короткие транзакции» фактически идут без транзакции.

## Контекст

- Симптом описан владельцем 28.10 (лог docker-compose + drawer журнала: «Постатейных данных нет»,
  «Ошибки — · could not initialize proxy …», 0 запросов к источнику, 0.0 с).
- Fix-15 (PLAN.md §«Fix-15») добавил `details`/`items`/PARTIAL-правило, но **не** трогал доступ к
  ленивым ассоциациям вне сессии — поэтому «ничего не починилось».
- `executePriceSync` — `@Async("taskExecutor")` без транзакции (так задумано: внешний HTTP вне
  БД-сессии, P1-фикс аудита Phase 11/12). `spring.jpa.open-in-view: false`, в фоновом потоке
  OSIV-сессии нет в принципе.
- `IngredientMapping.internalIngredient` и `.externalProduct` — `@ManyToOne(fetch = LAZY)`;
  `mappingRepository.findBySource(...)` возвращает detached-объекты с неинициализированными
  прокси → первое же `ingredient.getName()` (строка 333) рвёт синк **до** цикла
  (ошибка уходит в фатальный `catch`, поэтому items пустые).
- ARCHITECTURE.md: семантика статусов синка и состав `details` (Fix-15).
- AGENTS.md: §7 (фикс-тикет без смены архитектуры), §8/R1–R2 (тест = слой изменения),
  R8/R9 (файл ≤500 строк, одна ответственность), R10 (логирование), §18 (не коммитить без просьбы).
- Решения владельца (28.10, чат):
  1. **scope = extract**: фоновый синк вынести в отдельный сервис (R8/R9), `IntegrationService` делегирует;
  2. **tests = unit_only**: только unit-слой (Mockito), новый интеграционный тест НЕ писать;
  3. **delivery = no_commit**: правки оставить в рабочем дереве, не коммитить/не пушить.

## Подзадачи (максимум 10)

### 1. `PriceSyncService` — новый сервис фонового синка цен
- Файлы: `backend/src/main/java/com/provision/service/PriceSyncService.java` (new)
- Зависимости: —
- Действия:
  - Перенести из `IntegrationService`: `executePriceSync` (оркестрация), `applyMappingPricesInTx`,
    `updateExternalProductInTx`, `finalizeSyncLog`, `MappingSyncOutcome`, `calculateUnitPrice`,
    `convertToIngredientUnit`, `syncItem`/`syncError`/`syncDetails`, `parseMappingSource`.
  - Публичный вход `runPriceSync(providerCode, syncLogId)` — без `@Async`/`@Transactional`
    (асинхронность остаётся на границе `IntegrationService.executePriceSync`).
  - Все вызовы `*InTx`/`finalizeSyncLog`/`loadPriceSyncTargets` — через `self()`
    (`ObjectProvider<PriceSyncService>`), иначе `REQUIRES_NEW` игнорируется.
  - R10: структурные логи старта/finish (`provider`, `syncLogId`, число маппингов, счётчики),
    на каждый маппинг — действие и причина, на сбой — `mappingId`/`externalCode`/`ingredientId`.
- Критерии приёмки: файл ≤500 строк; в фоне нет обращений к JPA-прокси; компилируется.
- Статус: [x] DONE

### 2. Слепок маппингов вместо ленивых проксей
- Файлы: `backend/src/main/java/com/provision/service/PriceSyncService.java`,
  `backend/src/main/java/com/provision/repository/IngredientMappingRepository.java`
- Зависимости: 1
- Действия:
  - Новый запрос `findBySourceWithIngredientAndProduct(source)`
    (`LEFT JOIN FETCH internalIngredient`, `LEFT JOIN FETCH externalProduct`, `externalCode IS NOT NULL`) —
    одна короткая read-only транзакция, без N+1.
  - `@Transactional(readOnly = true) loadPriceSyncTargets(source)` → `List<PriceSyncTarget>`
    (record: mappingId, ingredientId/Name/Unit, externalCode, productId/packAmount/packUnit).
  - В `applyMappingPricesInTx`/`updateExternalProductInTx` ингредиент и карточка продукта
    перезагружаются **по id внутри транзакции** (`findById`) — detached-объекты в сессию не тащим.
- Критерии приёмки: после `loadPriceSyncTargets` фоновый код не вызывает геттеры сущностей;
  при `internalIngredient == null` / `externalProduct == null` — item `SKIPPED` с причиной, без NPE.
- Статус: [x] DONE

### 3. `IntegrationService` — делегирование и уменьшение объёма (R8)
- Файлы: `backend/src/main/java/com/provision/service/IntegrationService.java`
- Зависимости: 1
- Действия: `executePriceSync` остаётся `@Async`-границей и вызывает `priceSyncService.runPriceSync(...)`;
  удалены перенесённые методы и ставшие неиспользуемыми импорты; конструктор дополнен
  `PriceSyncService` (8-арг конструктор для тестов сохранён).
- Критерии приёмки: ≤500 строк; контракт `POST /admin/integrations/{provider}/sync/prices`
  (202 + `logId`) не изменился.
- Статус: [x] DONE

### 4. Unit-тесты: red → green
- Файлы: `backend/src/test/java/com/provision/service/PriceSyncTestSupport.java` (new —
  оснастка: «ленивые прокси» + модель сессии + фабрики),
  `backend/src/test/java/com/provision/service/PriceSyncServiceTest.java` (new — успех),
  `backend/src/test/java/com/provision/service/PriceSyncServiceFailureTest.java` (new — отказы),
  `backend/src/test/java/com/provision/service/ExternalProductCardServiceTest.java` (new),
  `backend/src/test/java/com/provision/service/UnitPriceConverterTest.java` (new),
  `backend/src/test/java/com/provision/service/OffRecipeSourceTest.java`,
  `backend/src/test/java/com/provision/service/IntegrationServiceMappingTest.java`
- Зависимости: 1, 2, 3
- Действия:
  - `PriceSyncServiceTest`: SUCCESS + items при нормальной выгрузке; SKIPPED при пустых ценах;
    SKIPPED при отсутствии карточки продукта; ERROR-строка и PARTIAL/FAILED при исключении провайдера;
    fatalError при неизвестном провайдере; перезагрузка ингредиента/карточки через `findById`
    (guard «в транзакцию входим со свежими сущностями»); U11-поведение карточки сохранено.
  - Существующие тесты переведены на новую точку входа и новые стабы репозиториев.
- Критерии приёмки: `mvn -B test -Dtest=PriceSyncServiceTest,OffRecipeSourceTest,IntegrationServiceMappingTest`
  зелёный; глушилок (`@Disabled`) нет (R4).
- Статус: [x] DONE

### 5. Документация: PLAN.md + ARCHITECTURE.md
- Файлы: `PLAN.md`, `ARCHITECTURE.md`
- Зависимости: 1–4
- Действия: раздел «Fix-16» в PLAN.md (симптом → первопричина → решение → гейты, строка в архиве);
  в ARCHITECTURE.md — уточнение слоя синка (`PriceSyncService`, слепки, REQUIRES_NEW через self-прокси).
- Критерии приёмки: новых MD вне белого списка нет (AGENTS §1); числа/статусы синхронизированы.
- Статус: [x] DONE

## CI

- Workflow run: **не запускался** — в песочнице Arena нет `gh` и git-credentials, изменения
  не коммитятся и не пушатся (решение владельца: no commit). По AGENTS §5/R6 статус CI =
  «не проверено»: ссылку на run даст только прогон на GitHub Actions после пуша владельцем.
- Baseline-красные: `OffConfigBindingTest.userIdAndPasswordBindThroughYmlPlaceholderFromEnv`
  — красный и на чистом HEAD (проверено `git stash`): Fix-13 демонтировал OFF, ключей
  `integration.off.*` в `application.yml` нет, а тест Fix-9 требует плейсхолдер `${OFF_USER_ID:}`.
  В этом тикете не чинится и не маскируется (AGENTS §8) → Backlog.
- Локальный прогон (песочница Arena: 2 CPU / 1 ГБ RAM, Docker-демона нет → `LocalPgFallback`
  поднимает PostgreSQL 15 на :5433, Flyway V1..V25):
  - unit-батч **145/145 зелёных** (`PriceSyncServiceTest` 8, `PriceSyncServiceFailureTest` 13,
    `ExternalProductCardServiceTest` 5, `UnitPriceConverterTest` 11, `OffRecipeSourceTest` 8,
    `IntegrationServiceMappingTest` 5, `OpenFoodFactsProviderTest` 25, `OpenPricesSyncTest` 10,
    `RosstatEmisProviderTest` 23, `RosstatConfigBindingTest` 3, `SummaryServiceTest` 6,
    `SummaryServiceFixtureTest` 10, `MealCompositionMathTest` 5, `PriceOverrideTest` 3,
    `DetailedShoppingCalculationTest` 2, `ShoppingListCostAggregationBugTest` 5,
    `JwtPropertiesValidationTest` 3).
  - интеграционные по классам (Spring-контекст поднимается с новыми бинами):
    `MetaControllerTest` 1/1, `AuthIntegrationTest` 8/8, `CatalogIntegrationTest` 7/7,
    `ConflictIntegrationTest` 3/3, `RecipeUpdateInUseIntegrationTest` 3/3,
    `SecurityIntegrationTest` 6/6, `ShoppingExclusionsDayIntegrationTest` 4/4,
    `TripManualItemsIntegrationTest` 5/5, `SnapshotIsolationIntegrationTest` 3/3.
  - **НЕ прогнано (лимит памяти песочницы, не код)**: `UserPricesIntegrationTest`,
    `EconomicConsistencyTest`, `DockerStackSmokeTest` — форк surefire получает OOM-kill
    (`Process Exit Code: 137`) даже при `-Xmx256m -XX:+UseSerialGC`; для первых двух
    воспроизведено на чистом HEAD (тот же 137) → окружение, а не регрессия.
    `DockerStackSmokeTest` требует живого compose-стека (в песочнице нет Docker).
  - Полный `mvn test` одним запуском в песочнице невозможен (137); в CI джобы
    backend/docker/test прогонят его на штатном раннере.
- Frontend-гейты (`tsc --noEmit`, lint, vitest, coverage): **не запускались** — файлы фронта
  не менялись, контракты эндпоинтов и форма `SyncLog.details` сохранены → триггеры
  mock-паритета/contract (AGENTS §12/§14) не срабатывают. В песочнице нет `node_modules`.

## Known bugs

- KB-1 (ЗАКРЫТ этим тикетом, red-green): `LazyInitializationException` в фоновом синке цен —
  синк всегда падал фатально на первом маппинге, цены ЕМИСС не записывались, журнал показывал
  «Постатейных данных нет» + ошибку `no Session`.
- KB-2 (ЗАКРЫТ этим тикетом): `REQUIRES_NEW`-методы синка вызывались через `this.` → без транзакции;
  запись цен держалась на auto-commit отдельных `save()`, откат по маппингу не работал.
- KB-3 (вне тикета, не чинили по §7): `AsyncConfig` в комментарии ссылается на
  `IntegrationService#launchPriceSync` — метода нет (устаревший комментарий).
- KB-4 (вне тикета, ждёт живой проверки владельца): поведение провайдера ЕМИСС в сети владельца (SDMX-выгрузка) не проверялось —
  после фикса в drawer'е будет виден реальный текст ошибки/итоги по каждой категории.
- KB-5 (новый, выявлен при прогоне): `OffConfigBindingTest` baseline-красный
  (см. секцию CI) — наследие Fix-13/Fix-9, к этому тикету отношения не имеет.
- Ограничение проверки (решение владельца «unit_only»): сам дефект ленивой инициализации
  воспроизводится только на реальном Hibernate; unit-тесты с Mockito guard'ят контракт
  (слепки + `findById` внутри транзакции), но не сессию. Интеграционный red-green тест —
  в Backlog.

## Backlog

- Интеграционный тест `@ContainerSuite` (Testcontainers/LocalPgFallback) со стаб-провайдером:
  вызов фонового синка вне транзакции → SUCCESS + items + записи в `ingredient_prices`
  (настоящий guard против возврата KB-1).
- Живая проверка владельцем: «Подключить ROSSTAT → Привязать категории → Обновить цены» —
  в журнале ожидаются постатейные items и текст ошибок ЕМИСС (см. критерий Fix-15).
- Ревизия `RosstatEmisProvider` на предмет повторяющихся HTTP-вызовов полной SDMX-выгрузки
  в цикле маппингов (кэш `cache-hours` уже есть — проверить, что один синк = одна выгрузка).
- Комментарии-ссылки на `IntegrationService` в `ProductInfoProvider`/`OpenFoodFactsProvider`/`AsyncConfig`
  обновить на `PriceSyncService`.

## Результаты

> План остаётся `IN_PROGRESS`: подзадачи 1–5 закрыты, но закрытие плана по AGENTS §2
> требует факта «коммит + зелёный гейт». Изменения не коммитились (решение владельца),
> CI-ран нет, а `UserPricesIntegrationTest`/`EconomicConsistencyTest` в песочнице не
> прогнаны (OOM-kill 137, воспроизведён на чистом HEAD). Закрывается после пуша и живой
> проверки цикла «ЕМИСС → привязка → Обновить цены» владельцем.

Дефект «Запуск #10 · PRICES → `LazyInitializationException: could not initialize proxy
[Ingredient#160] - no Session`» закрыт вместе со вторым, скрытым дефектом того же метода
(фиктивные `REQUIRES_NEW` при internal call через `this.`).

**Код (backend, 4 новых файла + 2 правки):**
- `service/PriceSyncService.java` (463) — оркестрация фонового синка, слепок маппингов
  `loadPriceSyncTargets` (`@Transactional(readOnly=true)`) → plain-record `PriceSyncTarget`,
  запись цен `applyMappingPricesInTx` (перезагрузка ингредиента/карточки по id внутри tx),
  `finalizeSyncLog` (статусы SUCCESS/PARTIAL/FAILED + details), `mappingSourceOrNull`;
  все короткие транзакции — через `self()` (`ObjectProvider`).
- `service/ExternalProductCardService.java` (92) — освежение карточки внешнего продукта (U11),
  `REQUIRES_NEW` + `findById` внутри транзакции.
- `service/UnitPriceConverter.java` (86) — пересчёт фасовки в цену за единицу (правила и
  округления не менялись).
- `service/SyncDetailsBuilder.java` (87) — сборка `SyncLog.details` (структура jsonb прежняя:
  `requestCount/items[]/errors[]/fatalError`).
- `repository/IngredientMappingRepository.java` — новый `findBySourceWithIngredientAndProduct`
  (`LEFT JOIN FETCH` ингредиента и карточки + `externalCode IS NOT NULL`); существующие запросы
  не тронуты.
- `service/IntegrationService.java` — 727 → 351 строка: остались подключения/поиск/привязки
  и тонкая `@Async`-граница `executePriceSync → priceSyncService.runPriceSync`.
- R10: логи старта/итогов/каждого маппинга/сбоев с `mappingId`, `externalCode`, `ingredientId`.

**Тесты (R1/R2, unit-слой по решению владельца):** 5 новых/перезаточенных файлов, 50 тестов
зоны изменения; red-проверка проведена дважды (до и после разделения оснастки): мутация
«читать маппинги вне транзакции и дёргать LAZY в цикле» → 15/21 падений с прод-текстом
`could not initialize proxy [com.provision.entity.Ingredient#160] - no Session`;
после возврата фикса — 145/145 в unit-батче зелёные.

**Контракты:** не менялись (202 + `{logId}`, форма `details`, правила статусов Fix-15,
`GET …/{provider}/mappings`) → mock-паритет, contract-тесты, фронт и миграции не затронуты
(новый номер миграции не понадобился).

**MD:** `PLAN.md` — раздел «Fix-16» + строка в «Обновлено»; `ARCHITECTURE.md` — транзакционная
модель фонового синка (2 правила для нового кода) и слоистость синка цен. Новых MD вне
белого списка нет, кроме этого плана (AGENTS §1/§2).

**Не закрыто:** интеграционный red-green на реальном Hibernate и живая проверка цикла
«ЕМИСС → привязка → Обновить цены» — в Backlog; `UserPricesIntegrationTest` /
`EconomicConsistencyTest` / `DockerStackSmokeTest` в песочнице не прогнаны (OOM-kill 137,
воспроизведён на чистом HEAD; нужен штатный раннер CI). Изменения НЕ закоммичены
(решение владельца) — лежат в рабочем дереве ветки `main`.
