# Plan: Полное ревью приложения meal-provisioning-ai

Status: IN_PROGRESS
Created: 2026-10-29
Closed: _не заполнено_

## Цель

Провести системное ревью приложения meal-provisioning-ai (React + TypeScript SPA + Spring Boot 3.2.5 REST-DTO + PostgreSQL 15) по всем направлениям:

- Соответствие правилам проектирования (AGENTS.md §13 R1–R10, §14 системный подход)
- Соответствие принципам SOLID
- Узкие места масштабирования
- Применимые практики и технологии улучшения
- Дыры в безопасности
- Все некрасивые места (code smells, maintainability)

Результат — подробный отчёт, оформленный как задача в `plans/` с произвольным количеством подзадач (нарушение ограничения в 10 подзадач — сознательное, разрешено владельцем).

## Контекст

- Стек: SPA (React + TypeScript, Vite, vitest, Playwright) + REST-DTO (Spring Boot 3.2.5, Java 17) + PostgreSQL 15
- Auth: JWT HS256 (min 32 bytes secret, SHA-256 fallback для коротких ключей), BCrypt, stateless sessions, CSRF disabled
- Схема: Flyway (baseline-on-migrate), миграции V3…V29; применённые миграции править нельзя
- V20: trip-scoped рецепты/ингредиенты (trip_id NULL = глобальные, snapshot_of), SDMX streaming StAX, EmisUnit conversion, price-overrides
- Self-injection через ObjectProvider для @Async и REQUIRES_NEW
- KB-1…KB-8 закрыты 29.10.2026, KB-9/KB-10 остаются открытыми (долг владельца)

См. `ARCHITECTURE.md`, `AGENTS.md` §2/§13/§14, `plans/knownbugs.md`, `plans/backlog.md`.

## Подзадачи

### 1. Security: hardcoded admin password
- ID: 1
- Название: Устранить хардкоded пароль админа в DevDataInitializer
- Файлы: `backend/src/main/java/com/provision/config/DevDataInitializer.java`
- Зависимости: —
- Действия: заменить `provision123` на чтение из env (`ADMIN_PASSWORD`) с фолбэком на генерацию случайного пароля при старте в dev-профиле; логировать сгенерированный пароль в dev; вынести в `JwtProperties`-подобные `DevProperties`.
- Критерий приёмки: нет статического пароля в исходниках; `grep -r "provision123"` чист; dev-сценарий стаёт с генерацией пароля.
- Статус: [ ] TODO
- Приоритет: CRITICAL (KB-0-new)

### 2. Security: weak seeded password hashing
- ID: 2
- Название: Сид-парли не через BCrypt (AuthService.register)
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: 1
- Действия: проверить, что `register` хэширует пароль через BCrypt (не plaintext); если сиды создаются минуя `register`, добавить BCrypt.
- Критерий приёмки: все passwordHash в БД — BCrypt хэши (префикс `$2a$`/`$2b$`).
- Статус: [ ] TODO
- Приоритет: HIGH (KB-0-new)

### 3. Security: unsalted SHA-256 refresh token hashes
- ID: 3
- Название: Refresh-токены хэшируются unsalted SHA-256
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: 2
- Действия: заменить `hashToken` (SHA-256 hex) на BCrypt или HMAC-SHA256 со статическим salt из env; добавить защиту от rainbow-tables.
- Критерий приёмки: refresh-хэши не обратно обратимы через rainbow table; salt из конфига.
- Статус: [ ] TODO
- Приоритет: MEDIUM (KB-0-new)

### 4. Security: refresh token race condition
- ID: 4
- Название: Race condition в refresh-генерации (AuthService.refreshTokens)
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: 3
- Действия: добавить синхронизацию по UUID refresh-токена или optimistic lock; проверить, что старый токен инвалидируется до выдачи нового.
- Критерий приёмки: при параллельных refresh-запросах не выдаётся два валидных токена для одного UUID; тест на race.
- Статус: [ ] TODO
- Приоритет: MEDIUM (KB-0-new)

### 5. Security: JWT no issuer/audience/typ validation
- ID: 5
- Название: JWT не валидируется issuer/audience/typ
- Файлы: `backend/src/main/java/com/provision/security/JwtService.java`, `JwtAuthenticationFilter.java`
- Зависимости: —
- Действия: добавить проверку `iss`, `aud`, `typ` (JWT); проверить clock skew.
- Критерий приёмки: фейковый JWT с любым `sub` отклоняется; валидация `typ=access`/`refresh`.
- Статус: [ ] TODO
- Приоритет: MEDIUM (KB-0-new)

### 6. Security: weak key fallback (SHA-256 for short secret)
- ID: 6
- Название: Fallback SHA-256 для коротного секрета в JwtService
- Файлы: `backend/src/main/java/com/provision/security/JwtService.java`, `JwtProperties.java`
- Зависимости: 5
- Действия: убрать fallback SHA-256 для ключей <32 байт; ужесточить `JwtProperties.validate()` (уже ≥32 байта); логировать предупреждение при коротком ключе вместо автоматического fallback.
- Критерий приёмки: короткий секрет → fail-fast при старте, без silent fallback.
- Статус: [ ] TODO
- Приоритет: MEDIUM (KB-0-new)

### 7. Security: silent catch in JWT filter
- ID: 7
- Название: Silent catch в JwtAuthenticationFilter (log.warn, filter продолжается)
- Файлы: `backend/src/main/java/com/provision/security/JwtAuthenticationFilter.java`
- Зависимости: 5
- Действия: при ошибке парсинга JWT → отключить аутентификацию (clear context), не продолжать как anonymous; логировать error, не warn.
- Критерий приёмки: битый/просроченный JWT → 401, не доступ как anonymous.
- Статус: [ ] TODO
- Приоритет: MEDIUM (KB-0-new)

### 8. Security: user enumeration in login
- ID: 8
- Название: User enumeration через сообщения логина (AuthService.login)
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: —
- Действия: unify message для "user not found" / "wrong password" / "account locked"; единый текст "Invalid credentials".
- Критерий приёмки: время ответа и текст ошибки не зависят от существования пользователя; тест на timing.
- Статус: [ ] TODO
- Приоритет: LOW (KB-0-new)

### 9. Security: CORS and credentials
- ID: 9
- Название: CORS setAllowCredentials(false) — проверить согласованность
- Файлы: `backend/src/main/java/com/provision/config/SecurityConfig.java`
- Зависимости: —
- Действия: подтвердить, что credentials не нужны (токен в Authorization-заголовке, не cookie); закомментировать решение.
- Критерий приёмки: CORS-конфиг задокументирован; нет cookie-based auth.
- Статус: [ ] TODO
- Приоритет: LOW (KB-0-new)

### 10. Security: swagger/meta public endpoints
- ID: 10
- Название: Публичные /v3/api-docs и /api/v1/meta без аутентификации
- Файлы: `backend/src/main/java/com/provision/config/SecurityConfig.java`, `MetaController.java`
- Зависимости: —
- Действия: в prod-профиле закрывать swagger; `/meta` — проверять, что нет sensitive info (версии, db status).
- Критерий приёмки: swagger закрыт в prod; `/meta` не утекает внутренняя информация.
- Статус: [ ] TODO
- Приоритет: LOW (KB-0-new)

### 11. SOLID: MealCompositionService violates Single Responsibility
- ID: 11
- Название: MealCompositionService (~570 строк) нарушает SRP
- Файлы: `backend/src/main/java/com/provision/service/MealCompositionService.java`
- Зависимости: —
- Действия: декомпозиция на подсервисы: `CompositionCalculator` (kcal/вес/стоимость), `CompositionDiffEngine` (SCALE/EXTRA/EXCLUDE/SUBST), `TripScopedIdResolver`.
- Критерий приёмки: каждый подсервис ≤300 строк; каждый — покрыт unit-тестами; инвариант сумм сохранён.
- Статус: [ ] TODO
- Приоритет: MEDIUM (R8)

### 12. SOLID: SummaryService violates SRP and Large Class
- ID: 12
- Название: SummaryService (>50KB, >500 строк) нарушает SRP
- Файлы: `backend/src/main/java/com/provision/service/SummaryService.java`
- Зависимости: 11
- Действия: декомпозиция на `MealPlanCalculator`, `ShoppingListCalculator`, `DailySummaryCalculator`, `PerUserSummaryCalculator`.
- Критерий приёмки: каждый калькулятор — отдельный модуль; инвариант сумм by-days/shopping/person/kPI; R8 проходит.
- Статус: [ ] TODO
- Приоритет: MEDIUM (R8)

### 13. SOLID: PriceSyncService / IntegrationService overlap
- ID: 13
- Название: Дублирование логики синка между PriceSyncService и IntegrationService
- Файлы: `backend/src/main/java/com/provision/service/PriceSyncService.java`, `IntegrationService.java`
- Зависимости: —
- Действия: вынести общую оркестрацию в `SyncOrchestrator`; IntegrationService — только @Async граница; PriceSyncService — только применение.
- Критерий приёмки: нет дублирования startSyncLog/running-проверок; единый контракт статуса синка.
- Статус: [ ] TODO
- Приоритет: MEDIUM (SRP/OCP)

### 14. Scalability: N+1 queries in batch loads
- ID: 14
- Название: Потенциальные N+1 в ProductService/SummaryService batch-загрузках
- Файлы: `backend/src/main/java/com/provision/service/ProductService.java`, `SummaryService.java`, `IngredientPriceRepository.java`
- Зависимости: —
- Действия: аудит всех JPA-отношений на lazy-loading в транзакции; использовать JOIN FETCH / EntityGraph для критичных путей; проверить `default_batch_fetch_size=50` эффективность.
- Критерий приёмки: SQL-профиль batch-запросов показывает ≤3 запроса на страницу; тест на count queries.
- Статус: [ ] TODO
- Приоритет: MEDIUM (scalability)

### 15. Scalability: Async pool sizing and rejection
- ID: 15
- Название: AsyncConfig: no rejection policy, no keepAliveSeconds
- Файлы: `backend/src/main/java/com/provision/config/AsyncConfig.java`
- Зависимости: —
- Действия: добавить `ThreadPoolExecutor.CallerRunsPolicy` или `AbortPolicy` с метриками; `keepAliveSeconds` для warm-down; `setTaskDecorator` для MDC (trace-id).
- Критерий приёмки: при перегрузке очереди — предсказуемое поведение; метрики pool stats (active, completed, rejected); MDC trace-id в логах синка.
- Статус: [ ] TODO
- Приоритет: MEDIUM (scalability)

### 16. Scalability: Database indexing
- ID: 16
- Название: Аудит индексов на часто используемых фильтрах
- Файлы: миграции Flyway (новые), `IngredientPriceRepository.java` (CTE/DISTINCT ON)
- Зависимости: —
- Действия: проверить индексы на `emis_products(emis_code, trip_id IS NULL)`, `is_prices(ingredient_id, effective_from)`, `trip_days(trip_id, date)`; добавить недостающие.
- Критерий приёмки: EXPLAIN ANALYZE показывает index scan на ключевых запросах; нет seq scan на больших таблицах.
- Статус: [ ] TODO
- Приоритет: MEDIUM (scalability)

### 17. Scalability: Flyway migration sprawl
- ID: 17
- Название: 29 миграций (V3…V29) — аудит на консистентность
- Файлы: `backend/src/main/resources/db/migration/`
- Зависимости: —
- Действия: проверить, что нет отменённых/переименованных миграций; убедиться, что бэкфики safe (IF NOT EXISTS / ON CONFLICT); документировать V20/V26–V29.
- Критерий приёмки: `flyway info` показывает clean history; existing-DB прогон без ошибок; ретро-миграции безопасны.
- Статус: [ ] TODO
- Приоритет: LOW (maintainability)

### 18. Best practice: Metrics and observability
- ID: 18
- Название: Отсутствие Micrometer/Prometheus метрик
- Файлы: новые (инфраструктура), `AsyncConfig.java`, `PriceSyncService.java`
- Зависимости: 15
- Действия: добавить `management.endpoints.web.exposure.include=*`; метрики на синк (duration, success/fail, items processed); health check для DB + Redis (если есть).
- Критерий приёмки: `/actuator/metrics` доступен; кастомные метрики синка; алертинг на failed syncs.
- Статус: [ ] TODO
- Приоритет: MEDIUM (ops)

### 19. Best practice: Rate limiting and brute force protection
- ID: 19
- Название: Отсутствие rate limiting на auth-эндпоинтах
- Файлы: `backend/src/main/java/com/provision/config/SecurityConfig.java`, новые (filter)
- Зависимости: —
- Действия: добавить Spring Security brute-force protection (retry) или Guava rate limiter на `/api/v1/auth/register`, `/login`; store failed attempts in Redis.
- Критерий приёмки: >X failed attempts → 429/lock; тест на brute-force.
- Статус: [ ] TODO
- Приоритет: MEDIUM (security)

### 20. Best practice: Input validation completeness
- ID: 20
- Название: Аудит валидации входных данных (DTO)
- Файлы: DTO-классы, `ProductService.normalizeName/normalizeEmisCode`, `MealCompositionService`
- Зависимости: —
- Действия: проверить `@Valid` на всех контроллерах; `@Size`, `@Pattern` для emis_code, name; XSS-очистка для user-generated text (name, notes).
- Критерий приёмки: все DTO — с `@Valid`; emis_code → `@Pattern`; name → `@Size` + XSS-санитизация.
- Статус: [ ] TODO
- Приоритет: MEDIUM (security)

### 21. Code smell: Magic numbers in EmisUnit / weightOfGrams
- ID: 21
- Название: Magic numbers в конвертации единиц (KG/L×1000, PCS/PACK×piece_weight_g)
- Файлы: `backend/src/main/java/com/provision/service/MealCompositionService.java`, `EmisUnit.java`
- Зависимости: —
- Действия: вынести в `enum UnitFactor` с метод `toGrams(value)`; задокументировать PCS/PACK логику.
- Критерий приёмки: все конвертации — через enum; нет литералов 1000/100 в расчётах.
- Статус: [ ] TODO
- Приоритет: LOW (maintainability)

### 22. Code smell: resolveTripScopedId logic spread
- ID: 22
- Название: Логика resolveTripScopedId размазана по MealCompositionService
- Файлы: `backend/src/main/java/com/provision/service/MealCompositionService.java`
- Зависимости: 11
- Действия: вынести в `TripScopedIdResolver` с явной семантикой (global id vs snapshot id vs trip copy).
- Критерий приёмки: резолвер — отдельный модуль с unit-тестами на edge cases (null, foreign trip).
- Статус: [ ] TODO
- Приоритет: LOW (maintainability)

### 23. Code smell: self-injection pattern duplication
- ID: 23
- Название: Self-injection через ObjectProvider дублируется в PriceSyncService/IntegrationService
- Файлы: `backend/src/main/java/com/provision/service/PriceSyncService.java`, `IntegrationService.java`
- Зависимости: 13
- Действия: вынести в общий `SelfProxyHelper` или использовать `ApplicationContext`-паттерн единым образом.
- Критерий приёмки: единый паттерн self-injection; документирован почему (bypass proxy for @Async/REQUIRES_NEW).
- Статус: [ ] TODO
- Приоритет: LOW (maintainability)

### 24. Frontend: client.ts single-flight refresh complexity
- ID: 24
- Название: `src/api/client.ts` (567 строк) — single-flight refresh + mode resolution
- Файлы: `src/api/client.ts`
- Зависимости: —
- Действия: декомпозиция на `authInterceptor`, `modeResolver`, `problemDetailParser`; проверить race на refresh.
- Критерий приёмки: каждый interceptor — отдельный модуль; тесты на single-flight; R5 coverage.
- Статус: [ ] TODO
- Приоритет: MEDIUM (R8)

### 25. Frontend: mockServer.ts parity (2583 строки)
- ID: 25
- Название: `mockServer.ts` (2583 строки) — огромный моковый сервер
- Файлы: `src/api/mockServer.ts`
- Зависимости: —
- Действия: декомпозиция по ресурсам (`mockTrips.ts`, `mockPrices.ts`, `mockSync.ts`); проверить паритет с бэком (latest-price, snapshots, composition batch).
- Критерий приёмки: каждый ресурс — отдельный файл; contract-тесты mock vs backend; R8.
- Статус: [ ] TODO
- Приоритет: MEDIUM (R8, mock-паритет)

### 26. Frontend: TripDetailPage large component (1301 строки)
- ID: 26
- Название: `TripDetailPage.tsx` (1301 строки) — violates R8
- Файлы: `src/pages/TripDetailPage.tsx`
- Зависимости: —
- Действия: декомпозиция на `TripDaysList`, `TripMealCard`, `TripSummaryPanel`, `TripActions`.
- Критерий приёмки: каждый компонент ≤300 строк; R5 coverage; нет дублирования state.
- Статус: [ ] TODO
- Приоритет: MEDIUM (R8)

### 27. Testing: unit test gaps for Emis services
- ID: 27
- Название: Недостаток unit-тестов для EmisPriceApplier/EmisMirrorService (KB-9 долг)
- Файлы: `backend/src/test/java/com/provision/service/EmisPriceApplierTest.java`, `EmisMirrorServiceTest.java`
- Зависимости: 13
- Действия: написать unit-тесты на конвертацию единиц, UPSERT логику, ретеншен цен; закрыть BL-2/BL-3.
- Критерий приёмки: EmisPriceApplierTest green; EmisMirrorServiceTest green; R5.
- Статус: [ ] TODO
- Приоритет: MEDIUM (KB-9)

### 28. Testing: EconomicConsistencyTest invariant
- ID: 28
- Название: Инвариант сумм by-days/shopping/person/kPI (EconomicConsistencyTest)
- Файлы: `backend/src/test/java/com/provision/EconomicConsistencyTest.java`, `SummaryService.java`
- Зависимости: 12
- Действия: убедиться, что сумма by-days = сумма person = сумма shopping; инвариант в тесте.
- Критерий приёмки: EconomicConsistencyTest green; инвариант сумм проверен.
- Статус: [ ] TODO
- Приоритет: MEDIUM (baseline CI)

### 29. Documentation: ARCHITECTURE.md freshness
- ID: 29
- Название: Актуализация ARCHITECTURE.md (формулы, снепшоты)
- Файлы: `ARCHITECTURE.md`
- Зависимости: 11, 12
- Действия: проверить, что формулы EmisUnit, V20 снепшоты, diff-commit логики актуальны; обновить девиации composition.
- Критерий приёмки: ARCHITECTURE.md соответствует коду; формулы проверены.
- Статус: [ ] TODO
- Приоритет: LOW (maintainability)

### 30. Security: SQL injection in JPA Specifications
- ID: 30
- Название: Аудит JPA Specifications на SQL injection
- Файлы: `backend/src/main/java/com/provision/service/ProductService.java`, `SyncLogService.java`
- Зависимости: —
- Действия: проверить, что Specification используют parameterized queries (no string concatenation); `matchesQuery` на name.
- Критерий приёмки: все Specification — parameterized; тест на injection attempt.
- Статус: [ ] TODO
- Приоритет: LOW (security)

## CI

- Baseline-красные: `EconomicConsistencyTest` (если красный — см. план CI-1, если был).
- Contract-тесты: `CONTRACT_TARGET=mock npm run test:contract` — обязательны для затронутых эндпоинтов.
- E2E: `npm run test:e2e` — KB-16 (песочница не стартует), прогон в CI — BL-32.

## Known bugs

- KB-9 (тесты Emis, долг владельца): → BL-2/BL-3/подзадача 27.
- KB-10 (лимиты песочницы, боевой прогон к порталу ЕМИСС): остаётся как есть.
- KB-16 (e2e в песочнице не стартует): → BL-32.
- KB-14/KB-15 (хвосты мобильной задачи): остаются.

## Backlog

- BL-20 (боевой прогон синка к ЕМИСС): долг.
- BL-24 (документация SDMX): частично.
- BL-25…BL-32 (хвосты мобильной задачи, e2e).
- R8/R2/R2-долг: localStorage-хранилища правок (не расширять).

## Результаты

_Заполняется при закрытии._

---

## Сводка находок (из ревига, 29.10.2026)

### Security (22 findings)
- **CRITICAL**: hardcoded admin password `provision123` в `DevDataInitializer.java`.
- **HIGH**: seeded passwords могут не через BCrypt (нужна проверка `AuthService.register`).
- **MEDIUM**: unsalted SHA-256 refresh hashes; refresh race condition; no issuer/audience/typ JWT validation; weak key fallback (SHA-256); silent catch в filter.
- **LOW**: user enumeration; CORS/credentials; swagger/meta public; SQL injection risk (parameterized — проверить).

### SOLID / Design
- **SRP violations**: `MealCompositionService` (~570L), `SummaryService` (>50KB).
- **OCP/SRP**: дублирование синка между `PriceSyncService`/`IntegrationService`.
- **R8**: frontend `TripDetailPage` (1301L), `mockServer.ts` (2583L), `client.ts` (567L).

### Scalability
- N+1 в batch-загрузках (ProductService/SummaryService).
- Async pool: no rejection policy, no keepAliveSeconds, no MDC.
- Индексы: аудит на emis_products/is_prices/trip_days.
- Flyway: 29 миграций, аудит на консистентность.

### Best practices
- Отсутствие Micrometer/Prometheus метрик.
- Отсутствие rate limiting на auth.
- Валидация DTO: проверить `@Valid`, XSS-санитизация.

### Code smells
- Magic numbers в EmisUnit/weightOfGrams.
- resolveTripScopedId размазан.
- self-injection дублируется.

### Frontend
- client.ts: single-flight refresh complex.
- mockServer.ts: 2583 строки, паритет с бэком.
- TripDetailPage: 1301 строки, R8.

### Testing
- KB-9: unit-тесты для Emis (BL-2/BL-3).
- EconomicConsistencyTest: инвариант сумм.
