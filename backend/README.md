# Provision Backend

Бэкенд системы планирования питания для походов: каталог, походы, расчёты закупок/стоимости/калорийности, интеграция Open Food Facts, изоляция данных похода через снепшоты каталога (V20).

## Технологический стек

- Java 17 (target — `pom.xml <java.version>`), Spring Boot 3.2.5
- Spring Data JPA + Hibernate (`ddl-auto=validate`), PostgreSQL 15
- Spring Security: stateless JWT (access 1 ч / refresh 7 д с ротацией, хэш refresh в БД), CORS из ENV, fail-fast `JWT_SECRET`
- Flyway V1–V29 (apply at startup)
- springdoc-openapi (Swagger в profile `dev`)
- Lombok; маппинг DTO ручной (record'ы); зависимость MapStruct присутствует, но не используется — к удалению (PLAN P1)
- Тесты: JUnit 5 + AssertJ + Mockito + MockMvc; Testcontainers ИЛИ LocalPgFallback (initdb локального PostgreSQL, работает в CI без Docker)

## Структура проекта

```
backend/
├── src/main/java/com/provision/
│   ├── config/          # SecurityConfig, JwtProperties, AsyncConfig, Dev*Initializer (profile dev)
│   ├── controller/      # REST-контроллеры (DTO records, Bean Validation)
│   ├── dto/             # request/response-контракты (в т.ч. summary/*, error/*)
│   ├── entity/          # JPA-сущности (recipes/ingredients c trip_id/snapshot_of — V20)
│   ├── exception/       # доменные исключения + GlobalExceptionHandler (RFC7807-подобные ответы)
│   ├── integration/     # RosstatEmisProvider (ЕМИСС/fedstat.ru: Struts-токен, SDMX-парсер,
│   │                    #   диагностика 302/403/503), EmisDataSource, EmisSnapshot
│   ├── repository/      # Spring Data JPA (@Query JOIN FETCH / DISTINCT ON) + Specifications
│   ├── security/        # JwtService, JwtAuthenticationFilter
│   ├── service/         # SummaryService.computeShopping, TripCatalogSnapshotService,
│   │                    # TripIngredientEditService, TripShoppingExclusionService, PriceResolutionService,
│   │                    # Emis* (MirrorService/CatalogService/PriceApplier/Unit), PriceSyncService...
│   └── specification/   # ProductSpecifications (фильтры продуктов, isGlobal)
├── src/main/resources/
│   ├── db/migration/    # Flyway V1–V29 (применённые не правим!)
│   ├── application.yml  # базовый (INFO)
│   ├── application-dev.yml / application-prod.yml
└── src/test/            # unit + integration (@ContainerSuite / LocalPgFallback) + smoke
```

## Запуск

### Через Docker Compose (рекомендуется)

Compose-файл — в корне репозитория: `docker compose up --build` (postgres + backend + frontend). Бэкенд отдельно из корня: `docker compose up --build backend`.

### Локально (без Docker)

1. PostgreSQL 15: создайте БД `provision` (или используйте любую, поправив ENV).
2. Экспортируйте переменные:

```bash
export JWT_SECRET=$(openssl rand -base64 48)          # обязателен, иначе fail-fast
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/provision
export SPRING_DATASOURCE_USERNAME=provision
export SPRING_DATASOURCE_PASSWORD=provision123
export SPRING_PROFILES_ACTIVE=dev                     # dev: DEBUG-логи + Swagger + демо-сид
export SEED_DEMO_USERS=true                           # демо-пользователи и демо-походы (dev only)
mvn spring-boot:run
```

Swagger: http://localhost:8080/swagger-ui.html (dev). Health: `GET /api/v1/meta`.

## API Endpoints (основные)

### Аутентификация
- `POST /api/v1/auth/register|login|refresh|logout`, `GET /api/v1/auth/me`

### Походы (владелец)
- `GET|POST /api/v1/trips`, `GET|PUT|DELETE /api/v1/trips/{id}`
- `PUT /api/v1/trips/{tripId}/days/{dayId}`; `POST|PUT|DELETE .../days/{dayId}/meals[/{mealId}]`
  — `POST .../meals` создаёт **снепшот** блюда и задействованных продуктов для похода (V20)

### Данные похода (владелец)
- `GET /api/v1/trips/{id}/recipes` — trip-scoped копии блюд с составом (V20)
- `GET /api/v1/trips/{id}/prices` — trip-scoped срезы цен (замороженный план; fallback на глобальные, если копий нет)
- `GET|PUT|DELETE /api/v1/trips/{id}/price-overrides/{ingredientId}` — факт-цены (чеки)
- `GET|POST /api/v1/trips/{id}/shopping-exclusions`, `DELETE .../{ingredientId}` — исключения строк закупки (V19)
- `GET|POST /api/v1/trips/{id}/substitutions/ingredient-edits`, `DELETE .../ingredient-edits/{editId}` — правки состава приёма: добавить/исключить ингредиент (`added/removed/amount_per_serving`, V19)
- `GET|POST /api/v1/trips/{id}/substitutions`, `DELETE .../{substitutionId}` — замены ингредиента from→to с `ratio`
- `GET /api/v1/trips/{id}/summary/menu|shopping|shopping/by-days|person` — расчётные сводки
- `GET|PUT /api/v1/trips/{id}/meals/{mealId}/composition` — состав приёма: серверное масштабирование + атомарный batch-диф правок (V19-хранилище, спека FORM-meal-composition)

### Каталог (все аутентифицированные — чтение; глобальные записи, `trip_id IS NULL`)
- `GET /api/v1/recipes[/{id}]` (фильтры mealType/category/cookMinutes/search), `GET /api/v1/prices`, `GET /api/v1/product-categories`

### Админка (ADMIN)
- Продукты: `GET|POST /api/v1/admin/products[/{id}]`, `GET /api/v1/admin/products/paginated`, `check-name`; алиас `/admin/ingredients`
- Цены: `GET /api/v1/admin/ingredient-prices/ingredient/{id}`, `POST /api/v1/admin/ingredient-prices`
- Блюда: `POST|PUT|DELETE /api/v1/admin/recipes[/{id}]` (состав — в теле запроса)
- Интеграции (единственный провайдер — `ROSSTAT`): `GET /api/v1/admin/integrations`, `POST .../{provider}/connect|disconnect`, `POST .../{provider}/sync/prices` (202 `{logId}`), `POST .../{provider}/upload` (multipart-поле `file` — ручная загрузка SDMX-выгрузки ЕМИСС, 202 `{logId}`), `GET .../sync-logs`
- ЕМИСС (локальная копия): `GET /api/v1/admin/emis/products?query=&limit=` — поиск позиций справочника для привязки продукта (`EmisProductDto` с последней ценой и периодом)
- Staging: `GET|POST /api/v1/admin/staging`, `POST .../{id}/approve|reject`
- `GET /api/v1/admin/sync-logs`, `GET /api/v1/admin/sync-logs/kpi`

## Тесты

```bash
JWT_SECRET=<32+ символов> mvn -B test                 # весь сьют
mvn test -Dtest='*IntegrationTest'                    # интеграционные
mvn test -Dtest=SnapshotIsolationIntegrationTest      # изоляция снепшотов (V20)
```

- Интеграционные сьюты помечены `@ContainerSuite`: при наличии Docker — Testcontainers, иначе LocalPgFallback (initdb системного PostgreSQL 15; в CI ставится пакет postgresql-15/PGDG).
- TestDataIsolation пересоздаёт схему каждого сьюта (drop + flyway migrate) — миграции обязаны быть повторо-безопасными.
- **Baseline-красный:** `EconomicConsistencyTest` (несовместим с контрактом ProductRequest и ходит в голый localhost:5432) — задача CI-1 в PLAN.md; не «чинится» попутно и не маскируется.

## Бизнес-правила

1. **Люди:** `meal.peopleOverride → day.peopleOverride → trip.defaultPeople`.
2. **Количества:** `recipe_amount / base_servings × effectivePeople` (scale 3, HALF_UP); правки состава V19: `removed` исключает, `added` добавляет `amount_per_serving × people`, substitution переносит `× ratio`.
3. **Цены:** план = последняя цена с `effective_from ≤ дата дня`; план строки похода = Σ оценок по дням (не endDate!); факт = `trip_price_override ?: план`; у снепшот-копий цена заморожена при создании.
4. **Упаковки:** `round_to_packs` → `packsToBuy = ceil(total/pack_size)`, `buyAmount`, `leftover`.
5. **Ккал (CR-1):** только из `kcal_per_100g` продуктов (PCS/PACK — через `piece_weight_g`); `recipes.calories_per_serving` — deprecated.
6. **Конфликты:** продукт/рецепт защищены usedIn-проверками **внутри глобального каталога**; походы их не блокируют (держат копии, V20).
7. **Изоляция:** пользователь видит только свои походы (ownership-фильтры, 404 на чужое); ADMIN-зона под `@PreAuthorize`.
8. **Округления и формулы** — эталон в `ARCHITECTURE.md` («Эталон округлений», «Core Calculations»).
9. **Состав приёма**: RECIPE/SCALED/EXTRA/EXCLUDED + замены хранятся в `trip_ingredient_substitutions` (SCALE = «замена на себя» с ratio; EXCLUDE = removed; EXTRA = added); порядок в конвейере: SCALE → people → EXCLUDE → EXTRA → substitutions. Девиация до задачи R5: EXTRA трактуется конвейером как per-serving (спека — абсолют на приём).
10. **Ручные позиции закупки** (`trip_manual_items`, V22) реализованы: `TripManualItemController` + учёт в `SummaryService.computeShopping` (позиция без продукта берётся по введённой цене).

## Миграции

Flyway, `src/main/resources/db/migration`, нумерация V1–V29 без ретроспективных правок:

- пропуски номеров осознанные: V9 не создавалась; V14/V15 (сид демо-юзеров) удалены из дерева **до** широкого применения и заменены `DevDataInitializer`/`DevTripsInitializer` (profile `dev` + `SEED_DEMO_USERS`); в старых БД могли остаться демо-юзеры — cleanup-запрос в корне README;
- V17/V18 — сид-каталог (204 продукта / 201 блюдо) с ценами и 24-месячной историей;
- V19 — правки состава приёма (`added/removed/amount_per_serving`) и `trip_shopping_exclusions`;
- V20 — снепшоты каталога (`trip_id`, `snapshot_of`, partial-unique имён продуктов) + бэкфил существующих походов; повторный прогон безопасен;
- V21–V23 — дневные исключения закупки, `trip_manual_items` (V22), day-scope исключений;
- V24/V25 — интеграция Росстата (строка `integrations`, source `ROSSTAT`) и статус `PARTIAL` в CHECK `sync_logs.status`;
- V26 — локальная копия ЕМИСС: `emis_products`, `emis_prices`, `ingredients.emis_code` (без FK — привязка «софт»);
- V27 — сид из реальной выгрузки владельца: 885 позиций справочника и 2260 ценовых точек (регион `643004.АГ`, 2026); `ON CONFLICT DO NOTHING`, повторный прогон безопасен;
- V28 — привязка 187 продуктов к позициям ЕМИСС, 7 переименований под номенклатуру, демонтаж legacy: `ingredient_mappings`/`external_products` дропнуты, `source='OFF'` вычищен из CHECK-ов и данных (рецепты → `MANUAL`, цены → `API`).
- V29 — решения владельца по единицам и фасовке: «Туалетная бумага, 4 рулона» → «Бумага туалетная, рулон» (÷4), «Влажные салфетки, упаковка 100 шт» → «Салфетки влажные, упаковка 20 шт.» (÷5), «Спички влагозащищённые (20 шт)» → «Спички, коробок» (÷20) с пересчётом `piece_weight_g` и истории цен; новые привязки `antiseptic`→8016, `sunscreen`→5311, `toilet_paper`→6502, `wipes_wet`→6505; `gas_canister`/`soy_sauce`/`vinegar` явно без привязки. Правило «плотность ≈ 1» (MASS↔VOLUME, `piece_weight_g` как мл) — в `EmisUnit.pricePerUnit`, не в схеме.

Правила для новых миграций — `AGENTS.md` раздел 8.
