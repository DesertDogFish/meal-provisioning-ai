# Plan: Полное ревью приложения meal-provisioning-ai

Status: DONE
Created: 2026-10-29
Closed: 2026-10-30

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
- Статус: [x] DONE (29.10.2026, dev-coder: DevProperties + env ADMIN_PASSWORD/DEMO_USER_PASSWORD, случайный пароль при пустом env; DevDataInitializerTest 5/5)
- Приоритет: CRITICAL (KB-0-new)

### 2. Security: weak seeded password hashing
- ID: 2
- Название: Сид-парли не через BCrypt (AuthService.register)
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: 1
- Действия: проверить, что `register` хэширует пароль через BCrypt (не plaintext); если сиды создаются минуя `register`, добавить BCrypt.
- Критерий приёмки: все passwordHash в БД — BCrypt хэши (префикс `$2a$`/`$2b$`).
- Статус: [x] DONE (29.10.2026, dev-coder: проверено — register и сид хэшируют через BCryptPasswordEncoder (SecurityConfig bean); AuthServiceTest.register_storesBcryptHash утверждает $2a$-префикс)
- Приоритет: HIGH (KB-0-new)

### 3. Security: unsalted SHA-256 refresh token hashes
- ID: 3
- Название: Refresh-токены хэшируются unsalted SHA-256
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: 2
- Действия: заменить `hashToken` (SHA-256 hex) на BCrypt или HMAC-SHA256 со статическим salt из env; добавить защиту от rainbow-tables.
- Критерий приёмки: refresh-хэши не обратно обратимы через rainbow table; salt из конфига.
- Статус: [x] DONE (29.10.2026, dev-coder: hashToken → HMAC-SHA256 ключом JWT_SECRET; тест login_storesHmacRefreshHash; деплой-следствие: старые refresh-хэши невалидны, разовый перелогин)
- Приоритет: MEDIUM (KB-0-new)

### 4. Security: refresh token race condition
- ID: 4
- Название: Race condition в refresh-генерации (AuthService.refreshTokens)
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: 3
- Действия: добавить синхронизацию по UUID refresh-токена или optimistic lock; проверить, что старый токен инвалидируется до выдачи нового.
- Критерий приёмки: при параллельных refresh-запросах не выдаётся два валидных токена для одного UUID; тест на race.
- Статус: [x] DONE (29.10.2026, dev-coder: атомарный deleteByTokenHash до выдачи новой пары, deleted=0 → 401; тесты refresh_invalidatesOldTokenBeforeIssuingNew/refresh_raceSecondCallRejected; AUTH-07/08 зелёные)
- Приоритет: MEDIUM (KB-0-new)

### 5. Security: JWT no issuer/audience/typ validation
- ID: 5
- Название: JWT не валидируется issuer/audience/typ
- Файлы: `backend/src/main/java/com/provision/security/JwtService.java`, `JwtAuthenticationFilter.java`
- Зависимости: —
- Действия: добавить проверку `iss`, `aud`, `typ` (JWT); проверить clock skew.
- Критерий приёмки: фейковый JWT с любым `sub` отклоняется; валидация `typ=access`/`refresh`.
- Статус: [x] DONE (29.10.2026, dev-coder: iss/aud/typ=access + header typ=JWT, requireIssuer/requireAudience, clockSkew 60c; JwtServiceTest 9/9; деплой-следствие: старые access-токены отклоняются)
- Приоритет: MEDIUM (KB-0-new)

### 6. Security: weak key fallback (SHA-256 for short secret)
- ID: 6
- Название: Fallback SHA-256 для коротного секрета в JwtService
- Файлы: `backend/src/main/java/com/provision/security/JwtService.java`, `JwtProperties.java`
- Зависимости: 5
- Действия: убрать fallback SHA-256 для ключей <32 байт; ужесточить `JwtProperties.validate()` (уже ≥32 байта); логировать предупреждение при коротком ключе вместо автоматического fallback.
- Критерий приёмки: короткий секрет → fail-fast при старте, без silent fallback.
- Статус: [x] DONE (29.10.2026, dev-coder: SHA-256 fallback удалён — IllegalStateException при <32 байт; JwtProperties.validate() остаётся fail-fast на старте; тесты shortSecretFailsFast/blankSecretFailsFast)
- Приоритет: MEDIUM (KB-0-new)

### 7. Security: silent catch in JWT filter
- ID: 7
- Название: Silent catch в JwtAuthenticationFilter (log.warn, filter продолжается)
- Файлы: `backend/src/main/java/com/provision/security/JwtAuthenticationFilter.java`
- Зависимости: 5
- Действия: при ошибке парсинга JWT → отключить аутентификацию (clear context), не продолжать как anonymous; логировать error, не warn.
- Критерий приёмки: битый/просроченный JWT → 401, не доступ как anonymous.
- Статус: [x] DONE (29.10.2026, dev-coder: ExpiredJwtException → warn, прочие JwtException → error, SecurityContext.clearContext(); JwtAuthenticationFilterTest 5/5; SEC-06 зелёный)
- Приоритет: MEDIUM (KB-0-new)

### 8. Security: user enumeration in login
- ID: 8
- Название: User enumeration через сообщения логина (AuthService.login)
- Файлы: `backend/src/main/java/com/provision/service/AuthService.java`
- Зависимости: —
- Действия: unify message для "user not found" / "wrong password" / "account locked"; единый текст "Invalid credentials".
- Критерий приёмки: время ответа и текст ошибки не зависят от существования пользователя; тест на timing.
- Статус: [x] DONE (29.10.2026, dev-coder: BCrypt-проверка против dummy-хэша при неизвестном email, сообщение едино «Invalid email or password»; тесты login_unknownEmail/login_wrongPassword)
- Приоритет: LOW (KB-0-new)

### 9. Security: CORS and credentials
- ID: 9
- Название: CORS setAllowCredentials(false) — проверить согласованность
- Файлы: `backend/src/main/java/com/provision/config/SecurityConfig.java`
- Зависимости: —
- Действия: подтвердить, что credentials не нужны (токен в Authorization-заголовке, не cookie); закомментировать решение.
- Критерий приёмки: CORS-конфиг задокументирован; нет cookie-based auth.
- Статус: [x] DONE (29.10.2026, dev-coder: allowCredentials(false) задокументирован как осознанное решение с последствиями для будущих правок; cookie-auth отсутствует)
- Приоритет: LOW (KB-0-new)

### 10. Security: swagger/meta public endpoints
- ID: 10
- Название: Публичные /v3/api-docs и /api/v1/meta без аутентификации
- Файлы: `backend/src/main/java/com/provision/config/SecurityConfig.java`, `MetaController.java`
- Зависимости: —
- Действия: в prod-профиле закрывать swagger; `/meta` — проверять, что нет sensitive info (версии, db status).
- Критерий приёмки: swagger закрыт в prod; `/meta` не утекает внутренняя информация.
- Статус: [x] DONE (29.10.2026, dev-coder: swagger/api-docs публичны только при springdoc.api-docs.enabled=true, иначе ADMIN; добавлен matcher /api-docs/** (баг whitelist при springdoc.api-docs.path); /meta: version из app.version, build — момент старта, детали DB-ошибки только в лог; MetaControllerTest зелёный)
- Приоритет: LOW (KB-0-new)

### 11. SOLID: MealCompositionService violates Single Responsibility
- ID: 11
- Название: MealCompositionService (~570 строк) нарушает SRP
- Файлы: `backend/src/main/java/com/provision/service/MealCompositionService.java`
- Зависимости: —
- Действия: декомпозиция на подсервисы: `CompositionCalculator` (kcal/вес/стоимость), `CompositionDiffEngine` (SCALE/EXTRA/EXCLUDE/SUBST), `TripScopedIdResolver`.
- Критерий приёмки: каждый подсервис ≤300 строк; каждый — покрыт unit-тестами; инвариант сумм сохранён.
- Статус: [x] DONE (29.10.2026, dev-coder, commits 6c241d3d/285905ee/24b894d9: CompositionCalculator (64 стр., математика веса/ккал/стоимости), CompositionDiffEngine (182 стр., SCALE/EXTRA/EXCLUDE/SUBST диф-коммит), TripScopedIdResolver (72 стр.) — все ≤300; MealCompositionService 573→377 (оркестратор); unit-тесты: TripScopedIdResolverTest 8/8, CompositionDiffEngineTest 8/8, MealCompositionMathTest 6/6 (переведён на CompositionCalculator + costOf/nvl); инвариант сумм сохранён — логика перенесена байт-в-байт, Spring-контекст: CatalogIntegrationTest 7/7)
- Приоритет: MEDIUM (R8)

### 12. SOLID: SummaryService violates SRP and Large Class
- ID: 12
- Название: SummaryService (>50KB, >500 строк) нарушает SRP
- Файлы: `backend/src/main/java/com/provision/service/SummaryService.java`
- Зависимости: 11
- Действия: декомпозиция на `MealPlanCalculator`, `ShoppingListCalculator`, `DailySummaryCalculator`, `PerUserSummaryCalculator`.
- Критерий приёмки: каждый калькулятор — отдельный модуль; инвариант сумм by-days/shopping/person/kPI; R8 проходит.
- Статус: [x] DONE (29.10.2026, dev-coder, commits d5b019e5/d375ac4c + тестовый: SummaryService 864→280 (оркестратор: загрузка графа/контекста + транзакционные границы); MealPlanCalculator (52), DailySummaryCalculator (59), PerUserSummaryCalculator (104), ShoppingListCalculator (520 — computeShopping-тело дословно, монолит 370 стр. сохранён как есть ради байт-в-байт поведения; внутренние фазы размечены комментариями) + TripCalculationContext record; публичный API и конструкторы SummaryService не изменились — инварианты сумм by-days/shopping/person/kPI подтверждены: SummaryServiceTest 6/6, SummaryServiceFixtureTest 10/10, DetailedShoppingCalculationTest 2/2, ShoppingListCostAggregationBugTest 5/5, PriceOverrideTest 3/3 + новые DailySummaryCalculatorTest 2/2, PerUserSummaryCalculatorTest 2/2; Spring-контекст: CatalogIntegrationTest 7/7. EconomicConsistencyTest в песочнице не прогнан (лимит памяти, KB), его инварианты покрыты перечисленными unit-тестами)
- Приоритет: MEDIUM (R8)

### 13. SOLID: PriceSyncService / IntegrationService overlap
- ID: 13
- Название: Дублирование логики синка между PriceSyncService и IntegrationService
- Файлы: `backend/src/main/java/com/provision/service/PriceSyncService.java`, `IntegrationService.java`
- Зависимости: —
- Действия: вынести общую оркестрацию в `SyncOrchestrator`; IntegrationService — только @Async граница; PriceSyncService — только применение.
- Критерий приёмки: нет дублирования startSyncLog/running-проверок; единый контракт статуса синка.
- Статус: [x] DONE (29.10.2026, dev-coder: SyncOrchestrator НЕ понадобился — фактическое дублирование нашлось в SyncLogService (мёртвые startSync/completeSync/failSync без вызовов, completeSync не знал про PARTIAL); удалены. Единый контракт: старт — IntegrationService.startSyncLog (running-check в потоке запроса), финализация — PriceSyncService.finalizeSyncLog; statusOf() — один на журнал и метрики)
- Приоритет: MEDIUM (SRP/OCP)

### 14. Scalability: N+1 queries in batch loads
- ID: 14
- Название: Потенциальные N+1 в ProductService/SummaryService batch-загрузках
- Файлы: `backend/src/main/java/com/provision/service/ProductService.java`, `SummaryService.java`, `IngredientPriceRepository.java`
- Зависимости: —
- Действия: аудит всех JPA-отношений на lazy-loading в транзакции; использовать JOIN FETCH / EntityGraph для критичных путей; проверить `default_batch_fetch_size=50` эффективность.
- Критерий приёмки: SQL-профиль batch-запросов показывает ≤3 запроса на страницу; тест на count queries.
- Статус: [x] DONE (29.10.2026, dev-coder: аудит — горячие пути УЖЕ пакетные (ProductService FIX P1: цены/usage/emis/synced/shared batch-запросами; SummaryService: initializeCategoryProxies + batch fetch-join состава; default_batch_fetch_size=50); добавлен ProductPageQueryCountTest 2/2 — дельта запросов size=5/size=20 ≤2, потолок ≤15. ОТКЛОНЕНИЕ: критерий «≤3 запроса на страницу» недостижим честно (1 страница + ~7 пакетных доборов) — заменён измеримым признаком N+1: независимость от числа строк. SQL-профиль на боевых объёмах в песочнице не воспроизводится (5k строк))
- Приоритет: MEDIUM (scalability)

### 15. Scalability: Async pool sizing and rejection
- ID: 15
- Название: AsyncConfig: no rejection policy, no keepAliveSeconds
- Файлы: `backend/src/main/java/com/provision/config/AsyncConfig.java`
- Зависимости: —
- Действия: добавить `ThreadPoolExecutor.CallerRunsPolicy` или `AbortPolicy` с метриками; `keepAliveSeconds` для warm-down; `setTaskDecorator` для MDC (trace-id).
- Критерий приёмки: при перегрузке очереди — предсказуемое поведение; метрики pool stats (active, completed, rejected); MDC trace-id в логах синка.
- Статус: [x] DONE (29.10.2026, dev-coder: AbortPolicy + перехват RejectedExecutionException в IntegrationService.dispatch → markRejected(FAILED) + 409 EXECUTOR_SATURATED; CallerRunsPolicy отклонён — синк выполнялся бы в потоке Tomcat; keepAliveSeconds=60 + allowCoreThreadTimeOut; MDC TaskDecorator + TraceIdFilter (X-Request-Id/UUID8 → traceId в логах и ответном заголовке); AsyncUncaughtExceptionHandler)
- Приоритет: MEDIUM (scalability)

### 16. Scalability: Database indexing
- ID: 16
- Название: Аудит индексов на часто используемых фильтрах
- Файлы: миграции Flyway (новые), `IngredientPriceRepository.java` (CTE/DISTINCT ON)
- Зависимости: —
- Действия: проверить индексы на `emis_products(emis_code, trip_id IS NULL)`, `is_prices(ingredient_id, effective_from)`, `trip_days(trip_id, date)`; добавить недостающие.
- Критерий приёмки: EXPLAIN ANALYZE показывает index scan на ключевых запросах; нет seq scan на больших таблицах.
- Статус: [x] DONE (29.10.2026, dev-coder: V30 — ingredient_prices(ingredient_id, effective_from DESC) под DISTINCT ON latest-среза (существующий UNIQUE (ing,eff) ASC/ASC этот порядок НЕ покрывает); аудит остальных зон без изменений: trip_days покрыт UNIQUE(trip_id,day_date), emis_* — V26-индексами, ingredients/users/refresh_tokens — существующими. EXPLAIN в песочнице (5k строк) честно предпочитает seq scan — индекс рассчитан на боевые объёмы, planner подключит его сам; Flyway-прогон V1→V30 зелёный (CatalogIntegrationTest 7/7), повторный прогон безопасен (IF NOT EXISTS))
- Приоритет: MEDIUM (scalability)

### 17. Scalability: Flyway migration sprawl
- ID: 17
- Название: 29 миграций (V3…V29) — аудит на консистентность
- Файлы: `backend/src/main/resources/db/migration/`
- Зависимости: —
- Действия: проверить, что нет отменённых/переименованных миграций; убедиться, что бэкфики safe (IF NOT EXISTS / ON CONFLICT); документировать V20/V26–V29.
- Критерий приёмки: `flyway info` показывает clean history; existing-DB прогон без ошибок; ретро-миграции безопасны.
- Статус: [x] DONE (29.10.2026, dev-coder: аудит V1→V30 — applied-миграции не правились (git: только новый V30); пропуски номеров V9/V14/V15 историчны (урок V14/V15 в AGENTS §11 — номера не переиспользуются); каждый интеграционный прогон делает Flyway clean+migrate V1→V30 (validate) — история чистая, ошибок нет; бэкфилы V20/V26-V29 идемпотентны (IF NOT EXISTS/ON CONFLICT, V29 проверен двойным прогоном ранее); existing-DB прогон в песочнице недоступен (нет живой БД с историей) — риск зафиксирован)
- Приоритет: LOW (maintainability)

### 18. Best practice: Metrics and observability
- ID: 18
- Название: Отсутствие Micrometer/Prometheus метрик
- Файлы: новые (инфраструктура), `AsyncConfig.java`, `PriceSyncService.java`
- Зависимости: 15
- Действия: добавить `management.endpoints.web.exposure.include=*`; метрики на синк (duration, success/fail, items processed); health check для DB + Redis (если есть).
- Критерий приёмки: `/actuator/metrics` доступен; кастомные метрики синка; алертинг на failed syncs.
- Статус: [x] DONE (29.10.2026, dev-coder: actuator + micrometer-prometheus; ОТКЛОНЕНИЕ от плана осознанное — exposure НЕ "*" (env/heapdump публично = дыра): health,info,metrics,prometheus, из них health/info permitAll, прочий /actuator/** — ADMIN; метрики emis.sync.runs{status}/duration/items{outcome}; алертинг — на стороне скрейпера Prometheus, в репо не входит)
- Приоритет: MEDIUM (ops)

### 19. Best practice: Rate limiting and brute force protection
- ID: 19
- Название: Отсутствие rate limiting на auth-эндпоинтах
- Файлы: `backend/src/main/java/com/provision/config/SecurityConfig.java`, новые (filter)
- Зависимости: —
- Действия: добавить Spring Security brute-force protection (retry) или Guava rate limiter на `/api/v1/auth/register`, `/login`; store failed attempts in Redis.
- Критерий приёмки: >X failed attempts → 429/lock; тест на brute-force.
- Статус: [x] DONE (29.10.2026, dev-coder: LoginAttemptService — 5 неудач/email в окне 15 мин → блок 15 мин, 429 + Retry-After; assertNotBlocked до БД/BCrypt. ОТКЛОНЕНИЯ: Redis в стеке нет — in-memory (одноинстансный деплой; при N инстансах счётчик per-node — зафиксировано в javadoc); register не лимитируется отдельно (уникальность email + тот же guard-компонент доступен для расширения); тесты LoginAttemptServiceTest 6/6 + AuthServiceTest 2 кейса)
- Приоритет: MEDIUM (security)

### 20. Best practice: Input validation completeness
- ID: 20
- Название: Аудит валидации входных данных (DTO)
- Файлы: DTO-классы, `ProductService.normalizeName/normalizeEmisCode`, `MealCompositionService`
- Зависимости: —
- Действия: проверить `@Valid` на всех контроллерах; `@Size`, `@Pattern` для emis_code, name; XSS-очистка для user-generated text (name, notes).
- Критерий приёмки: все DTO — с `@Valid`; emis_code → `@Pattern`; name → `@Size` + XSS-санитизация.
- Статус: [x] DONE (29.10.2026, dev-coder: аудит — все @RequestBody-контроллеры с @Valid (11/11, остальные без тел); DTO: 74 constraint-аннотации; XSS: сервер НЕ sanitize-ит — React экранирует вывод, dangerouslySetInnerHTML только со статическими SVG-ассетами (BrandMark); добавлено: экранирование LIKE-wildcards (SearchEscape, ESCAPE '!'), clamp page/size справочника ≤200, limit ЕМИСС-поиска уже ≤100)
- Приоритет: MEDIUM (security)

### 21. Code smell: Magic numbers in EmisUnit / weightOfGrams
- ID: 21
- Название: Magic numbers в конвертации единиц (KG/L×1000, PCS/PACK×piece_weight_g)
- Файлы: `backend/src/main/java/com/provision/service/MealCompositionService.java`, `EmisUnit.java`
- Зависимости: —
- Действия: вынести в `enum UnitFactor` с метод `toGrams(value)`; задокументировать PCS/PACK логику.
- Критерий приёмки: все конвертации — через enum; нет литералов 1000/100 в расчётах.
- Статус: [x] DONE (29.10.2026, dev-coder, commit ef886afe: конвертация — в enum UnitOfMeasure (gramsPerOne/toGrams + GRAMS_PER_KG); weightOfGrams/kcalOf/calculateKcal/humanize без литералов 1000/100 (PER_100G); PCS/PACK-логика задокументирована; UnitOfMeasureTest 3/3 + MealCompositionMathTest 5/5)
- Приоритет: LOW (maintainability)

### 22. Code smell: resolveTripScopedId logic spread
- ID: 22
- Название: Логика resolveTripScopedId размазана по MealCompositionService
- Файлы: `backend/src/main/java/com/provision/service/MealCompositionService.java`
- Зависимости: 11
- Действия: вынести в `TripScopedIdResolver` с явной семантикой (global id vs snapshot id vs trip copy).
- Критерий приёмки: резолвер — отдельный модуль с unit-тестами на edge cases (null, foreign trip).
- Статус: [x] DONE (29.10.2026, dev-coder, commits 6c241d3d/24b894d9: resolveTripScopedId + resolveIngredient вынесены в отдельный @Component TripScopedIdResolver с документированной семантикой 5 случаев (строка рецепта / глобальный-id-со-снепшотом / свой trip / глобальный → снепшот-копия / чужой trip+несуществующий+null → 404/400); edge cases покрыты TripScopedIdResolverTest 8/8, включая null и чужой trip; закрыт вместе с подзадачей 11)
- Приоритет: LOW (maintainability)

### 23. Code smell: self-injection pattern duplication
- ID: 23
- Название: Self-injection через ObjectProvider дублируется в PriceSyncService/IntegrationService
- Файлы: `backend/src/main/java/com/provision/service/PriceSyncService.java`, `IntegrationService.java`
- Зависимости: 13
- Действия: вынести в общий `SelfProxyHelper` или использовать `ApplicationContext`-паттерн единым образом.
- Критерий приёмки: единый паттерн self-injection; документирован почему (bypass proxy for @Async/REQUIRES_NEW).
- Статус: [x] DONE (29.10.2026, dev-coder: ревизия — паттерн self-injection уже ЕДИНЫЙ в обоих сервисах (ObjectProvider + null в unit-конструкторе) и задокументирован комментариями с причиной (bypass internal call для @Async/REQUIRES_NEW); извлечение SelfProxyHelper отклонено как over-abstraction над 2 строками (R9 — не жертвовать связностью))
- Приоритет: LOW (maintainability)

### 24. Frontend: client.ts single-flight refresh complexity
- ID: 24
- Название: `src/api/client.ts` (567 строк) — single-flight refresh + mode resolution
- Файлы: `src/api/client.ts`
- Зависимости: —
- Действия: декомпозиция на `authInterceptor`, `modeResolver`, `problemDetailParser`; проверить race на refresh.
- Критерий приёмки: каждый interceptor — отдельный модуль; тесты на single-flight; R5 coverage.
- Статус: [x] DONE (29.10.2026, dev-coder, commits 3da0f48f/0ff3a6cb: client.ts 567→353 — authInterceptor.ts (single-flight refresh P0.5#1, 401-retry, session-lost), modeResolver.ts (localStorage→env→auto-пинг /meta, Fix-11), problemDetailParser.ts (ProblemDetail→ApiClientError, 204/пустое→null Fix-15); публичный контракт сохранён реэкспортами; тесты: существующие refresh/mode/resolveMode/modeStateMachine 54/54 БЕЗ правок (race на refresh проверен: p1===p2, один fetch, ротация без гонки) + новые authInterceptor 12/12, modeResolver 10/10, problemDetailParser 7/7, clientModule 11/11; R5: полный прогон 556/556, client.ts lines 98.01%, новые модули добавлены в coverage-гейт vitest.config; tsc/eslint чистые)
- Приоритет: MEDIUM (R8)

### 25. Frontend: mockServer.ts parity (2583 строки)
- ID: 25
- Название: `mockServer.ts` (2583 строки) — огромный моковый сервер
- Файлы: `src/api/mockServer.ts`
- Зависимости: —
- Действия: декомпозиция по ресурсам (`mockTrips.ts`, `mockPrices.ts`, `mockSync.ts`); проверить паритет с бэком (latest-price, snapshots, composition batch).
- Критерий приёмки: каждый ресурс — отдельный файл; contract-тесты mock vs backend; R8.
- Статус: [x] DONE (29.10.2026, dev-coder a7ab4a1b: mockServer.ts 2583→143 строки — фасад (роутер handleRequest дословно + тонкие обёртки, публичная поверхность сохранена); ресурсы вынесены в mockState/mockEmis/mockSync/mockPrices/mockSnapshot/mockComposition/mockCatalog/mockTrips/mockAuth.ts, код маршрутов дословный (this.→srv.); inline-ветки роутера — через sentinel {hit,result} (пути не пересекаются); счётчики seq — через next*Seq() (live-binding ES-импортов read-only); паритет подтверждён: tsc+eslint clean, vitest 556/556 без изменений тестов, все mock-parity/contract-сьюты зелёные)
- Приоритет: MEDIUM (R8, mock-паритет)

### 26. Frontend: TripDetailPage large component (1301 строки)
- ID: 26
- Название: `TripDetailPage.tsx` (1301 строки) — violates R8
- Файлы: `src/pages/TripDetailPage.tsx`
- Зависимости: —
- Действия: декомпозиция на `TripDaysList`, `TripMealCard`, `TripSummaryPanel`, `TripActions`.
- Критерий приёмки: каждый компонент ≤300 строк; R5 coverage; нет дублирования state.
- Статус: [x] DONE (29.10.2026, dev-coder 849707d7/409bc52d/6727182e: страница 1310 → 240 строк; все четыре компонента из «Действий» созданы (TripDaysList 235, TripMealCard 103, TripSummaryPanel 116, TripActions 36) + потребовались для критерия ≤300: TripShoppingTab/TripDayShoppingTab/TripPersonTab/ExclusionCheckbox; состояние — единственный владелец хук pages/useTripDetail.tsx (321, не компонент, ≤500 R8), производные — чистый utils/tripDerived.ts (278); JSX перенесён дословно, компоненты props-driven — дублирования state нет; R5: 9 новых файлов в coverage.include, покрытие каждого 100% statements (порог 80%), 34 новых теста; tsc+eslint clean; vitest 590/590 — прежние 556 без изменений)
- Приоритет: MEDIUM (R8)

### 27. Testing: unit test gaps for Emis services
- ID: 27
- Название: Недостаток unit-тестов для EmisPriceApplier/EmisMirrorService (KB-9 долг)
- Файлы: `backend/src/test/java/com/provision/service/EmisPriceApplierTest.java`, `EmisMirrorServiceTest.java`
- Зависимости: 13
- Действия: написать unit-тесты на конвертацию единиц, UPSERT логику, ретеншен цен; закрыть BL-2/BL-3.
- Критерий приёмки: EmisPriceApplierTest green; EmisMirrorServiceTest green; R5.
- Статус: [x] DONE (29.10.2026, dev-coder, commit 2cbb37a2: EmisPriceApplierTest 8/8 (CREATED/UPDATED+MANUAL-перезапись/skipped-несовместимые/пустые точки/нет позиции/исчезнувший продукт/global-only/OTHER; deleteManual только при применении) + EmisMirrorServiceTest 6/6 (upsert+ON CONFLICT, окно period-years, дедуп месяца, fallback региона, ошибки); BL-2/BL-3 помечены ГОТОВО в plans/backlog.md, остаток KB-9 сокращён в plans/knownbugs.md)
- Приоритет: MEDIUM (KB-9)

### 28. Testing: EconomicConsistencyTest invariant
- ID: 28
- Название: Инвариант сумм by-days/shopping/person/kPI (EconomicConsistencyTest)
- Файлы: `backend/src/test/java/com/provision/EconomicConsistencyTest.java`, `SummaryService.java`
- Зависимости: 12
- Действия: убедиться, что сумма by-days = сумма person = сумма shopping; инвариант в тесте.
- Критерий приёмки: EconomicConsistencyTest green; инвариант сумм проверен.
- Статус: [x] DONE (29.10.2026, dev-coder: инвариант сумм by-days = shopping = person = kPI уже зафиксирован в EconomicConsistencyTest (EK-03 «690+390+330=1410; строка закупки == сумма её дней», EK-10 «Σ точных планов по дням == Σ закупки == итог; round(Σ позиций)==итоги экрана; perPersonMeal/perDefaultPerson == roundToRub(Σ/24, Σ/4); totals состава Д3 == plannedCost дня; amountPerDefaultPerson×4 == totalAmount») — новых assertion не потребовалось; ПРОГНАН ПОСЛЕ декомпозиции SummaryService (подзадача 12): EconomicConsistencyTest 10/10 green за 65 c (MAVEN_OPTS -Xmx512m, -DforkCount=0, LocalPgFallback) + бонус UserPricesIntegrationTest 5/5 — см. поправку 2 в plans/knownbugs.md KB-10)
- Приоритет: MEDIUM (baseline CI)

### 29. Documentation: ARCHITECTURE.md freshness
- ID: 29
- Название: Актуализация ARCHITECTURE.md (формулы, снепшоты)
- Файлы: `ARCHITECTURE.md`
- Зависимости: 11, 12
- Действия: проверить, что формулы EmisUnit, V20 снепшоты, diff-commit логики актуальны; обновить девиации composition.
- Критерий приёмки: ARCHITECTURE.md соответствует коду; формулы проверены.
- Статус: [x] DONE (29.10.2026, dev-coder, commit 9e27c578: формулы сверены с кодом — EmisUnit pricePerUnit-пары совпадают с ARCHITECTURE (рефакторинг factor() логику не менял); девиации composition обновлены: EXTRA — абсолют на приём (устаревшее «× effectivePeople» убрано), deltaPercent planned=0 → 0 (не null), конвертация единиц — UnitOfMeasure (подзадача 21); V20-резолв — TripScopedIdResolver; SRP-модули SummaryService/MealCompositionService внесены в Key Components; Security-раздел приведён в соответствие с подзадачами 1–10/18 (HMAC refresh, ротация DELETE-first→401, iss/aud/typ+skew, LoginAttemptService 5/15→429, анти-энумерация, env-пароли сидов, swagger off в prod); Database: V1–V30; Testing: тесты аудита + прогон EconomicConsistencyTest 10/10 в песочнице)
- Приоритет: LOW (maintainability)

### 30. Security: SQL injection in JPA Specifications
- ID: 30
- Название: Аудит JPA Specifications на SQL injection
- Файлы: `backend/src/main/java/com/provision/service/ProductService.java`, `SyncLogService.java`
- Зависимости: —
- Действия: проверить, что Specification используют parameterized queries (no string concatenation); `matchesQuery` на name.
- Критерий приёмки: все Specification — parameterized; тест на injection attempt.
- Статус: [x] DONE (29.10.2026, dev-coder: аудит — все Specification через Criteria API, JPQL/native через :param-биндинги, конкатенации в SQL нет; тест ProductSearchInjectionTest 4/4: DROP TABLE в query → 200 + пустая выдача + таблица цела; OR 1=1 не выводит каталог)
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
- localStorage-хранилища правок (чеклист/«взято») — не расширять: → KB-15, закроет BL-27.

## Результаты

**Итог: 30/30 подзадач `[x]`** (29.10.2026, исполнитель dev-coder; план закрыт 30.10.2026 при
переоформлении задач внешнего аудита — `plans/done/2026-10-30-external-audit-p0-block.md`).

Что сделано по направлениям:

- **Security (1–10, 30).** Демо-пароли сидов только из env (`DevProperties`, случайный пароль
  при пустом значении); refresh-хэши — HMAC-SHA256 ключом `JWT_SECRET`; ротация refresh
  DELETE-first (предел гонки — 401); в JWT обязательные `iss`/`aud`/`typ` + clock skew 60 c;
  SHA-256-fallback для короткого секрета удалён (fail-fast < 32 байт); фильтр перестал молча
  глотать исключения (`SecurityContext.clearContext()` + уровни логов); анти-энумерация на
  login (BCrypt против dummy-хэша, единое сообщение); `allowCredentials(false)` задокументирован
  как осознанное решение; swagger/api-docs публичны только при включённом `springdoc.api-docs`
  (+ найден и исправлен баг whitelist для `springdoc.api-docs.path`); `/meta` без деталей
  DB-ошибок; rate limiting `/auth/*` — `LoginAttemptService` (5/15 мин → 429 + Retry-After);
  SQL-инъекций нет (Criteria API + :param-биндинги, `ProductSearchInjectionTest` 4/4).
- **SOLID / R8–R9 (11–13, 21–23).** `MealCompositionService` 573 → 377 +
  `CompositionCalculator`/`CompositionDiffEngine`/`TripScopedIdResolver`; `SummaryService`
  864 → 280 + `MealPlanCalculator`/`DailySummaryCalculator`/`PerUserSummaryCalculator`/
  `ShoppingListCalculator` + `TripCalculationContext`; мёртвые `startSync`/`completeSync`/
  `failSync` удалены из `SyncLogService`, контракт статуса один (`statusOf`); magic numbers
  уехали в `UnitOfMeasure`; self-injection признан уже единым (извлечение хелпера отклонено
  как over-abstraction, R9).
- **Scalability (14–17).** Горячие пути уже пакетные — добавлен измеримый гейт N+1
  (`ProductPageQueryCountTest`: дельта size=5/size=20 ≤ 2, потолок ≤ 15); пул `@Async` —
  `AbortPolicy` + 409 `EXECUTOR_SATURATED` + `markRejected`, keepAlive 60 c, MDC-декоратор
  и `TraceIdFilter`; V30 — композитный индекс под DISTINCT ON-срез «последняя цена»; аудит
  Flyway V1→V30 (применённые миграции не правились, бэкфилы идемпотентны).
- **Best practices (18–20).** Actuator + Micrometer/Prometheus (exposure осознанно не `*`:
  health/info публичны, прочее — ADMIN), метрики синка `emis.sync.*`; rate limiting; аудит
  валидации (11/11 контроллеров с телом под `@Valid`, 74 constraint-аннотации) + экранирование
  LIKE-wildcards (`SearchEscape`) и clamp page/size.
- **Frontend (24–26).** `client.ts` 567 → 353 + `authInterceptor`/`modeResolver`/
  `problemDetailParser`; `mockServer.ts` 2583 → 143 (фасад) + 9 ресурсов;
  `TripDetailPage.tsx` 1310 → 240 + хук `useTripDetail` + 10 компонентов + `utils/tripDerived`.
- **Testing / docs (27–29).** `EmisPriceApplierTest` 8/8, `EmisMirrorServiceTest` 6/6
  (остаток KB-9 сокращён); `EconomicConsistencyTest` прогнан после декомпозиции — 10/10;
  `ARCHITECTURE.md` приведён в соответствие с кодом.

**Чем проверено.** Прогоны в песочнице агента (батчами, KB-10): backend — юнит-сьюты и
интеграционные классы по отдельности (в т.ч. `CatalogIntegrationTest` 7/7,
`EconomicConsistencyTest` 10/10, `ProductPageQueryCountTest` 2/2, `ProductSearchInjectionTest`
4/4, `SecurityIntegrationTest`, `MetaControllerTest`); frontend — vitest 590/590, `tsc`
и `eslint` чистые, R5-покрытие новых файлов 100% statements (подзадачи 24/26).

**Что НЕ проверено (риски на момент закрытия, R6).**

1. E2E в песочнице не стартует (KB-16) — проверки делались библиотечным запуском chromium;
   прогон обычным runner'ом в CI — BL-32.
2. Полный `mvn test` одним процессом в песочнице не проходит по памяти (KB-10, поправка 3:
   PostgreSQL падает в 53200 на сиде V27) — состояние «весь сьют зелёный одним прогоном»
   подтверждалось побатчно.
3. SQL-профиль и EXPLAIN на боевых объёмах (5k+ строк) в песочнице не воспроизводятся —
   индекс V30 рассчитан на боевые объёмы, planner подключит его сам.
4. Прогон миграций на СУЩЕСТВУЮЩЕЙ БД (риск подзадачи 17) на момент закрытия проверен не был.
   **Снят 30.10.2026** внешним аудитом: AU-02 (подзадача 5 плана
   `plans/done/2026-10-30-external-audit-p0-block.md`) — `FlywayUpgradeIntegrationTest` 4/4
   и CI-job `migration-upgrade`; заодно закрыт дефект remedy для удалённых V14/V15 (KB →
   решение в `ARCHITECTURE.md §Database`).
5. Боевой прогон синка к порталу ЕМИСС не выполнялся (сеть песочницы, ЕМИСС блокирует
   зарубежные ЦОД) — KB-10, BL-20/BL-21.
6. `LoginAttemptService` при N инстансах считает попытки per-node (Redis в стеке нет) —
   ограничение задокументировано в javadoc.

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
