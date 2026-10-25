# Architecture

## Overview

Provision — SPA + REST-бэкенд + PostgreSQL. Домен: каталог продуктов и блюд (глобальный, ведёт админ), походы пользователей (меню по дням/приёмам), расчёт закупок/стоимости/калорийности, интеграция Open Food Facts.

Ключевой инвариант (V20): **поход не ссылается на глобальный справочник** — приёмы пищи указывают на trip-scoped копии блюд и продуктов; справочник и цены свободно живут своей жизнью, план похода заморожен на момент планирования.

## Data Flow

### Режимы работы

| Режим | Источник данных | Когда |
|---|---|---|
| `real` | REST API бэкенда (`VITE_API_URL`, в Docker — same-origin через nginx `/api`) | продакшн-сборка, compose |
| `mock` | `src/api/mockServer.ts` (in-memory + localStorage) | офлайн-демо, component/e2e-тесты |
| `auto` | пинг `GET /api/v1/meta` (700 мс), фолбэк в mock + watchdog-возврат | дефолт dev-сборки |

Приоритет: переключатель UI (localStorage `apiMode`) → `VITE_API_MODE` → auto. Контракт mock↔real фиксируют contract-тесты (`npm run test:contract`, nightly parity). **Известное отклонение:** mock-`summary/shopping` пока отдаёт фикстуру FIX-1, а не расчёт из meals (PLAN P2) — новые эндпоинты так не делать.

### Слои данных

```
React-страницы ── ApiClient (fetch + refresh single-flight + ProblemDetail-ошибки)
   │  real: /api/v1/**          mock: mockServer (те же роуты и формы ответов)
   ▼
Spring MVC controllers (DTO records, Bean Validation, RFC7807-подобные ErrorResponse)
   ▼
Services (Transactional; ownership-проверки trip.user == principal)
   ▼
Spring Data JPA repositories (@Query JOIN FETCH / DISTINCT ON; Specifications для продуктов)
   ▼
PostgreSQL 15 + Flyway V1–V20 (без.hand-right схем: ddl-auto=validate)
```

Правки состава похода (V19) и снепшоты (V20) применяются в расчётном конвейере `SummaryService.computeShopping` (единая @Transactional-точка для shopping / by-days / person / kcal, без self-invocation и N+1).

## Core Calculations

### Калорийность (CR-1)

Только из продуктов: `kcal(порция) = Σ kcal_per_100g × граммы / 100 / base_servings`, где граммы = `amount×1000` (KG/L) или `amount×piece_weight_g` (PCS/PACK). Колонка `recipes.calories_per_serving` — deprecated legacy. Ккал приёма = порция × effectivePeople; ккал/чел/день = Σ приёмов дня / people дня.

### Люди и количества

`effectivePeople = meal.peopleOverride ?: day.peopleOverride ?: trip.defaultPeople`.
Количество ингредиента на приём = `recipe_amount / base_servings × effectivePeople` (scale 3, HALF_UP), с применением правок состава V19: `removed` исключает строку, `added` добавляет `amount_per_serving × effectivePeople`, substitution переносит количество `from → to × ratio`.

### Закупки и упаковки

Агрегат по ингредиенту: сумма по приёмам дня (by-days) и по дням (shopping). Упаковки: при `round_to_packs` и `pack_size`: `packsToBuy = ceil(total/pack_size)`, `buyAmount = packs×pack_size`, `leftover = buyAmount − total`.

### Стоимость (план/факт)

- **План по дням:** `qty_day × plannedUnitPrice(ingredient, day)` — цена = последняя с `effective_from ≤ date` (price-series кэш, DISTINCT ON-запросы).
- **План похода (строка):** `Σ по дням` (баг «цена endDate» закрыт PR #44–46); `plannedUnitPrice` строки = средневзвешенная `plannedCost/qty` (scale 2).
- **Факт:** `actualUnitPrice = trip_price_override ?: plannedUnitPrice`; `actualCost = qty × actualUnitPrice`. Оверрайд ставится из чека (`PUT /trips/{id}/price-overrides/{ingredientId}`) и действует на весь поход.
- **Снепшот (V20):** у продуктов-копий одна строка цены, замороженная при создании копии → правки глобальных цен план похода не меняют.
- `deltaPercent = (actual−planned)/planned×100` (scale 2; planned=0 → null). Итоги = сумма округлённых строк.

### Эталон округлений

| Величина | Scale | Режим |
|---|---|---|
| количества (приём, агрегаты) | 3 | HALF_UP |
| деньги строки и итоги | 2 | HALF_UP |
| unit price в ответах | 2 | HALF_UP |
| packs/buy/leftover | 3 (packs — int) | CEIL для packs |
| ккал | 0 | HALF_UP |
| вывод UI | итоги — `formatRub` (целые ₽); ₽/ед — 2 знака; количества — `humanize` (г/кг/мл/л/шт/уп) | — |

Клиент НЕ пересчитывает деньги/ккал (только форматирование); источник — ответы `/summary/*` (задача T6 переводит оставшиеся клиентские расчёты).

## Изоляция каталога похода (V20, снепшоты)

Приём пищи похода ссылается НЕ на глобальный справочник, а на trip-scoped копию: у `recipes` и `ingredients` есть `trip_id` (NULL = глобальный справочник) и `snapshot_of` (оригинал; ON DELETE SET NULL). Копия создаётся при добавлении приёма пищи (`TripCatalogSnapshotService.snapshotRecipeForTrip`): рецепт + задействованные продукты (по разу на поход) + одна актуальная строка цены на продукт-копию — план похода замораживается на момент планирования.

Следствия:
- админ может удалять/менять глобальные блюда и продукты, не ломая спланированные походы;
- правки глобальных цен не меняют план похода (факт — через `trip_price_overrides`);
- каталожные эндпоинты (`GET /recipes`, `GET /admin/products`, `GET /prices`) отдают только глобальные записи (`trip_id IS NULL`);
- страницы похода берут блюда через `GET /trips/{id}/recipes`, цены — через `GET /trips/{id}/prices` (trip-scoped срезы; fallback на глобальные для походов без снепшотов, созданных до V20);
- уникальность имени продукта (`name_norm`, `unit`) — partial-индекс только по глобальным.

Расчётное ядро (SummaryService) не изменилось: копии лежат в тех же таблицах и читаются теми же запросами по id ингредиентов похода.

Бэкфил: миграция V20 перевела существовавшие походы на снепшоты (temp-таблицы соответствий, перепривязка overrides/exclusions/substitutions). Повторный прогон миграции безопасен (IF NOT EXISTS + DROP temp-таблиц в начале).

## Contract Frontend ↔ Backend

### DTO контракты

- Ошибки: `{type,title,status,detail,instance,errors[],usedIn[]}` (RFC7807-подобные); коды конфликтов машиночитаемые: `DUPLICATE_PRODUCT`, `PRODUCT_IN_USE`, `DUPLICATE_PRICE_DATE`, `RECIPE_IN_USE` (исторический, для рецептов теперь недостижим через походы), `SYNC_ALREADY_RUNNING`.
- `RecipeResponse.ingredients[]`: `{ingredientId, ingredientName, unit, unitLabel, amount}` (без вложенного объекта ингредиента).
- `ShoppingItemResponse`: план/факт пары + `packSize/packsToBuy/buyAmount/leftoverAmount/substitutedFrom`.
- V20-поля: `tripId`, `snapshotOf` у рецептов/продуктов (копии не попадают в каталожные списки).
- Пагинация продуктов: Spring Page (`content/page/size/totalElements/...`); mock повторяет форму.

### Формат дат

ISO: `YYYY-MM-DD` (date-only) и ISO-8601 datetime в UTC-локалях БД (`TIMESTAMP WITHOUT TZ` — соглашение: серверное время; миграция на TIMESTAMPTZ — в P2).

### Формат денег

`NUMERIC(10,2)` RUB в БД; в JSON — number с 2 знаками; отображение — `formatRub` (целые ₽) для итогов.

### Новые/изменённые эндпоинты эпохи V19–V20

```
GET  /api/v1/trips/{id}/recipes         trip-scoped копии блюд (состав для меню/расчётов)
GET  /api/v1/trips/{id}/prices          trip-scoped срезы цен (fallback: глобальные, если копий нет)
GET  /api/v1/prices                     глобальные latest-срезы (все аутентифицированные)
POST/PUT/DELETE /api/v1/admin/recipes[/{id}]   ADMIN CRUD блюд с составом
GET/POST /api/v1/trips/{id}/shopping-exclusions, DELETE .../{ingredientId}   исключения строк закупки (V19)
GET/POST /api/v1/trips/{id}/substitutions/ingredient-edits, DELETE .../ingredient-edits/{editId}   правки состава приёма (added/removed/amount_per_serving, V19)
GET/POST/DELETE /api/v1/trips/{id}/substitutions[/{substitutionId}]   замены from→to (ratio)
PUT/DELETE /api/v1/trips/{id}/price-overrides/{ingId}    факт-цены (чеки)
GET  /api/v1/trips/{id}/summary/{menu|shopping|shopping/by-days|person}
```

## Key Components

### Backend

- `SummaryService.computeShopping` — единый расчётный конвейер (shopping/by-days/person/kcal), price-series кэш, пакетные загрузки (JOIN FETCH / DISTINCT ON / IN-батчи).
- `TripCatalogSnapshotService` — copy-on-write снепшоты (V20).
- `TripIngredientEditService`, `TripShoppingExclusionService` — правки состава/исключения (V19).
- `PriceResolutionService` — actual = override ?: planned.
- `SecurityConfig` + `JwtService`/`JwtAuthenticationFilter` — stateless JWT, CORS из ENV, fail-fast секрета (`JwtProperties.validate`).
- `DevDataInitializer` / `DevTripsInitializer` — демо-пользователи и демо-походы (profile `dev` + `SEED_DEMO_USERS=true`), демо-походы создаются через снепшот-сервис.
- `GlobalExceptionHandler` — коды конфликтов и field-errors.

### Frontend

- `api/client.ts` — режимы, refresh single-flight, `auth:session-lost`; `api/mockServer.ts` — mock-паритет роутов.
- `TripDetailPage` (5 вкладок) + `PriceOverridesTab` (чеки план/факт); `RecipeEditorModal` (админ-редактор блюда с составом); `ProductsPage` (CRUD + цена срезу); `CustomSelect/NumberField/DateRange/DatePicker` (контракты CR-3/CR-4).
- Дизайн-система «Провиант»: токены в `src/index.css`, design-pack в `provisions/` (источник правды дизайна; миграция — DESIGN_MIGRATION.md, ведётся отдельно).

## Security

- JWT: access 1 ч / refresh 7 д, refresh в БД хэшем с ротацией; logout удаляет токен; fail-fast при коротком/пустом секрете.
- Ownership: все trip-эндпоинты фильтруют `trip.user = principal` (404 на чужое); ADMIN-зона под `@PreAuthorize`.
- Профили: `dev` (DEBUG, Swagger, демо-сид) / `prod` (WARN/INFO, Swagger off, ошибки без detail, actuator health+info).
- CORS: whitelist из ENV, `allowCredentials=false` (токен в заголовке).
- Открытые задачи (PLAN P1): rate limiting `/auth/*`, security-заголовки и gzip в nginx, refresh в httpOnly-cookie (пока localStorage — XSS-риск зафиксирован), fail-fast `POSTGRES_PASSWORD`, backup-процедура.

## Database

- PostgreSQL 15, Flyway V1–V20. Пропуски номеров осознанные: V9 не создавалась, V14/V15 удалены из истории дерева (урок: применённые миграции НЕ удалять и НЕ править; только новые номера; в существующих БД демо-юзеры V14/V15 могли остаться — cleanup-запрос в README).
- Снепшоты: `recipes.trip_id/snapshot_of`, `ingredients.trip_id/snapshot_of`; partial unique `(name_norm, unit) WHERE trip_id IS NULL`; копии создаются с `code = NULL`.
- История цен: `ingredient_prices` UNIQUE(ingredient_id, effective_from); сид V13/V17 генерирует 24 мес. сезонного дрейфа детерминированно.
- Гигиена: pack репозитория ~112 МБ из-за исторического коммита `node_modules` — переписывание истории в PLAN P1.

## Testing Strategy

| Слой | Инструмент | Гейт |
|---|---|---|
| Unit backend | JUnit5+AssertJ+Mockito | `mvn test` (CI blocking) |
| Integration backend | MockMvc + Testcontainers ИЛИ LocalPgFallback (initdb без Docker) | там же; **baseline-красный: `EconomicConsistencyTest` (PLAN CI-1)** |
| Unit/component frontend | vitest + RTL | `npm run test` (CI blocking) |
| Coverage | v8, per-file lines ≥80% на зоне изменения (список include в vitest.config) | `npm run test:coverage` локально (R5) |
| Types/lint | `tsc --noEmit`, eslint | CI blocking (typecheck добавлен в T0) |
| Contract mock↔real | vitest `test:contract` c `CONTRACT_TARGET` | nightly parity (non-blocking) |
| E2E mock | Playwright (webServer vite) | nightly + non-blocking на PR |
| E2e real | Playwright против compose-стека (`E2E_BASE_URL`) | nightly blocking на schedule (триаж CI-3) |
| Docker stack | compose up + smoke `/meta` + nginx-прокси | CI blocking (красный, CI-2) |

Правила: red-green для каждого фикса (R1), тест того слоя, где изменение (R2), фича без теста не готова (R3), `@Disabled` только с TODO и ссылкой (R4).

## Deployment (Docker Compose)

`docker compose up --build`: postgres (healthcheck pg_isready, порт только 127.0.0.1) → backend (healthcheck wget /meta, JWT_SECRET обязателен, profile по умолчанию `dev`) → frontend (nginx: SPA + прокси `/api`). Прод-сценарий: `SPRING_PROFILES_ACTIVE=prod`, `SEED_DEMO_USERS=false`, свой `POSTGRES_PASSWORD`, образы за реестром (задача P1: публикация в ghcr + стенд).
