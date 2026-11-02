# Plan: Внешний аудит 30.10.2026 — P0-блок (5 фиксов) и переоформление 30 задач

Status: DONE
Created: 2026-10-30
Closed: 2026-10-30

## Цель

Закрыть пять P0-находок внешнего аудита (ревизия `2ab57fb`) с тестами по правилам проекта
(R1 — без «страховочных» дублей, R2 — нужный слой, R5 — покрытие нового) и переоформить
все 30 задач аудита во внутренний формат: активные планы `plans/`, отложенные дефекты —
`plans/knownbugs.md` (`KB-n`), стек задач — `plans/backlog.md` (`BL-n`), индекс — `PLAN.md`.

P0-блок (все пять — реализованы в этой задаче):

| AU | Что чиним |
|---|---|
| AU-04 | `LoginAttemptService` растёт неограниченно — неаутентифицируемый DoS на `/auth/login` |
| AU-03 | Гонка `startSyncLog` (SELECT → INSERT) — два параллельных синка цен |
| AU-14 | Нет обработчиков 413 / 409 / 409-lock — клиент получает 500 с внутренностями |
| AU-05 | Загрузка выгрузки ЕМИСС: 96 МБ в heap, guard после чтения файла, очередь пула на 100 задач |
| AU-02 | Remedy для удалённых V14/V15 не работает + нет гейта «миграция на существующей БД» (AGENTS R6) |

## Контекст

- Источник: внешний аудит приложения, выполненный в сессии 30.10.2026 (ревизия `2ab57fb`).
  Отчёт с доказательствами (`AUDIT-2026-10-30.md`, 663 строки), список задач
  (`TASKS-2026-10-30.md`, 727 строк) и машиночитаемая версия (`tasks.csv`) созданы
  **вне репозитория**: `AGENTS.md` §1 запрещает новые MD-отчёты вне белого списка, поэтому
  in-repo след аудита — этот план (таблица 30 задач в приложении), `BL-33…BL-57`
  в `plans/backlog.md` и `KB-17…KB-27` в `plans/knownbugs.md`.
- Предыдущий внутренний аудит: `plans/done/2026-10-29-full-audit.md` (30 подзадач, закрыт
  30.10.2026). Пересечения учтены: AU-15 продолжает подзадачу 13, AU-19 — KB-14/BL-16/BL-26,
  AU-06 — KB-16/BL-32, AU-07 — подзадачу 24/26 (R5), AU-01 — подзадачи 15/16 (пул, индексы).
- Правила: `AGENTS.md` §0 (кириллица — только UTF-8-инструменты), §1 (белый список MD),
  §2 (планы и реестры), §8 (миграции: только новые номера, применённые не править),
  §13 R1–R10 (тесты, слои, покрытие, размер файлов).
- Ограничение среды (KB-10): в песочнице агента ~1 ГБ RAM на JVM + PostgreSQL, поэтому полный
  `mvn test` одним процессом не проходит — PostgreSQL падает в `out of memory` (SQLSTATE 53200)
  на сиде V27. Прогоны делались батчами (см. «Результаты»).

## Подзадачи

### 1. AU-04: ограничить рост `LoginAttemptService`

- Файлы: `backend/src/main/java/com/provision/service/LoginAttemptService.java`,
  `backend/src/test/java/com/provision/security/LoginAttemptServiceTest.java`
- Зависимости: —
- Действия: потолок отслеживаемых ключей `MAX_TRACKED_KEYS = 50_000`; при превышении — эвакуация
  (`sweepExpired()`, затем `evictUnlocked()` — заблокированные ключи не трогаем, иначе
  блокировка снимается досрочно); счётчики/метрика эвакуаций; конструктор с параметрами для
  unit-тестов; порог эвакуации — `attempts.size() > maxTrackedKeys / 2` (без двойного счёта:
  `it.remove()` уже уменьшает размер).
- Критерии приёмки: неаутентифицированный поток уникальных email не может растить карту без
  предела; существующее поведение (5 попыток / 15 мин / 429 + Retry-After) не изменилось;
  тесты покрывают потолок, эвакуацию и сохранение блокировок.
- Статус: [x] DONE (30.10.2026: `LoginAttemptServiceTest` 10/10)

### 2. AU-14: обработчики 413 / 409 / 409-lock в `GlobalExceptionHandler`

- Файлы: `backend/src/main/java/com/provision/exception/GlobalExceptionHandler.java`,
  `backend/src/test/java/com/provision/exception/GlobalExceptionHandlerErrorCodeTest.java` (новый)
- Зависимости: —
- Действия: `MaxUploadSizeExceededException` → 413 `PAYLOAD_TOO_LARGE` (лимит из
  `spring.servlet.multipart.max-file-size`), `DataIntegrityViolationException` → 409
  `DATA_CONFLICT`, `OptimisticLockingFailureException` → 409 `CONCURRENT_MODIFICATION`;
  хелпер `build(...)` против копипасты тела ответа. Существующие 14 обработчиков не тронуты —
  миграция всех на хелпер и декомпозиция класса это AU-15 (`BL-54`).
- Критерии приёмки: внутренние детали не утекают в ответ (нет имени ограничения БД
  `users_email_key`, нет `commons-fileupload`, нет текста внутреннего исключения);
  регрессия — прежние 500/400 не изменились.
- Статус: [x] DONE (30.10.2026: `GlobalExceptionHandlerErrorCodeTest` 4/4, standaloneSetup без
  Spring-контекста — R2)

### 3. AU-03: убрать гонку `startSyncLog` частичным уникальным индексом

- Файлы: `backend/src/main/resources/db/migration/V31__sync_logs_running_unique.sql` (новый),
  `backend/src/main/java/com/provision/service/IntegrationService.java`,
  `backend/src/test/java/com/provision/service/IntegrationUploadTest.java` (новый)
- Зависимости: —
- Действия: V31 — сначала дедуп залипших `RUNNING` (иначе индекс не создастся), затем
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_logs_running ON sync_logs(provider)
  WHERE status='RUNNING'`; в `startSyncLog` перехват `DataIntegrityViolationException` →
  тот же 409 `SYNC_ALREADY_RUNNING`, что и на быстром пути через SELECT (контракт клиента
  не меняется). Применённые миграции не правились — только новый номер (§8).
- Критерии приёмки: второй одновременный запуск физически невозможен на уровне БД; клиент
  получает 409 в обоих случаях; миграция идемпотентна и проходит на существующей БД.
- Статус: [x] DONE (30.10.2026: `IntegrationUploadTest` 6/6 — гонка через уникальный индекс,
  V31 накатывается во всех интеграционных прогонах; `FlywayUpgradeIntegrationTest` 4/4)

### 4. AU-05: загрузка выгрузки ЕМИСС — guard до чтения, поток вместо `byte[]`, очередь пула

- Файлы: `backend/src/main/java/com/provision/integration/EmisDataSource.java`,
  `.../integration/RosstatEmisProvider.java`, `.../service/PriceSyncService.java`,
  `.../service/IntegrationService.java`, `.../controller/IntegrationController.java`,
  `.../config/AsyncConfig.java`,
  `backend/src/test/java/com/provision/integration/RosstatEmisProviderTest.java`,
  `.../service/PriceSyncPayloadTest.java` (новый), `.../service/IntegrationUploadTest.java` (новый),
  `.../config/AsyncConfigTest.java` (новый)
- Зависимости: 3 (общий путь `startSyncLog`), 2 (413 на превышении multipart-лимита)
- Действия:
  1. `EmisDataSource.parseSnapshot(InputStream, long sizeBytes, String fileName)` — основной
     контракт; прежний `parseSnapshot(byte[], String)` оставлен default-делегатом (6 существующих
     тестов формата прошли без правок);
  2. `RosstatEmisProvider`: предел `max-response-bytes` проверяется по declared-размеру **до**
     чтения, признак SDMX ищется в первых 64 КБ через `PushbackInputStream` + `EmisTransport.readHead`
     с возвратом прочитанного в поток, дальше — потоковый `parseSdmx` (StAX, KB-1);
     `IOException` → `IntegrationUnavailableException` через `EmisTransport.friendlyIo`;
  3. `PriceSyncService.runPriceSyncFromFile(..., Path, ...)`: чтение `BufferedInputStream` +
     `Files.size`, удаление временного файла в `finally` (`deletePayloadQuietly` — отказ удаления
     не роняет отчётность);
  4. `IntegrationService.uploadSnapshot(..., Path, long, String)` + `assertUploadCanStart(provider)`:
     guard до чтения тела; владелец временного файла — сервис, если старт не состоялся
     (пустой файл / провайдер не найден / 409 / отказ пула), иначе — `PriceSyncService`;
  5. `IntegrationController`: `assertUploadCanStart` **до** чтения multipart, содержимое —
     `Files.copy(file.getInputStream(), temp, REPLACE_EXISTING)` (не `transferTo`: у
     `StandardMultipartFile.transferTo` семантика поверх существующего файла зависит от контейнера);
  6. `AsyncConfig`: `queueCapacity` 100 → 2 («сейчас + один следующий»), `AbortPolicy` уже был —
     отказ даёт честный 409 `EXECUTOR_SATURATED` вместо склада задач, каждая из которых держит
     файл выгрузки и запись журнала в `RUNNING`.
- Критерии приёмки: heap не зависит от размера файла (отказ по переразмеру не читает поток вовсе);
  временный файл не переживает синк ни на одной ветке; 409/413 вместо 500 и OOM;
  существующие тесты формата выгрузки зелёные без правок.
- Статус: [x] DONE (30.10.2026: `RosstatEmisProviderTest` 37/37 (из них 3 новых на потоковый
  контракт), `PriceSyncPayloadTest` 3/3, `IntegrationUploadTest` 6/6, `AsyncConfigTest` 2/2)

### 5. AU-02: remedy для удалённых V14/V15 + гейт апгрейда существующей БД

- Файлы: `backend/src/main/resources/application.yml`, `backend/src/main/resources/…` (не менялись),
  `README.md`, `backend/README.md`, `ARCHITECTURE.md`, `.github/workflows/ci.yml`,
  `backend/src/test/java/com/provision/integration/FlywayUpgradeIntegrationTest.java` (новый)
- Зависимости: —
- Действия:
  1. Решение зафиксировано в `ARCHITECTURE.md §Database`: вариант «вернуть V14/V15 заглушками»
     отклонён (Flyway сверяет checksum — заглушка меняет «not resolved locally» на
     «checksum mismatch»), принят `spring.flyway.ignore-migration-patterns: "*:missing"`
     с комментарием, почему это безопасно здесь и почему `*:future`/`*:pending`/checksum
     намеренно НЕ игнорируются (V28 дропал таблицы — откат образа на новую схему обязан падать);
  2. `README.md:157` исправлен: прежний совет (`DELETE FROM users …`) не лечил — приложение не
     стартовало до всяких пользователей. Теперь отдельная строка про симптом
     `Detected applied migration not resolved locally: 14` с настоящим remedy
     (`DELETE FROM flyway_schema_history WHERE version IN ('14','15')` либо `flyway repair`)
     и отдельная строка про cleanup демо-юзеров;
  3. CI-job `migration-upgrade` (`.github/workflows/ci.yml`): БД поднимается миграциями
     ПРЕДЫДУЩЕЙ версии (тег / base PR / `HEAD^`) через образ `flyway/flyway`, затем стартует
     ТЕКУЩИЙ backend jar против неё — проверяются старт приложения, `/api/v1/meta` → 200,
     `flyway validate` и факт применения максимальной версии текущего дерева;
  4. `FlywayUpgradeIntegrationTest`: БД с V14/V15 в истории → контекст стартует,
     `flyway.validate()` зелёный, негативный контроль (Flyway без ignore-паттернов ту же БД
     отклоняет), история не переписана (`ignore ≠ repair`), `/api/v1/meta` → 200;
  5. Документация: `backend/README.md` — V1–V31 + пункты V30/V31 + remedy; `ARCHITECTURE.md` —
     V1–V31 и абзац решения.
- Критерии приёмки: контейнер с volume до 28.10.2026 стартует после `git pull` без ручных
  действий; README не вводит в заблуждение; job `migration-upgrade` в CI присутствует;
  тест воспроизводит прод-симптом (проверено снятием настройки — контекст падает ровно с
  `Detected applied migration not resolved locally: 14/15`).
- Статус: [x] DONE (30.10.2026: `FlywayUpgradeIntegrationTest` 4/4, в том числе на свежей БД
  и повторным прогоном; негативный эксперимент выполнен. **Job `migration-upgrade` в песочнице
  не запускался** — GitHub Actions из среды агента недоступен: YAML валиден (js-yaml),
  все 7 shell-блоков проходят `bash -n`, но фактический прогон — на стороне CI)

### 6. Переоформление 30 задач аудита во внутренний формат

- Файлы: `plans/2026-10-30-external-audit-p0-block.md` (этот), `plans/backlog.md`,
  `plans/knownbugs.md`, `PLAN.md`, `plans/done/2026-10-29-full-audit.md` → `plans/done/…`
- Зависимости: 1–5
- Действия: закрыть предыдущий активный план (30/30 `[x]` — «Результаты», `Status: DONE`,
  `Closed`, `git mv` в `plans/done/`, ссылки на старый путь в коде обновлены; применённые
  миграции Flyway не тронуты — исключение §2 п.6/§8); 25 непросроченных задач аудита
  (P1/P2/P3) — в `plans/backlog.md` как `BL-33…BL-57` с «что сделать / критерий приёмки /
  источник»; 11 дефектных находок — в `plans/knownbugs.md` как `KB-17…KB-27` с указанием,
  какой `BL-n` закроет; `AU-01` (Spring Boot, XL) и `AU-08` (JaCoCo, XL) помечены как задачи,
  требующие отдельного файла плана (§3); `PLAN.md` — только ссылки.
- Критерии приёмки: активный план в репозитории один (или ноль); нумерация `KB-n`/`BL-n` сквозная
  и не переиспользуется; закрытые записи не удаляются; в белом списке MD новых файлов нет.
- Статус: [x] DONE (30.10.2026)

### 7. Верификация: юнит-сьют и интеграционные батчи

- Файлы: — (прогоны)
- Зависимости: 1–5
- Действия: `mvn -o -B -ntp test -DforkCount=0` с `JWT_SECRET` (как в `ci.yml`): юнит-классы
  одним прогоном, Spring-классы батчами по 2–3 со сносом тестовых БД между батчами
  (иначе PostgreSQL в песочнице падает в 53200 на сиде V27 — KB-10, поправка 3).
- Критерии приёмки: 0 падений, не объяснённых ограничением среды; новые тесты зелёные;
  экономические инварианты (`EconomicConsistencyTest`) зелёные.
- Статус: [x] DONE (30.10.2026: 219 unit-тестов (28 классов) + 75 Spring-тестов (16 классов) —
  0 failures / 0 errors; детали в «Результаты»)

## CI

- Локальные прогоны (песочница агента, без GitHub Actions):
  - юнит-батч: `Tests run: 219, Failures: 0, Errors: 0` (28 классов), BUILD SUCCESS;
  - интеграционные батчи: `SecurityIntegrationTest`+`ConflictIntegrationTest` 9/9;
    `AuthIntegrationTest`+`ProductSearchInjectionTest`+`MetaControllerTest` 13/13;
    `SnapshotIsolationIntegrationTest`+`RecipeUpdateInUseIntegrationTest`+
    `ShoppingExclusionsDayIntegrationTest` 10/10; `ProductPageQueryCountTest`+
    `DockerStackSmokeTest`+`TripManualItemsIntegrationTest` 12/12;
    `CatalogIntegrationTest` 7/7, `EconomicConsistencyTest` 10/10,
    `EmisSharedCountIntegrationTest` 5/5, `UserPricesIntegrationTest` 5/5,
    `FlywayUpgradeIntegrationTest` 4/4;
  - полный сьют одним процессом НЕ проходит по памяти (KB-10): PostgreSQL `ERROR: out of memory`
    (SQLSTATE 53200) на `V27__seed_emis_catalog_and_prices.sql` — это ограничение песочницы
    (1 ГБ на JVM + PG), а не регрессия: те же классы по отдельности и батчами зелёные.
- CI-1: новый job `migration-upgrade` в `ci.yml` в песочнице не запускался (нет доступа
  к GitHub Actions). Проверено статически: YAML парсится, shell-блоки валидны. Риск первого
  прогона: доступность образа `flyway/flyway:<версия>` и тайминг старта backend jar
  (300 c на ожидание `/api/v1/meta`).
- CI-2: frontend-гейты (`npm run lint` / `typecheck` / `test`) в этой задаче не запускались —
  правок во фронтенде нет (`node_modules` в песочнице отсутствует).
- Baseline: README утверждает, что `EconomicConsistencyTest` красный на master; в этой сессии
  он зелёный (10/10, два независимых прогона) — утверждение в README устарело, правка отнесена
  в `BL-55` (doc-consistency pass), чтобы не менять документацию мимоходом.

## Known bugs

Дефектные находки аудита, которые НЕ вошли в P0-блок, перенесены в реестр (указатели):

- → KB-17 (Spring Boot 3.x вне поддержки, нет security-патчей)
- → KB-18 (E2E-nightly красный, real-mode-регрессия не выполнялась ни разу)
- → KB-19 (security-сканы в CI не блокируют; compose/nginx без hardening)
- → KB-20 (nginx: нет CSP/security-заголовков/gzip/кэша ассетов, XFF не передаётся)
- → KB-21 (CVE в `react-router-dom`/`uuid`, нет Dependabot и `npm audit` в CI)
- → KB-22 (нет branch protection: прямой push в `main`, 6 из 45 последних прогонов красные)
- → KB-23 (мок-слой попадает в прод-сборку и переключается из UI)
- → KB-24 (нет оптимистичных блокировок `@Version` — конкурентная запись молча перезаписывает)
- → KB-25 (coverage-гейт R5 не выполняется в CI, whitelist 44/102 файла)
- → KB-26 (BOM в 5 файлах и `fix-encoding.ps1` в дереве — риск mojibake, §0)
- → KB-27 (в prod `detail` может отдать внутреннее сообщение исключения)

Возникшие в процессе работы:

- Ограничение песочницы (1 ГБ на JVM + PostgreSQL) — не новый дефект, а уточнение KB-10:
  добавлена поправка 3 с воспроизведением (53200 на сиде V27) и рабочим приёмом
  (батчи ≤3 классов, снос тестовых БД между батчами, `JWT_SECRET` как в `ci.yml`).

## Backlog

- → BL-33…BL-39 (P1: E2E-nightly, coverage-гейт, security-сканы, Dependabot/CVE, одна версия Java,
  nginx, branch protection)
- → BL-40 (`AU-01`, Spring Boot 3.2.5 → поддерживаемая линия, XL — при взятии в работу нужен
  отдельный файл плана, §3)
- → BL-41…BL-55 (P2: `@Version`+UX конфликта, JaCoCo-гейт (XL — отдельный план), зависимости
  и `package.json`, typecheck e2e/конфигов, гейт белого списка MD, BOM, `react-datepicker`
  и бюджет бандла, ESLint 9 + jsx-a11y + hex-токены, санитизация `detail` по профилям,
  Docker/compose hardening, GitHub Actions и пин runner'а, решение по мок-слою (нужен владелец),
  5 неотслеживаемых нарушений R8, декомпозиция `GlobalExceptionHandler` + traceId,
  doc-consistency + линкер ссылок)
- → BL-56, BL-57 (P3: мусор и мёртвый код, порт dev-сервера)

## Результаты

**Что сделано.** Пять P0-находок внешнего аудита закрыты кодом и тестами; 30 задач аудита
переоформлены во внутренний формат (этот план, `BL-33…BL-57`, `KB-17…KB-27`), предыдущий
активный план закрыт и перенесён в `plans/done/`.

Изменённые файлы (backend): `LoginAttemptService`, `GlobalExceptionHandler`, `IntegrationService`,
`IntegrationController`, `PriceSyncService`, `EmisDataSource`, `RosstatEmisProvider`,
`AsyncConfig`, `application.yml`, новая миграция `V31__sync_logs_running_unique.sql`;
тесты: `LoginAttemptServiceTest` (+10), `GlobalExceptionHandlerErrorCodeTest` (новый, 4),
`IntegrationUploadTest` (новый, 6), `PriceSyncPayloadTest` (новый, 3), `AsyncConfigTest`
(новый, 2), `FlywayUpgradeIntegrationTest` (новый, 4), `RosstatEmisProviderTest` (+3).
Документация и CI: `README.md`, `backend/README.md`, `ARCHITECTURE.md`, `.github/workflows/ci.yml`.

**Что проверено.** 219 unit-тестов и 75 Spring-тестов — 0 падений (прогоны батчами, см. «CI»).
Обе новые миграционные гарантии проверены экспериментом: снятие
`ignore-migration-patterns` воспроизводит прод-симптом (`Detected applied migration not
resolved locally: 14/15`, контекст не стартует), возврат — зелёный прогон; уникальность
`uq_sync_logs_running` проверена через перехват `DataIntegrityViolationException` → 409.
Отказ пула (`queueCapacity` 2 + `AbortPolicy`) проверен на реальном executor'е: 7 задач
принимаются (2 ядра + 2 в очереди + 3 до max), 8-я отклоняется.

**Что НЕ проверено (риски, R6).**
1. Job `migration-upgrade` ни разу не выполнялся в GitHub Actions (доступа к CI из песочницы
   нет) — первый прогон может потребовать правки (доступность образа `flyway/flyway`, тайминг
   старта jar, `--network host` для service-контейнера).
2. Полный `mvn test` одним процессом в песочнице не проходит по памяти (KB-10) — состояние
   «весь сьют зелёный одним прогоном» подтверждено только побатчно; в CI (2 vCPU / 7 ГБ)
   ограничений нет, но и проверка CI здесь недоступна.
3. Реальная загрузка 65-МБ выгрузки ЕМИСС админом не выполнялась (нет живого файла такого
   объёма и портала из сети песочницы) — потоковый путь проверен на фикстуре 18 КБ и на
   синтетических потоках (переразмер, runaway, обрыв потока).
4. Поведение `LoginAttemptService` при N инстансах (счётчик per-node) не изменилось —
   ограничение задокументировано в javadoc ещё подзадачей 19 внутреннего аудита.
5. Фронтенд не менялся и не прогонялся (`node_modules` отсутствует): новые коды ошибок
   (413 `PAYLOAD_TOO_LARGE`, 409 `DATA_CONFLICT`, 409 `CONCURRENT_MODIFICATION`) UI показывает
   как есть из `detail`; целевой UX конфликта — `BL-41`/`BL-54`.
6. Пуш в `origin` не выполнялся — коммит локальный в ветке `master` (решение о пуше — за
   владельцем; AU-28/BL-39 как раз про запрет прямых пушей в основную ветку).

---

## Приложение: 30 задач внешнего аудита и куда они переоформлены

Оценка: **S** ≤ 0.5 дня · **M** 1–2 дня · **L** 3–5 дней · **XL** > 5 дней.
Суммарно аудит оценивал весь список в 45–60 чел.-дней.

| AU | Приоритет | Задача | Оценка | Куда переоформлено |
|---|---|---|---|---|
| AU-04 | P0 | Ограничить рост `LoginAttemptService` (DoS на login) | S | подзадача 1 — ГОТОВО |
| AU-03 | P0 | Убрать гонку `startSyncLog` частичным уникальным индексом | M | подзадача 3 — ГОТОВО |
| AU-14 | P0 | Обработчики 413 / 409 / 409-lock в `GlobalExceptionHandler` | S | подзадача 2 — ГОТОВО |
| AU-05 | P0 | Загрузка ЕМИСС: guard до `getBytes()`, поток вместо `byte[]`, queue=1 | M | подзадача 4 — ГОТОВО |
| AU-02 | P0 | Remedy для удалённых V14/V15 + гейт апгрейда существующей БД | M | подзадача 5 — ГОТОВО |
| AU-06 | P1 | Починить E2E-nightly, отделить real-mode от mock-прогона | M | BL-33, KB-18 |
| AU-07 | P1 | Включить coverage-гейт R5 в CI и расширить whitelist (44/102 файла) | M | BL-34, KB-25 |
| AU-09 | P1 | Снять `continue-on-error` с security-сканов, починив compose и nginx | M | BL-35, KB-19 |
| AU-10 | P1 | Dependabot + `npm audit` в CI + фикс CVE react-router/uuid | S | BL-36, KB-21 |
| AU-11 | P1 | Одна версия Java в pom, CI, nightly и Dockerfile | S | BL-37 |
| AU-12 | P1 | nginx: CSP/security-заголовки, XFF, gzip, кэш ассетов, таймауты | M | BL-38, KB-20 |
| AU-28 | P1 | Branch protection + conventional commits + запрет push в main | S | BL-39, KB-22 |
| AU-01 | P1 | Обновить Spring Boot 3.2.5 → актуальную поддерживаемую линию | XL | BL-40 (отдельный план), KB-17 |
| AU-13 | P2 | `@Version` на изменяемых агрегатах + UX конфликта на фронте | L | BL-41, KB-24 |
| AU-08 | P2 | JaCoCo-гейт на backend + unit-тесты на 23 сервиса без покрытия | XL | BL-42 (отдельный план) |
| AU-24 | P2 | Удалить 8 неиспользуемых зависимостей, навести порядок в `package.json` | S | BL-43 |
| AU-17 | P2 | Включить e2e и конфиги в typecheck | S | BL-44 |
| AU-22 | P2 | Заменить гейт «Check MD files» на проверку белого списка AGENTS §1 | S | BL-45 |
| AU-26 | P2 | Убрать BOM из 5 файлов + гейт в CI | S | BL-46, KB-26 |
| AU-20 | P2 | Заменить `react-datepicker`, добавить бюджет-гейт размера бандла | L | BL-47 |
| AU-16 | P2 | ESLint 9 flat config + jsx-a11y + реализация правила hex-токенов | M | BL-48 |
| AU-27 | P2 | Профиль-зависимая санитизация `detail` в ответах об ошибках | M | BL-49, KB-27 |
| AU-25 | P2 | Docker/compose hardening: digest-пины, non-root, лимиты, HEALTHCHECK | M | BL-50 |
| AU-29 | P2 | Обновить GitHub Actions, запинить runner-образ | S | BL-51 |
| AU-18 | P2 | Решение по мок-слою: вырезать из прод-сборки или явный демо-режим | L | BL-52 (нужен владелец), KB-23 |
| AU-19 | P2 | Закрыть 5 неотслеживаемых нарушений R8 (> 500 строк) | L | BL-53 (расширяет KB-14) |
| AU-15 | P2 | Декомпозировать `GlobalExceptionHandler`, добавить traceId в тело ошибки | M | BL-54 |
| AU-21 | P2 | Doc-consistency pass + линкер битых ссылок в CI | M | BL-55 |
| AU-23 | P3 | Вычистить мусор и мёртвый код из репозитория | S | BL-56 |
| AU-30 | P3 | Согласовать порт dev-сервера (3000 vs 5173) | S | BL-57 |

Содержательное «что сделать / критерий приёмки» по каждой отложенной задаче — в записи
`BL-n` (`plans/backlog.md`); симптомы и влияние дефектных находок — в `KB-n`
(`plans/knownbugs.md`).
