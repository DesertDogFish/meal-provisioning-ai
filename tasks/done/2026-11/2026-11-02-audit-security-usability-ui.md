# Plan: Аудит 02.11.2026 — security, usability, UI, связанность, стандарты

Status: DONE
Created: 2026-11-02
Closed: 2026-11-02

## Цель

Устранить находки полного аудита приложения от 02.11.2026 (безопасность, юзабилити,
UI/дизайн-система, связанность слоёв, стандарты репозитория). Аудит выполнен на HEAD
`75a8e1c` в песочнице агента; две находки — блокирующие (backend не стартует, CI-гейт
покрытия не работает), они доказаны прогонами (см. «Контекст» и подзадачи 1–2).

## Контекст

- Правила: `AGENTS.md` (§2 планы, §3 Plan→Implement, §9 ритуал, §11 миграции, R1–R11).
- Предыдущие аудиты: `plans/done/2026-10-29-full-audit.md`,
  `plans/done/2026-10-30-external-audit-p0-block.md` (BL-33…BL-57), серия UX-аудитов
  `plans/done/2026-10-31-ux-audit-*.md`. Настоящий план НЕ дублирует их скоуп: он берёт
  только то, что осталось вне живых реестров, плюс новые дефекты коммитов 01.11.2026
  (`ebb3a1b` «ux plan fix», `2ab57fb`/`75a8e1c`).
- Доказательства из песочницы (01–02.11.2026):
  - `SnapshotIsolationIntegrationTest` — 3/3 ERROR:
    `org.flywaydb.core.api.FlywayException: Found more than one migration with version 30`
    (лог `/tmp/mvn-snapshot-test.log` в сессии аудита);
  - `mvn -B -ntp -o jacoco:check@coverage-gate` (команда CI-шага) —
    `ERROR ... The parameters 'rules' for goal ...:check are missing or invalid`;
  - `git log --all -- eslint.config.js .github/dependabot.yml` — пусто (файлы никогда
    не существовали, хотя архивные карточки BL-48/BL-51 помечены «ГОТОВО 01.11.2026»);
  - `docker-compose.yml` — backend `ports: "8080:8080"` (0.0.0.0);
  - `nginx.conf` CSP `style-src 'self' 'unsafe-inline'; font-src 'self'` против
    `<link href="https://fonts.googleapis.com/...">` в `index.html` — шрифты бренда
    в prod блокируются;
  - `vercel.json` — секции `headers` нет (публичное демо без security-заголовков);
  - `src/components/ProblemDetailAlert.tsx` — 20 классов сырой палитры Tailwind
    (`bg-amber-50` и т.п.) при запрете дизайн-пака («никаких hex/цветов вне токенов»,
    `provisions/design-pack/AGENTS.md`);
  - `src/pages/LoginPage.tsx` — нет `autoComplete`, `<label>` не связаны с input,
    блок ошибки без `role="alert"`;
  - `src/index.css` — 2292 строки (R8);
  - ограничения песочницы: 2 vCPU / ~1 ГБ RAM — тяжёлые сьюты
    (`UserPricesIntegrationTest`, `EconomicConsistencyTest`, `DockerStackSmokeTest`)
    не запускались (лимит памяти, не вердикт); frontend-гейты не запускались
    (нет `node_modules`); нет `gh`/git-credentials — CI не проверялся.
- Реестры: дефекты аудита зарегистрированы как KB-36…KB-39 (`plans/knownbugs.md`),
  отложенные работы — BL-63 (восстановлена)…BL-66 (`plans/backlog.md`).

## Подзадачи (максимум 10)

### 1. P0 — Flyway: дубль версии V30 + пропущенная колонка `version` (→ KB-36)

- ID: 1
- Файлы:
  - `backend/src/main/resources/db/migration/V30__optimistic_locking_version.sql`
    (переименовать в `V34__optimistic_locking_version.sql` + дописать блок);
  - `backend/README.md` (§Миграции), `ARCHITECTURE.md` (§Database) — по карте R11.
- Зависимости: нет.
- Действия:
  1. Что не так: в дереве два файла версии 30 — `V30__ingredient_prices_latest_index.sql`
     (в дереве с 29.10.2026, применён на БД владельца) и `V30__optimistic_locking_version.sql`
     (добавлен `ebb3a1b` 01.11.2026). Flyway падает на resolve ДО применения чего-либо:
     «Found more than one migration with version 30» — backend не стартует вовсе, все
     `@SpringBootTest` красные (доказано прогоном в песочнице). Нарушен `AGENTS.md` §11
     («следующий свободный номер = максимум + 1»).
  2. Второй дефект той же партии: `@Version private Long version` добавлен в 8 сущностей
     (включая `TripChecklistBought`), а миграция добавляет колонку `version` только 7 таблицам —
     `trip_checklist_bought` (V32) пропущена. После устранения дубля старт убьёт
     `ddl-auto=validate` (Schema-validation: missing column [version]).
  3. Как правильно: `git mv V30__optimistic_locking_version.sql V34__optimistic_locking_version.sql`
     (переименование безопасно: из-за дубля Flyway нигде не успел её применить — resolve
     падает до migrate; применённый `V30__ingredient_prices_latest_index.sql` НЕ трогать — §11).
     Внутри V34 дописать восьмой блок по образцу остальных:
     `IF NOT EXISTS (... table_name='trip_checklist_bought' AND column_name='version') THEN
     ALTER TABLE trip_checklist_bought ADD COLUMN version BIGINT NOT NULL DEFAULT 0; END IF;`
     (повторный прогон безопасен — тот же паттерн IF NOT EXISTS).
  4. Документация в том же коммите (R11): `backend/README.md` — «Flyway V1–V33» встречается
     дважды (строки ~10 и ~38) и в §Миграции (~148): привести к факту (V34) либо, лучше,
     к ссылке на каталог `db/migration/` (подход BL-55 — число в прозе стареет молча);
     пункт о V34 в список миграций; `ARCHITECTURE.md` §Database — снепшот версий.
- Критерии приёмки:
  - `MAVEN_OPTS="-Xmx192m" mvn -B -o test -Dtest='SnapshotIsolationIntegrationTest' ...`
    (per-class, argLine по ограничениям песочницы) — зелёный;
  - `FlywayUpgradeIntegrationTest` и `ChecklistBoughtIntegrationTest` — зелёные
    (проверка existing-DB и validate);
  - `docker compose up` — backend стартует, `/api/v1/meta` 200;
  - в `db/migration/` нет двух файлов с одинаковым `Vn`;
  - README/ARCHITECTURE не расходятся с фактом.
- Статус: [x] DONE

### 2. P0 — CI-гейт покрытия JaCoCo не работает (→ KB-37)

- ID: 2
- Файлы: `backend/pom.xml` (profile `coverage-gate`), `.github/workflows/ci.yml`
  (job `backend`, шаг «Coverage gate (JaCoCo lines >= 60%)», ~строка 95).
- Зависимости: 1 (иначе job `backend` краснее раньше, на тестах).
- Действия:
  1. Что не так (три независимых слоя, все три ломают гейт):
     - CI вызывает `mvn -B -ntp jacoco:check@coverage-gate`, но в pom execution имеет
       id `coverage-check` и живёт в профиле `coverage-gate`, который CI не активирует
       (нет `-P coverage-gate`). Замер в песочнице той же командой:
       `ERROR ... The parameters 'rules' for goal ...:check are missing or invalid` —
       шаг падает на каждом прогоне (CI красный «не по делу») и НИЧЕГО не измеряет;
     - даже с `-P coverage-gate` селектор `@coverage-gate` не совпадёт с id `coverage-check`;
     - `<threshold>60</threshold>`: у JaCoCo `COVEREDRATIO` — доля 0.0–1.0, «60» = 6000 % —
       корректно вызванный гейт не проходил бы никогда.
  2. Как правильно: в pom — переименовать execution id в `coverage-gate` (совпасть с именем
     профиля — меньше путаницы), `<threshold>0.60</threshold>` + явный
     `<valueType>COVEREDRATIO</valueType>`; в ci.yml — `mvn -B -ntp -P coverage-gate
     verify -DskipTests jacoco:check@coverage-gate` ЛИБО (проще) привязать check к фазе
     `verify` внутри профиля и вызывать `mvn -B -ntp -P coverage-gate verify` одним шагом
     вместе с тестами (exec-файл от `prepare-agent` уже на месте). Шаг ставить ПОСЛЕ
     «Backend tests» (нужен `target/jacoco.exec`).
  3. Публиковать измеренный процент в `$GITHUB_STEP_SUMMARY` (приём BL-34 — две цифры;
     сам BL-34 про frontend-гейт R5, не смешивать).
  4. Порог 60 % согласовать с BL-42 (там старт 50 % non-blocking → 70 %): зафиксировать
     одно число и один механизм, чтобы два гейта не разъезжались.
- Критерии приёмки: локально `mvn -P coverage-gate verify` (per-class в песочнице) — гейт
  выполняется и печатает правило; при искусственном занижении покрытия (порог 0.99) сборка
  падает; шаг CI зелёный и публикует процент в summary.
- Статус: [x] DONE

### 3. P0 — Страж CI против дублей номеров миграций

- ID: 3
- Файлы: `.github/workflows/ci.yml` (job `hygiene`).
- Зависимости: 1.
- Действия:
  1. Что не так: дубль V30 дожил от коммита `ebb3a1b` до HEAD — ни один гейт не ловит
     «два файла с одним Vn» быстро и внятно (job `migration-upgrade` падает, но поздно
     и с тяжёлой диагностикой; «Backend tests» краснеют целиком).
  2. Как правильно: в job `hygiene` добавить шаг (bash, без внешних зависимостей):
     `dups=$(ls backend/src/main/resources/db/migration | grep -oE '^V[0-9]+' | sort | uniq -d)`;
     при непустом `dups` — `::error::` со списком и ссылкой на `AGENTS.md` §11
     («следующий номер = max + 1»), exit 1.
- Критерии приёмки: искусственно добавленный `V33__test_dup.sql` валит job `hygiene` за
  секунды; на HEAD (после подзадачи 1) шаг зелёный.
- Статус: [x] DONE

### 4. P1 — Auth-hardening: refresh-reuse, TTL из конфига, отдельный HMAC-ключ, лимиты register/refresh, пароль ≥ 8

- ID: 4
- Файлы:
  - `backend/src/main/java/com/provision/service/AuthService.java`;
  - `backend/src/main/java/com/provision/repository/RefreshTokenRepository.java`;
  - `backend/src/main/java/com/provision/entity/RefreshToken.java`;
  - новая миграция `V36__refresh_token_reuse_detection.sql` (номер — по факту дерева, §11;
    планировалась как V35, перенумерована после параллельного коммита владельца `5eb70f8c`,
    занявшего V35 под `trip_checklist_bought_version`);
  - `backend/src/main/java/com/provision/dto/auth/RegisterRequest.java`;
  - `src/pages/LoginPage.tsx`, `src/utils/validationMessages.ts`, `src/api/mockAuth.ts`
    (mock-паритет, R3), contract-тесты;
  - `ARCHITECTURE.md` §Security (R11).
- Зависимости: 1 (миграции снова могут запускаться).
- Действия:
  1. Refresh-reuse detection (сейчас отсутствует): при предъявлении уже ротированного
     токена `refreshTokens` отвечает 401 «token not found» — кража refresh-токена
     не обнаруживается, семья токенов не отзывается (OAuth Security BCP, раздел
     «refresh token replay»: reuse ДОЛЖЕН отзывать все токены пользователя).
     Как правильно: не удалять старый токен физически, а помечать
     (`revoked_at`/`replaced_by_id`, V36); в `refreshTokens`: hash найден и помечен
     → `deleteAllByUserId(...)` (или UPDATE revoke всех) + `log.warn("refresh reuse
     detected")` + метрика `auth.refresh.reuse` + 401. Физическая очистка истёкших —
     по `expiresAt` (ленивая, в том же запросе, или @Scheduled).
  2. TTL рассинхронизирован: `saveRefreshToken` пишет `LocalDateTime.now().plusDays(7)`
     хардкодом, хотя в `application.yml` есть `jwt.refresh-token-expiration: 604800000`
     и `JwtProperties.refreshTokenExpiration`. Правка: `Instant.now().plusMillis(
     jwtProperties.getRefreshTokenExpiration())`.
  3. Ключ HMAC для хэша refresh-токенов = `JWT_SECRET` (прямое переиспользование
     signing-ключа). Правка: деривация отдельного ключа —
     `HmacSHA256(key = HmacSHA256(JWT_SECRET, "provision-refresh-hash"))` или HKDF;
     задокументировать в ARCHITECTURE §Security; существующие хэши невалидны после
     смены — разовый перелогин (как было при переходе SHA-256→HMAC — прецедент в
     комментарии `hashToken`).
  4. Rate-limit `/auth/register` и `/auth/refresh`: сейчас без лимитов (LoginAttemptService
     — только login; nginx `limit_req` в BL-38 тоже только login). Минимально: расширить
     `LoginAttemptService` окном на «register» (ключ email, тот же потолок AU-04) и
     глобальный счётчик refresh-провалов с 429; полностью — после BL-38 (XFF → IP-ключ).
     В план не включать nginx-часть (не дублировать BL-38).
  5. Парольная политика: `@Size(min = 6)` в `RegisterRequest` — ниже NIST SP 800-63B
     (минимум 8, рекомендация до 64+). Правка: min 8, max оставить 100; RU-сообщение
     валидации на фронте (`validationMessages.ts`), mock-слой (`mockAuth.ts`) — та же
     политика (R3), contract-тест формы ошибки. Существующие пользователи не затрагиваются
     (хэши хранятся, проверка только при регистрации/смене пароля).
  6. Все правки — red→green (R1): сначала падающие тесты (`AuthServiceTest`/
     `AuthIntegrationTest`: reuse → семейство отозвано; TTL из свойства; register 429;
     пароль 7 символов → 400 с кодом).
- Критерии приёмки: новые тесты зелёные per-class в песочнице; повторное предъявление
  ротированного токена отзывает ВСЕ refresh-токены пользователя (проверено тестом);
  смена `JWT_REFRESH_TOKEN_EXPIRATION` (или `jwt.refresh-token-expiration`) реально меняет
  `expires_at` в БД; регистрация с паролем < 8 — 400 и в real, и в mock (contract-тест);
  ARCHITECTURE §Security обновлён.
- Статус: [x] DONE

### 5. P1 — prod-представление: CSP/шрифты, заголовки Vercel, цвета манифеста (→ KB-38)

- ID: 5
- Файлы: `nginx.conf`, `vercel.json`, `index.html`, `src/pwa/manifest.json`,
  (опция A) `public/fonts/**` + `src/index.css`/`tokens.css`-потребители,
  `README.md` (запуск/проблемы), `.env.example` — по карте R11.
- Зависимости: нет (но согласовать с BL-38 — не дублировать его скоуп).
- Действия:
  1. Что не так (шрифты): CSP nginx `style-src 'self' 'unsafe-inline'; font-src 'self'`,
     а `index.html` (строки ~41–47) грузит стили и файлы шрифтов с
     `fonts.googleapis.com`/`fonts.gstatic.com` → в docker-prod браузер блокирует оба
     запроса (CSP violation в консоли), брендовые Unbounded/Manrope НЕ применяются —
     весь prod-UI откатывается на системные шрифты, т.е. фактически не соответствует
     дизайн-паку. Это не «будущая настройка CSP» (BL-38), а живой дефект текущей сборки.
  2. Как правильно — вариант A (рекомендуется, решение владельца): self-host шрифтов —
     woff2 (Unbounded 500/700, Manrope 400–800, subset latin+cyrillic) в `public/fonts/`,
     `@font-face` в `src/index.css` (или tokens-слой), удалить `<link>`/`preconnect` на
     googleapis/gstatic из `index.html`. Плюс: CSP остаётся строгим, нет third-party
     зависимости (доступность из РФ, приватность), шрифты кэшируются SW (same-origin).
     Вариант B (минимальный): добавить в CSP `style-src https://fonts.googleapis.com` и
     `font-src https://fonts.gstatic.com`. Минус: third-party в CSP навсегда.
  3. `/assets/` location в nginx.conf: из-за правил наследования `add_header` server-уровень
     в нём НЕ действует, а вручную добавлены 4 заголовка из 5 — CSP отсутствует (SVG из
     assets отдаётся без CSP). Правка: добавить CSP в список `add_header` этого location
     (или вынести заголовки в include-файл и подключать в обоих местах).
  4. `Referrer-Policy: no-referrer-when-downgrade` → `strict-origin-when-cross-origin`
     (однострочник; входит и в BL-38 — сделать здесь, в BL-38 оставить пометку).
  5. Vercel-демо (публичное!) отдаётся БЕЗ единого security-заголовка: в `vercel.json`
     нет секции `headers`. Правка: добавить `headers` с тем же набором, что nginx
     (CSP с поправкой на шрифты, X-Content-Type-Options, X-Frame-Options/CSP
     frame-ancestors, Referrer-Policy, Permissions-Policy). HSTS — только при TLS
     (на Vercel — да: `Strict-Transport-Security: max-age=31536000; includeSubDomains`).
  6. `src/pwa/manifest.json`: `background_color: #1a1a2e`, `theme_color: #16213e` —
     чужая (не брендовая) палитра: токены темы — `--bg-0` dark `#0B141B` (фолбэк
     boot-лоадера в `index.html` тому свидетельство). Splash/статус-бар PWA выбиваются
     из бренда. Правка: привести к токенам дизайн-пака (dark `#0B141B` / light `#F5F2EB`
     через `theme_color` + media-вариант в `<meta name="theme-color">`), значение —
     из `tokens.json` (или генерация плагином pwaAssets из токенов — решение в подзадаче).
- Критерии приёмки: `docker compose up` → в консоли браузера нет CSP-нарушений, шрифты
  грузятся (Network: woff2 200 с same-origin или allowlisted-источника); `curl -I` на
  `/assets/*` содержит CSP; Vercel-деплой — `curl -I https://<demo>/` содержит все
  заголовки; splash PWA в цветах бренда (скрин в обеих темах); README/`.env.example`
  обновлены (R11).
- Статус: [x] DONE

### 6. P1 — compose: backend не должен торчать наружу; SEED_DEMO_USERS-дефолт

- ID: 6
- Файлы: `docker-compose.yml`, `README.md` («Частые проблемы»), `.env.example`,
  `ARCHITECTURE.md` (схема деплоя) — по карте R11.
- Зависимости: нет (дополняет BL-35/BL-50 — они про hardening контейнеров, не про порты).
- Действия:
  1. Что не так: `backend.ports: "8080:8080"` публикует API на 0.0.0.0 — на публичном
     хосте эндпоинты доступны МИМО nginx: без security-заголовков, без `limit_req`,
     без `client_max_body_size`, без access-лога. Postgres уже корректно на
     `127.0.0.1:5432`. Фронт ходит в backend через docker-сеть — публикация не нужна.
  2. Как правильно: убрать `ports` у backend; для локальной отладки —
     `docker-compose.override.yml` (в `.gitignore`) или отдельный profile `debug` с
     `127.0.0.1:8080:8080`. Healthcheck не страдает (внутренний).
  3. `.env.example`: `SEED_DEMO_USERS=true` — дефолт шаблона; копирование шаблона на
     публичный сервер сидирует демо-учётки `admin@provision.app`/`user@provision.app`
     (пароли случайные и печатаются в лог, но учётки с ролью ADMIN остаются). Правка:
     в шаблоне — `false` + комментарий; `true` — в dev-инструкции/`dev.ps1`.
- Критерии приёмки: `docker compose up -d` → снаружи `curl :8080/api/v1/meta` НЕ отвечает,
  через фронт `/api/v1/meta` — 200; healthchecks зелёные; `docker-stack.yml` не сломан;
  README описывает override для отладки.
- Статус: [x] DONE

### 7. P1 — Дизайн-система: сырая палитра Tailwind → токены (берёт BL-63)

- ID: 7
- Файлы: `src/components/ProblemDetailAlert.tsx`, `src/components/DatePicker.tsx`
  (строка ~56), `src/pages/LoginPage.tsx`, `src/index.css` (классы `.alert--*`),
  тесты компонентов; `plans/backlog.md` (карточка BL-63 восстановлена этим аудитом).
- Зависимости: нет; желательно после 5 (общая ревизия стилей).
- Действия:
  1. Что не так: `ProblemDetailAlert.tsx` (строки 25–39) маппит статусы на классы сырой
     палитры Tailwind — `bg-amber-50 border-amber-200 text-amber-900` и т.д. (20 штук).
     Это (а) нарушение дизайн-пака: «компонент не знает о теме», цвета только токенами
     (`provisions/design-pack/AGENTS.md`); (б) палитра *-50/*-900 — только светлая:
     в тёмной теме (дефолт приложения) алерт рисуется белесой коробкой — визуальный брак,
     который не поймали скрин-регрессы (компонент всплывает редко).
     `DatePicker.tsx:56` — `border-red-500`/`border-gray-600` (те же проблемы).
     `LoginPage.tsx` — deprecated-алиасы `--surface/--border/--text/--elev/--muted/--w1`
     (в `src/index.css` помечены `@deprecated`): перевести на канонические
     `--bg-1/--line/--text-1/--text-2/--wave-400`.
  2. Как правильно: завести в `src/index.css` классы `.alert`, `.alert--danger|warn|info|ok`
     по образцу уже переведённых на токены `.toast*` (строки ~262–300): `--tint`/`--accent`
     из `--danger-soft`/`--danger` и т.п., `color-mix` для границ; в компоненте — маппинг
     `getErrorColor()` → имя класса, никаких Tailwind-цветов. Обе темы проверить скринами.
  3. Тосты уже на токенах (переведены `ebb3a1b`) — в BL-63 остаётся перечисленный выше
     остаток; карточка BL-63 восстановлена в реестре (номер ссылался из PLAN.md и
     `plans/done/2026-10-31-ux-audit-visual-inspection.md`, но карточка отсутствовала —
     нарушение сквозной нумерации §2).
  4. Защитой от регресса будет hex-правило ESLint из BL-48 (пока НЕ сделано — живой
     BL-48 остаётся в силе, см. подзадачу 9).
- Критерии приёмки: `grep -rE "(bg|text|border)-(red|green|blue|amber|orange|slate|purple|gray)-[0-9]" src --include='*.tsx'`
  вне тестов пуст; `LoginPage.tsx` не использует `@deprecated`-алиасы; скрин-регресс
  алерта в тёмной и светлой теме (контраст ≥ 4.5:1 по BL-62-принципу); vitest-компонент
  проверяет алерт в обеих темах; existing-тесты не сломаны.
- Статус: [x] DONE

### 8. P2 — LoginPage: autocomplete, связка label/input, озвучка ошибок

- ID: 8
- Файлы: `src/pages/LoginPage.tsx`, `src/pages/LoginPage.test.tsx`,
  `src/test/a11y.ts` (хелпер), `src/components/ProblemDetailAlert.tsx` (role).
- Зависимости: 7 (если алерт переносится в ProblemDetailAlert — сначала токены).
- Действия:
  1. Что не так:
     - у полей нет `autoComplete` (`email`, `current-password` в режиме входа;
       `new-password`, `given-name`, `family-name` в режиме регистрации) и нет атрибутов
       `name`/`id` — менеджеры паролей не предлагают сохранение и не заполняют форму;
       для приложения с паролями это базовый гигиенический атрибут (и удобство, и
       безопасность — пользователи не пишут пароли на стикерах);
     - `<label>` не связаны с `<input>` (нет `htmlFor`/`id`) — доступное имя поля пустое
       (placeholder не замена); a11y-проход 31.10 чинил иконочные кнопки, поля форм
       не покрыты;
     - блок ошибки входа (`{error && <div ...>}`) без `role="alert"`/`aria-live` —
       скринридер молчит при неудачном логине;
     - placeholder `you@example.com` при полностью русской форме (копи-консистентность,
       решение владельца: `ivan@example.com` или оставить).
  2. Как правильно: каждой паре label/input — `id`+`htmlFor`; `autoComplete` по режиму
     (`isRegister ? 'new-password' : 'current-password'`); контейнеру ошибки —
     `role="alert"`; `name`-атрибуты на input. Тесты: ассерты на атрибуты в
     `LoginPage.test.tsx` + прогон a11y-хелпера (nameless = 0).
- Критерии приёмки: vitest зелёный; в браузере менеджер паролей предлагает сохранение
  после логина; ошибка входа объявляется скринридером (role=alert в DOM);
  `npm run lint`/`tsc` без регрессий.
- Статус: [x] DONE

### 9. P2 — Целостность реестров и документации (→ KB-39; правки живых карточек)

- ID: 9
- Файлы: `plans/backlog.md`, `plans/done/backlog.md`, `plans/done/knownbugs.md`,
  `PLAN.md`, `README.md`, `ARCHITECTURE.md`, `backend/README.md`, `src/App.tsx`
  (комментарий Fix-10), `.github/workflows/ci.yml` (если понадобится пометка в шаге).
- Зависимости: 1, 2 (фактические состояния для сверки).
- Действия:
  1. Что не так (реестры — нарушение `AGENTS.md` §2 и R6):
     - BL-48 и BL-51 присутствуют ОДНОВРЕМЕННО в живом реестре (READY) и в архиве
       («ГОТОВО 01.11.2026») — номер обязан находиться ровно в одном файле;
     - архивные записи BL-48/BL-51 ложны относительно HEAD и всей истории git:
       `eslint.config.js` и `.github/dependabot.yml` никогда не коммитились
       (`git log --all` пуст), `.eslintrc.cjs`/eslint ^8.55 на месте, `jsx-a11y` нет,
       `trivy-action@master` не заменён тегом — «ГОТОВО» зафиксировано без проверки (R6);
     - BL-63 ссылается из PLAN.md и закрытого плана visual-inspection, но карточка
       не зарегистрирована ни в живом реестре, ни в архиве (восстановлена этим аудитом);
     - BL-47 READY, хотя `react-datepicker` уже удалён из зависимостей и кода (`ebb3a1b`) —
       остаток только бюджет-гейт бандла;
     - BL-61 READY, хотя все четыре мёртвые страницы фактически удалены тем же `ebb3a1b`
       (остаток — прогон гейтов, в песочнице не выполнялся);
     - BL-53: текст повреждён (дважды перечислен `MealCompositionModal.tsx`), включает
       удалённый `SyncLogsPage.tsx` и НЕ включает новые нарушения R8: `RecipesPage.tsx`
       (616 строк), `RecipeEditorModal.tsx` (512 строк);
     - KB-24/KB-25 (архив) закрыты 01.11.2026, но работа не функционирует — остатки
       перерегистрированы этим аудитом как KB-36/KB-37 (правило «частично выполненная
       запись → остаток под новым номером со ссылкой на предшественника»).
  2. Как правильно. Часть правок УЖЕ внесена при оформлении аудита 02.11.2026 (живые
     реестры и PLAN.md): BL-63 восстановлена, BL-64…BL-66 созданы, живые карточки
     BL-47/BL-61 — «ЧАСТИЧНО ГОТОВО» с фактами, BL-48/BL-51 — пометки аудита (архивная
     копия опровергнута), BL-53 — исправлен текст (дубль перечисления, SyncLogsPage вычеркнут,
     добавлены RecipesPage/RecipeEditorModal), PLAN.md — ссылка на этот план. Остаток на
     сессию реализации: (а) архивные записи BL-48/BL-51 в `plans/done/backlog.md` НЕ
     переписывать, а дополнить датированной строкой «ОСПОРЕНО аудитом 02.11.2026: файлы
     отсутствуют в HEAD и в истории git» — отклонение от «текст сохранён как на момент
     закрытия» осознанное, требует подтверждения владельца (альтернатива — оставить в архиве
     недостоверные «ГОТОВО»); (б) в архиве `plans/done/knownbugs.md` у KB-24/KB-25 добавить
     указатель, что остаток перерегистрирован (правило «частично выполненная запись → остаток
     под новым номером со ссылкой на предшественника»); (в) контрольная сверка: каждый номер
     BL/KB находится ровно в одном живом реестре или в архиве (с учётом осознанных пометок).
  3. Документация (R11) — расхождения, найденные аудитом:
     - PWA (sw.js/manifest, добавлены `ebb3a1b`) не упомянуты НИ в README.md, ни в
       ARCHITECTURE.md (grep пуст) — добавить раздел: стратегии кэширования, что НЕ
       кэшируется (/api, /auth), регистрация только в PROD, offline-поведение;
     - `backend/README.md` «Flyway V1–V33» → факт после подзадачи 1 (V34) — см. п.1;
     - `src/App.tsx` комментарий Fix-10 перечисляет «recharts, datepicker, framer-motion»
       — этих библиотек в проекте больше нет (удалены по BL-43), комментарий привести к факту;
     - README: запуск без публикации :8080 (подзадача 6), заголовки Vercel (подзадача 5).
- Критерии приёмки: каждый номер BL/KB znajduje grep'ом ровно в одном из двух реестров
  (кроме осознанных приписок-опровержений в архиве); в живых реестрах нет карточек,
  описывающих уже сделанное как предстоящее; README/ARCHITECTURE содержат PWA;
  `git ls-files '*.md'` — только белый список §1.
- Статус: [x] DONE

### 10. P2 — 404 для неизвестных API-путей + мелочи мокового паритета (→ BL-65)

- ID: 10
- Файлы: `backend/src/main/java/com/provision/exception/GlobalExceptionHandler.java`,
  новый тест `backend/src/test/java/com/provision/integration/UnknownRouteIntegrationTest.java`
  (или @WebMvcTest-слой по R2), `src/api/mockServer.ts`, `src/api/mode.ts` (если версия
  берётся из мета), contract-тесты.
- Зависимости: 1.
- Действия:
  1. Гипотеза (требует подтверждения red-тестом, R1/R6 — не утверждаем без прогона):
     неизвестный путь `/api/v1/...` в Spring Boot 3.2 даёт `NoResourceFoundException`
     (или `NoHandlerFoundException`), у `GlobalExceptionHandler` для них нет обработчика,
     и их перехватывает `@ExceptionHandler(Exception.class)` → 500 «An unexpected error
     occurred» вместо 404. Mock-слой при этом отдаёт 404 (`Route ... not implemented in
     mock`) — паритет форм ответа нарушен. Проверить тестом; если подтверждается —
     добавить обработчик(и) → 404 ProblemDetail через фабрику `build(...)`, тест
     MockMvc + contract-фикстура; если Spring отдаёт 404 сам — зафиксировать результат
     проверки в «Результатах» плана и закрыть пункт без правок.
  2. Мок-паритет `/meta`: `mockServer.ts` возвращает `version: '1.0.0'` (в `backend/pom.xml`
     — 1.0.1) и `build: new Date().toISOString()` (backend — фиксированный `startedAt`).
     Версия mock — из единого источника (константа сборки/`package.json` при его
     появлении) или строка `'mock'`; `build` — статичная дата запуска сессии mock.
     Contract-тест формы `/meta` обновить.
  3. Repro-файл (в BL-65): судьба `src/pages/RecipesEditRepro.test.tsx` — отладочный repro:
     переименовать в сценарный (`RecipesPage.editIngredient.test.tsx`) или удалить, если
     покрыт `RecipesPage.test.tsx` (комментарий `src/App.tsx` — в подзадаче 9.3, в BL-65
     не входит).
- Критерии приёмки: `GET /api/v1/definitely-not-here` c валидным токеном → 404
  ProblemDetail (тест); mock и real отдают одинаковую ФОРМУ `/meta` (contract-тест);
  repro-файла нет или он переименован; vitest/per-class mvn зелёные.
- Статус: [x] DONE

## CI

- Workflow run: нет, CI не проверено (в песочнице нет `gh`/git-credentials — статус
  «не проверено» по `AGENTS.md` §5/§10).
- Baseline HEAD `75a8e1c` (по замерам в песочнице, не по GitHub):
  - job `backend` — красный: интеграционные тесты падают на KB-36 (Flyway-дубль V30,
    доказано `SnapshotIsolationIntegrationTest` 3/3 ERROR); шаг «Coverage gate» красный
    на KB-37 (`rules missing`) — даже после починки тестов;
  - job `migration-upgrade` — красный на KB-36 (текущее дерево не стартует);
  - job `frontend` — в песочнице не прогонялся (нет node_modules; npm ci не выполнялся
    по ограничению среды — аудит не правил фронтенд);
  - тяжёлые сьюты `UserPricesIntegrationTest`, `EconomicConsistencyTest`,
    `DockerStackSmokeTest` — НЕ прогонялись из-за лимита памяти песочницы (~1 ГБ,
    OOM-kill 137 даже при -Xmx256m; проверено на чистом HEAD ранее) — это ограничение
    среды, а не вердикт «падает».
- Прогон в песочнице (per-class, по ограничениям 2 vCPU/1 ГБ):
  `SnapshotIsolationIntegrationTest` — 3 ERROR (ожидаемо, KB-36);
  unit-слой зелёный: `JwtPropertiesValidationTest` + `GlobalExceptionHandlerErrorCodeTest`
  + `EmisUnitTest` — 27/27 passed (offline-прогон 01.11.2026) — т.е. падает именно
  интеграционный слой на Flyway-дубле, а не код приложения.

## Known bugs

Дефекты, зарегистрированные аудитом в `plans/knownbugs.md` (все взяты этим планом):

- → KB-36 (backend не стартует: дубль V30 + пропущенная колонка `version` у
  `trip_checklist_bought`) — подзадача 1;
- → KB-37 (CI-гейт JaCoCo не измеряет покрытие и падает сам) — подзадача 2;
- → KB-38 (prod: CSP блокирует брендовые шрифты; Vercel без security-заголовков;
  манифест PWA в чужой палитре) — подзадача 5;
- → KB-39 (реестры: дубли BL-48/BL-51 живые+архив, архивные «ГОТОВО» опровергнуты HEAD,
  BL-63 отсутствовала) — подзадача 9.

## Backlog

За скоупом плана (зарегистрировано аудитом в `plans/backlog.md`):

- → BL-64 — декомпозиция монолита `src/index.css` (2292 строки, R8/R9);
- → BL-65 — мелочи дрейфа и мок-паритета (часть взята подзадачей 10: `/meta`, App.tsx,
  repro-тест — карточка описывает остаток);
- → BL-66 — 404-маршрут для аутентифицированных (catch-all → /login без обратной связи).
- BL-63 — восстановлена аудитом (токены вместо сырой палитры), взята подзадачей 7.
- Живые карточки BL-47/BL-48/BL-51/BL-53/BL-61 актуализированы аудитом при оформлении
  02.11.2026 (факты HEAD); подзадача 9 — контроль и правки архива (решение владельца).
- Остальное уже в живых реестрах и этим планом не дублируется: BL-34…BL-43, BL-45,
  BL-49, BL-50, BL-52→(в архиве), BL-54, BL-55, BL-59, BL-60, BL-62; KB-9/10/16/17/22.

## Результаты

Закрыт 02.11.2026 в песочнице агента (2 vCPU / ~1 ГБ, без Docker-демона, без gh/git-credentials).
Все 10 подзадач выполнены; red→green соблюдён для подзадач 1, 2, 4, 7, 8, 10.

### По подзадачам

1. **KB-36 (P0, Flyway)** — ГОТОВО (сведено с параллельным коммитом владельца `5eb70f8c`):
   дубль `V30__optimistic_locking_version.sql` живёт как `V34__...` (переименование владельца,
   содержимое не правилось), пропущенная колонка `trip_checklist_bought.version` — отдельная
   `V35__trip_checklist_bought_version.sql` (вариант владельца принят как канон; рабочий вариант
   плана «8-й блок внутри V34» отменён — опубликованные миграции не правятся), мой страж дублей
   номеров в ci.yml (job Repo Hygiene) оставлен. Red: `SnapshotIsolationIntegrationTest` 3/3
   ERROR на HEAD `75a8e1c` → Green: 3/3 passed (повторно проверено после сведения).
2. **KB-37 (P0, JaCoCo-гейт)** — ГОТОВО: execution id `coverage-gate` + фаза verify в профиле;
   `<value>COVEREDRATIO</value>` + `<minimum>0.60</minimum>`; ci.yml — один шаг
   `mvn -B -ntp -P coverage-gate verify`, процент LINE в `$GITHUB_STEP_SUMMARY`, отчёт артефактом.
   Замер песочницы: **LINE 68.4 % (3418/4999)** — UNIT-батч 237/237 + 16 Spring-сьютов per-class
   с javaagent JaCoCo (forkCount=0; без трёх тяжёлых сьютов — в CI не ниже). Позитив: BUILD SUCCESS
   «All coverage checks have been met»; негатив (0.99): «Rule violated … 0.68 … minimum is 0.99»
   → BUILD FAILURE. Отклонение от текста плана: параметр `valueType` в JaCoCo 0.8.12 не существует
   (ошибка парсинга mojo) — использован корректный `<value>`, доказано запуском. BL-42: поправка
   о согласовании (одно число 0.60, один механизм) внесена в живую карточку.
3. **Страж дублей миграций (P0)** — ГОТОВО: шаг «No duplicate migration versions» в job Repo
   Hygiene ci.yml (grep по `V(\d+)__`, дубль → ::error + exit 1); проверен локально на синтетике
   (дубль V30 ловится), в дереве дублей нет.
4. **Auth-hardening (P1)** — ГОТОВО: reuse-detection refresh (V36 `refresh_token_reuse_detection`:
   `replaced_by_token_hash`, семейный отзыв), `noRollbackFor` на стороне сервиса (урок AUTH-11:
   side-effect до throw в @Transactional откатывался), TTL из `JwtProperties` (Duration), деривация
   HMAC-ключа refresh-хэшей (label «provision-refresh-hash»), rate-limit register/refresh
   (`LoginAttemptService`: register — ключ `register:<email>`, потолок 5 попыток на окно 15 мин,
   блокировка 15 мин + 429/Retry-After; refresh — единый глобальный ключ `refresh:__global__`
   с повышенным потолком; cap отслеживаемых окон (50 000) против исчерпания памяти), пароль ≥ 8 (`RegisterRequest`, `mockAuth` —
   паритет R3), метрика `auth.refresh.reuse`. Тесты: `AuthIntegrationTest` 10/10 (red→green),
   `AuthServiceTest`, contract-тест `contractAuth.test.ts`, фронт 26/26. ARCHITECTURE §Security обновлён.
   Миграция перенумерована V35→V36 после коммита владельца `5eb70f8c` (V35 занят); ссылки в
   javadoc `RefreshToken` и заголовке SQL синхронизированы.
5. **KB-38 (P1, prod-представление)** — ГОТОВО: шрифты self-host (`public/fonts/`, 4 woff2,
   `@font-face` после `@import "tailwindcss"`), googleapis/gstatic убраны из `index.html`;
   nginx `/assets/` — CSP + полный комплект заголовков; `vercel.json` — headers (CSP, XFO DENY,
   nosniff, Referrer-Policy); манифест PWA — `#0B141B` (токен). README «PWA и шрифты»,
   ARCHITECTURE Deployment. Docker-prod не проверялся (нет демона) — статическая выверка.
6. **Compose (P1)** — ГОТОВО: `8080:8080` убран из `docker-compose.yml` (backend только во
   внутренней сети, наружу — nginx), debug-оверлей `docker-compose.debug.yml`
   (COMPOSE_FILE-механика), `.env.example`/`dev.ps1`/`docker-stack.yml`/`e2e-nightly.yml`
   обновлены, SEED_DEMO_USERS задокументирован. `docker compose config` не проверялся (нет демона).
7. **BL-63 (P1, токены)** — ГОТОВО: `ProblemDetailAlert` → `.alert--{danger,warn,info,neutral}`
   на токенах + `ProblemDetailAlert.test.tsx`; `DatePicker` → `var(--danger)`/`var(--line)`;
   `LoginPage` без `@deprecated`-алиасов. Приёмочный grep сырой палитры по не-тестовым .tsx пуст.
   Контраст ≥ 4.5:1 — расчётом по токенам; скриншоты не сняты (KB-16). Отклонение: добавлен
   класс `.alert--neutral` сверх маппинга плана (нужен info-состояниям) — решение исполнителя.
8. **LoginPage a11y/автозаполнение (P2)** — ГОТОВО: `autoComplete="email"/"current-password"`,
   связка label↔input (htmlFor/id), озвучка ошибок (`role="alert"` условным рендером, не hidden),
   клиентская проверка пароля ≥ 8 с копией `passwordTooShort()`; плейсхолдер `you@example.com` →
   `ivan@example.com` (реалистичный пример — триггер автозаполнения; не сид-пользователь).
   Тесты: LoginPage 10/10 (red→green). Попутно: 5 e2e-спек обновлены под новый плейсхолдер
   (`getByPlaceholder('ivan@example.com')`), `typecheck:all` зелёный.
9. **KB-39 (P2, реестры)** — ГОТОВО: опровержения BL-48/BL-51 в архиве (датированные приписки,
   исходный текст сохранён), KB-22 — архивная копия заменена заглушкой, KB-24/25 — поправки-указатели
   на KB-36/37, восстановлены потерянные KB-26/KB-27, BL-49 — поправка (ядро KB-27 выполнено,
   остаток traceId/ErrorResponseFactory), BL-53 — сверка чисел с HEAD (GEH 516→542 после подзадачи 10),
   App.tsx Fix-10 — комментарий по фактам, PWA описан в README/ARCHITECTURE. Контрольная сверка:
   все номера BL/KB определены, live∩archive — только документированные пересечения; MD — белый список.
10. **BL-65 + 404 API (P2)** — ГОТОВО: 404 ProblemDetail для неизвестных API-путей
    (`NoResourceFoundException`/`NoHandlerFoundException` → `handleUnknownRoute` в
    `GlobalExceptionHandler`), red (500) → green (`UnknownRouteIntegrationTest` 2/2);
    `/meta` мок-паритет (version `'mock'`, статичный build) + `contractMeta.test.ts` 3/3;
    repro-тест переименован в `RecipesPage.editIngredient.test.tsx`. BL-65 перенесена в архив;
    BL-66 (фронтовый catch-all) осталась живой — вне скоупа.

### Гейты (итоговые прогоны 02.11.2026, песочница)

- Backend: UNIT-батч 237/237; 16 Spring-сьютов per-class — все зелёные (включая
  `AuthIntegrationTest` 10/10, `UnknownRouteIntegrationTest` 2/2, `SnapshotIsolationIntegrationTest` 3/3).
  `UserPricesIntegrationTest`, `EconomicConsistencyTest`, `DockerStackSmokeTest` — НЕ ЗАПУСКАЛИСЬ
  (лимит памяти ~1 ГБ, OOM 137 даже при -Xmx256m; KB-10) — ограничение среды, не вердикт.
  JaCoCo LINE 68.4 % ≥ 0.60 (гейт сработал в обе стороны — см. подзадачу 2).
- Frontend: `npm run lint` — 0 errors (1 преэкзистентный warning EmisLinkPicker exhaustive-deps);
  `typecheck:all` (app+e2e+node) зелёный; `vitest run --coverage` — **935/935, 106 файлов**,
  lines 97.91 % (пороги vitest.config ≥ 80 на зоне — соблюдены); `npm run build` зелёный.
  e2e (Playwright) не запускались — KB-16 (OOM раннера в песочнице).
- **Workflow run: нет, CI не проверено** (в песочнице нет gh/git-credentials; правки ci.yml
  выверены синтаксически, шаги воспроизведены локально теми же командами, где позволяла память).
- Docker: демона нет — compose/nginx изменения не прогонялись, только статическая выверка.

### Сведение с параллельным пушем владельца (`5eb70f8c` «build fix», 02.11.2026 10:29 +03)

Во время выполнения плана владелец запушил в `main` коммит `5eb70f8c`, который независимо
устранял KB-36 (переименование V30→V34 + отдельная `V35__trip_checklist_bought_version.sql`)
и правил `ARCHITECTURE.md`, `backend/README.md`, `plans/knownbugs.md`. Выполнено сведение
(fast-forward на `5eb70f8c` + повторное применение незакоммиченных правок плана):
- вариант владельца по KB-36 принят как канон (моя V34 возвращена к его содержимому, 8-й блок
  отменён в пользу его V35); моя reuse-миграция перенумерована V35→**V36** (иначе дубль номера —
  ровно тот класс дефекта, который ловит новый CI-страж);
- строка владельца «upd V30… переименован в v34» сохранена в архивной карточке KB-36;
- конфликты в трёх MD решены объединением: дрейфоустойчивые формулировки диапазонов Flyway
  (источник правды — каталог миграций; хардкод «V1–V35» устарел бы сразу после V36), bullet'ы
  V34/V35/V36 в `backend/README.md` объединены;
- фактическая поправка к тексту владельца в `ARCHITECTURE.md` §Database: сущностей с `@Version`
  ровно **8**, а не «9 … и ещё одна» (сверено grep'ом по entity/);
- после сведения backend повторно проверен per-class: `SnapshotIsolationIntegrationTest` 3/3,
  `AuthIntegrationTest` 10/10, `UnknownRouteIntegrationTest` 2/2, `FlywayUpgradeIntegrationTest`
  зелёные; Flyway применяет 33 миграции до v36. Первый прогон после сведения падал
  «Found more than one migration with version 35» — в `target/classes/db/migration` осталась
  старая копия моей V35 (mvn не вычищает удалённые ресурсы); после её удаления и дропа
  загрязнённой `provision_upgrade_test` (в её истории лежали checksum НЕопубликованного
  варианта V34/V35 — артефакт песочницы, в CI дерево всегда чистое) всё зелёное. Оба урока
  записаны поправкой 4 в KB-10. Фронтенд коммит `5eb70f8c` не затрагивает — прогоны
  (935/935, lint, typecheck, build) остаются действительны.

### Внеплановые мелкие правки (задокументированы)

- `src/components/TripForm.test.tsx`: преэкзистентная на HEAD lint-ошибка (unused `endInput`)
  блокировала шаг `npm run lint` в CI (job frontend красный на HEAD) — снята одной строкой
  (деструктуризация без неиспользуемой переменной); тест зелёный.
- 5 e2e-спек: плейсхолдер `you@example.com` → `ivan@example.com` (синхронно с подзадачей 8).
- `src/utils/validation.ts`: `validateRegistration` — минимум пароля 6 → `PASSWORD_MIN_LENGTH` (8)
  с копией `passwordTooShort()` (паритет с backend/mockAuth, R3); найдено полным прогоном vitest
  (тест `validationMessages.test.ts` падал на устаревшей копии), обновлён контракт теста.

### Отклонения и решения владельца (флаги)

- Архивные записи BL-48/BL-51 сохранены с датированными опровержениями (история не переписывается);
  копия KB-22 в архиве заменена заглушкой — оба решения задокументированы в самих записях.
- Плейсхолдер логина `ivan@example.com` — пример, не существующий пользователь (сид-пользователи
  mock — `admin@provision.app`/`user@provision.app`); при желании владелец может заменить на свой пример.
- `.alert--neutral` добавлен сверх перечня подзадачи 7.
- Скриншоты алерта (критерий BL-63) и прогоны e2e/docker в песочнице невозможны (KB-16/нет демона) —
  контраст подтверждён расчётом, конфиги статически; в CI соответствующие джобы выполнят проверку.
