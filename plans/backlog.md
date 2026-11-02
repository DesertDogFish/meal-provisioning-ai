# Backlog — стек открытых задач

Единый стек задач, которые **не вошли в закрытые планы** (или остались за скоупом активной
задачи). Правила ведения — `AGENTS.md` §2 («Планы: папка `plans/`»).

- **Здесь только задачи**: что сделать → файлы → критерий приёмки → источник. Пересказа
  дефектов и номеров `KB-n` в этом файле нет — дефекты живут в `plans/knownbugs.md`
  (правило «в задачах — задачи, в багах — баги», `AGENTS.md` §2).
- Задача попадает сюда при закрытии плана из его секции `Backlog` (в самом плане остаётся
  указатель `BL-n`), а также когда мелкая правка не тянет на отдельный план.
- Оформленная запись находится в статусе `READY`, а не «в работе»: поле `Статус:` последней
  строкой записи. Работа начинается с первой правки кода — тогда запись получает
  `В РАБОТЕ` и ссылку на файл плана, который её взял.
- Задача крупнее 3 файлов или требующая архитектурного решения уходит в новый план
  `plans/YYYY-MM-DD-*.md` (ссылка в `PLAN.md`); мелкая правится напрямую.
- Выполненные и снятые записи **не остаются здесь и не удаляются**: они переносятся в
  `plans/done/backlog.md` с пометкой `ГОТОВО`/`СНЯТО`, датой и ссылкой на план или коммит.
- Нумерация `BL-n` сквозная по живому реестру и архиву, не переиспользуется и не
  переназначается.

## Тесты на функциональность ЕМИСС (заказаны владельцем 29.10.2026, R1/R2/R3)

Писать после согласия владельца на сессию с тестами. Слои — по R2 (без «страховочных»
дублей), покрытие по R5 (lines ≥ 80 % per-file; новый компонент добавляется в
`coverage.include` vitest.config). Прогон в песочнице — по классам, не `mvn test` целиком
(тяжёлые сьюты в песочнице агента не стартуют — ограничение среды описано в
`plans/knownbugs.md`).

- **BL-1. `EmisUnitTest`** (unit, `backend/src/test/java/com/provision/service/`).
  Разбор суффикса: «кг», «350 г», «100 г (100 мл)», «100 мл», «л», «10 шт.», «25 пакетиков»,
  «упаковка 100 шт.», «упаковка 500 листов», «коробок», «рулон», «ампула 5 мл»,
  нераспознанный суффикс → `OTHER`. `pricePerUnit` по всем парам, включая плотность ≈ 1:
  KG→KG, G(350)→KG, G(100)→PCS(pw=100), KG→L, ML(100)→L, ML(100)→KG, ML(100)→PCS(pw=100),
  COUNT(1)→PCS, COUNT(10)→PCS. Отрицательные: COUNT→KG/L, OTHER→*, `emisPrice ≤ 0`,
  `amount ≤ 0`, `pieceWeightG = null`, `ingredientUnit = null`. Округление `rounded` —
  копейки, HALF_UP. Фикстуры — реальные цены выгрузки (8016 = 198,32; 5311 = 702,38;
  6502 = 26,49; 6505 = 42,90; 5701 = 4,18; 1501 = 113,85 за десяток).
  Статус: READY

- **BL-4. `EmisCatalogServiceTest` + `EmisControllerTest`** (`@WebMvcTest`): поиск по подстроке
  имени и по коду, лимит, сортировка по имени (ru-коллация), `describe`/`exists`, неизвестный
  код → 404/400, доступ только роли ADMIN (IDOR/403 по `AGENTS.md` §4).
  Статус: READY

- **BL-5. Привязка продукта (integration)**: `ProductRequest.emisCode` — несуществующий код →
  `VALIDATION_ERROR`; `ProductResponse.emisCode/emisName/priceSyncStatus` = `NOT_LINKED` /
  `NO_DATA` (кейс 1115 без цен) / `SYNCED`; отвязка (`emisCode = null`);
  переименование занятого в рецептах продукта через UI по-прежнему заблокировано
  `PRODUCT_IN_USE`.
  Статус: READY

- **BL-6. Сид V29 (integration)**: 191 привязка и 13 без привязки; «Бумага туалетная, рулон» —
  `piece_weight_g = 75`, история цен поделена на 4; «Салфетки влажные, упаковка 20 шт.» —
  70 и ÷5; «Спички, коробок» — 15 и ÷20; `gas_canister`/`soy_sauce`/`vinegar` —
  `emis_code IS NULL`; `name_norm` пересчитан, дублей по `(name_norm, unit)` нет; снимки
  походов (`trip_id IS NOT NULL`) не изменены. Отдельно — защита от двойного деления цен
  при повторном применении (условие по `piece_weight_g`): прогнать тело V29 второй раз
  и assert, что цены не изменились.
  Статус: READY

- **BL-7. Пайплайн синка (integration)**: `PriceSyncService.runSync` из локальной копии →
  в `ingredient_prices` только `source = ROSSTAT`, ручные срезы удалены, `sync_logs.details`
  содержит `mirror`/`snapshotSource` и постатейные `items`; статус SUCCESS/PARTIAL/FAILED
  выводится из счётчиков. Сюда же перенесён guard из закрытого плана
  `plans/done/2026-10-28-price-sync-lazy-session.md`: вызов фонового синка ВНЕ транзакции
  со стаб-провайдером (`@ContainerSuite`, Testcontainers/LocalPgFallback) — настоящая защита
  от возврата `LazyInitializationException`, которую unit-тесты с Mockito не ловят.
  Статус: READY

## ЕМИСС, цены и единицы

- **BL-11. История цен в UI продукта.** График по `emis_prices` (а не только последняя точка):
  эндпоинт `GET /admin/emis/products/{code}/prices`, компонент в модалке продукта,
  mock-паритет. Критерий: видно ряд по месяцам за окно `period-years`.
  Статус: READY

- **BL-12. Пересмотр 13 непривязанных продуктов** при расширении выгрузки (другой показатель
  ЕМИСС или более длинный ряд): туристическая непищевая номенклатура может появиться
  в классификаторе. Файлы: новая миграция `V30+` по образцу V28/V29.
  Статус: READY

- **BL-13. Привязки к позиции без цен.** `powdered_milk` и `cream_powder` → 1115 «Молоко сухое
  цельное, кг»: в выгрузке нет ценовых точек. Найти замену в классификаторе или принять
  `NO_DATA` и снять привязку. Решение владельца 29.10.2026 — «будем ждать цену в выгрузке»,
  поэтому запись остаётся в стеке как напоминание проверить ряд при следующем синке.
  Статус: READY

- **BL-14. Коэффициент фасовки на привязке** («наш продукт = 5 упаковок ЕМИСС») — альтернатива
  переводу продукта на фасовку ЕМИСС, которым пошла V29. Понадобится, если владелец захочет
  сохранить фасовку «упаковка 100 шт.» у продукта и при этом брать цену упаковки 20 шт.
  Файлы: новая колонка `emis_factor` (миграция), `EmisUnit.pricePerUnit`, `EmisLinkPicker`.
  Статус: READY

## Код-долг (R8/R9)

- **BL-16. Вынос модалки продукта из `src/pages/ProductsPage.tsx`** (615 строк) в отдельный
  компонент (`ProductFormModal.tsx`) по R8; новый компонент — в `coverage.include`.
  Статус: READY

## Мобильный UI и данные похода

- **BL-27. Отметки чеклиста на сервер + офлайн-очередь.** Что сделать: перенести «взято» и
  фактическое количество из `src/utils/tripStaging.ts` (localStorage) на сервер — миграция и
  эндпоинт в `backend/`, клиент в `src/api/`, `src/utils/checklist.ts`,
  `src/components/ChecklistTab.tsx`; плюс очередь локальных правок и синхронизация при
  появлении сети (сценарий «в магазине нет связи»). Критерий приёмки: отметка, поставленная
  на одном устройстве, видна на другом после синхронизации; офлайн-правки не теряются и
  применяются при появлении сети; mock-паритет форм ответа соблюдён (`AGENTS.md` §14,
  `CONTRACT_TARGET=mock npm run test:contract`).
  Источник: `plans/done/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: READY



- **BL-29. Контраст мобильного UI в обеих темах.** Что сделать: проверить поповер `InfoTip`,
  липкие `.modal-head`/`.modal-foot`, карточный режим `.table-cards` и `.app-drawer` против
  `provisions/design-pack/tokens.json → a11y.contrast` на 360/390px. Критерий приёмки: все пары
  «текст/фон» не ниже норматива; найденные расхождения переданы владельцу design-pack
  (агенты `provisions/design-pack/**` не правят).
  Статус: READY

- **BL-30. Крупный режим текста (доступность).** Что сделать: проверить и при необходимости
  поправить поведение при пользовательском `font-size`/браузерном зуме текста — nowrap-связки
  `.keep-pair`, `.keep-num`, карточные таблицы, чеклист. Файлы: `src/index.css`,
  `e2e/mobile.spec.ts`. Критерий приёмки: при 150 % масштаба текста на 360px нет
  горизонтального скролла, связки не разрываются, кнопки чеклиста остаются ≥ 32px по высоте.
  Статус: READY

- **BL-31. Правило «связки не разрывать» в печати.** Что сделать: перенести `.keep-pair`/
  `.keep-num` на `.print-doc` (`src/pages/TripPrintPage.tsx`) — сейчас печать живёт отдельно,
  а `.print-doc th` намеренно оставлен 11px. Критерий приёмки: в PDF подпись, значение и единица
  на одной строке, колонки не «рвут» пары.
  Источник: `plans/done/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: READY

## Инфраструктура и CI

- **BL-58. Golden-fixtures живых ответов ЕМИСС: страница показателя и варианты A/B/C/D.**
  Продолжение BL-20 (выполненная часть — в `plans/done/backlog.md`): живой ЕМИСС в CI
  недоступен (анти-бот 403 для ЦОД), поэтому протокол проверяется на сохранённых ответах.
  Что сделать: golden-фикстуры страницы показателя с токеном и вариантов ответа A/B/C/D
  (HTML-заглушка «CSRF блокировка», `302` с Location, `503` от nginx, `200 text/html`) —
  сейчас эти строки живут константами внутри `RosstatEmisProviderTest`; сохранение живых
  ответов в ресурсы делает владелец (из песочницы портал недоступен). Файлы:
  `backend/src/test/resources/emis/*`, `RosstatEmisProviderTest`. Критерий приёмки: каждый
  вариант ответа разбирается из файла-фикстуры, строковые константы ответов из теста
  вынесены, тест зелёный без сети. Источник: остаток BL-20, подзадача 6 плана
  `plans/done/2026-10-29-sdmx-stax-streaming.md`.
  Статус: READY

- **BL-24. Генератор большой SDMX-фикстуры и память-бенчмарк в дереве.** Доказательство
  «66,2 МБ выгрузки разбираются в 128 МБ heap» получено харнесом ВНЕ репозитория
  (`/tmp/harness3/BigSdmx.java` + сгенерированный `big-sdmx.xml`), поэтому в CI оно не
  повторяется и может тихо протухнуть. Что сделать: тестовый генератор SDMX (параметры — число
  позиций, регионов, месяцев) в `backend/src/test/java/com/provision/integration/` + замер
  пика heap (например, `@EnabledIfSystemProperty` или тег `big`, чтобы не гонять его в каждом
  прогоне). Критерий приёмки: генератор собирает документ ≥ 60 МБ во временный файл, разбор
  даёт ожидаемое число точек и позиций, пик heap не превышает заданный порог; обычный `mvn test`
  не замедляется. Источник: подзадача 6 плана `plans/done/2026-10-29-sdmx-stax-streaming.md`.
  Статус: READY

- **BL-32. Прогнать e2e в CI обычным test-runner'ом.** Что сделать: `npm run test:e2e`
  (проекты `chromium`, `mobile-390`, `mobile-360` — `playwright.config.ts`) в workflow и
  убедиться, что `e2e/mobile.spec.ts` (M-01…M-09) и `e2e/main-flow.spec.ts` (E2E-10) зелёные;
  в песочнице агента test-runner не стартует из-за OOM (ограничение среды), проверки
  делались библиотечным запуском chromium. Критерий приёмки: workflow run с e2e-джобой
  зелёный, при падении публикуется артефакт `playwright-report/`.
  Источник: подзадача 10 плана `plans/done/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: READY

## Внешний аудит 30.10.2026 (P1/P2/P3)

Задачи внешнего аудита, не вошедшие в P0-блок (он закрыт планом
`plans/done/2026-10-30-external-audit-p0-block.md`). Приоритет и оценка — из аудита:
**S** ≤ 0.5 дня · **M** 1–2 дня · **L** 3–5 дней · **XL** > 5 дней. Задачи XL (BL-40, BL-42)
и задачи, требующие решения владельца (BL-52), при взятии в работу уходят в отдельный файл
плана (`AGENTS.md` §3). Порядок внутри раздела — по приоритету аудита.

### P1

- **BL-33. Починить E2E-nightly и отделить real-mode от mock-прогона** (M). Что сделать:
  разделить `e2e-nightly.yml` на два независимых job'а (`e2e-mock` и `e2e-real` со своим
  compose-стеком), чтобы падение одного не скипало другой; `retries: process.env.CI ? 2 : 0`
  и `workers: 1` в `playwright.config.ts`; `trace: 'on'` на nightly + артефакт с трейсами;
  длинный комментарий про песочницу агента из `playwright.config.ts` перенести в реестр
  известных дефектов (`plans/knownbugs.md`);
  уведомление о красном nightly (`workflow_run` → issue); после починки снять
  `continue-on-error` для PR. Критерий приёмки: два nightly подряд зелёные, в логе видно
  выполнение `real-mode.spec.ts`; намеренно сломанный `data-testid` валит `e2e-mock`. Источник: внешний аудит 30.10.2026, AU-06 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-34. Включить coverage-гейт R5 в CI и расширить whitelist** (M). Что сделать: шаг
  `npm run test:coverage` в `ci.yml` — сначала non-blocking с публикацией числа в summary,
  через 1–2 недели blocking (приём уже заявлен в шаге «Check MD files»); публиковать ДВЕ цифры
  («по whitelist'у» и «по всему `src/`»); пополнять `coverage.include` по мере декомпозиции
  страниц (BL-53); автоматизировать R5 проверкой «новый файл в `src/utils|api|components`
  обязан попасть в `include`»; рассмотреть `thresholds.branches` (сейчас только `lines`).
  Критерий приёмки: coverage-шаг виден в job summary с обоими числами; добавление
  `src/utils/foo.ts` без внесения в `include` валит проверку. Источник: внешний аудит 30.10.2026, AU-07 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-35. Снять `continue-on-error` с security-сканов, починив compose и nginx** (M).
  Что сделать: в `docker-compose.yml` для всех сервисов — `security_opt:
  ["no-new-privileges:true"]`, `cap_drop: [ALL]` (+ явный `cap_add` для nginx при необходимости),
  `read_only: true` с `tmpfs` для `/var/cache/nginx`, `/var/run`, `/tmp`, `pids_limit`,
  `logging` с `max-size: 10m, max-file: 3`; проверить, что `-XX:HeapDumpPath` backend указывает
  на writable-том; `Dockerfile.frontend` → non-root (`nginxinc/nginx-unprivileged` или `USER 101`
  + порт 8080); убрать из nginx `Upgrade`/`Connection`-заголовки и `proxy_cache_bypass`
  (WebSocket нет — это и есть «H2C»-находка Semgrep); Trivy на релизный тег + `.trivyignore`
  с обоснованием каждой строки; Semgrep — локальный прогон и baseline-файл; Dependency Review —
  включить dependency graph в настройках репозитория. Критерий приёмки: в job'е `Security Scans`
  есть хотя бы один блокирующий шаг; `docker compose up` поднимается с `read_only: true` и
  зелёными healthcheck; `docker exec provision-frontend id` → не-root. Источник: внешний аудит 30.10.2026, AU-09 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-36. Dependabot + `npm audit` в CI + фикс текущих CVE** (S). Что сделать:
  `.github/dependabot.yml` для экосистем `npm`, `maven`, `github-actions` (`schedule: weekly`,
  `open-pull-requests-limit: 10`, группы для минорных/патчей); блокирующий шаг
  `npm audit --omit=dev --audit-level=high` (moderate — сначала non-blocking в summary);
  поднять `react-router-dom` до исправленной версии и проверить все `<Link to>` на
  пользовательские данные; удалить неиспользуемый `uuid` (CVE уходит вместе с пакетом,
  см. BL-43); ночной job `mvn versions:display-dependency-updates` /
  `display-plugin-updates` без блокировки. Критерий приёмки: Dependabot открыл первые PR;
  `npm audit --omit=dev --audit-level=high` чистый и блокирует CI; `uuid` нет в `package.json`. Источник: внешний аудит 30.10.2026, AU-10 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-37. Одна версия Java в pom, CI, nightly и Dockerfile** (S). Что сделать: выбрать одну
  версию (рекомендация аудита — 21 LTS: образ уже на 21, а BL-40 всё равно ведёт к линии,
  где 17 не оптимален); привести в соответствие `backend/pom.xml` (`java.version` и
  `maven.compiler.release` вместо устаревших `source`/`target`), `ci.yml`,
  `contract-nightly.yml`, `backend/Dockerfile`, `README.md`, `backend/README.md`; запинить
  базовые образы по digest (BL-50); добавить CI-страховку — шаг, сравнивающий `java-version`
  в workflow, `maven.compiler.release` в pom и `FROM` в Dockerfile. Критерий приёмки: все
  четыре источника говорят одно число; `mvn test` и `docker compose build` зелёные;
  проверка-страховка валится при рассинхроне. Источник: внешний аудит 30.10.2026, AU-11 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-38. nginx: CSP и security-заголовки, XFF, gzip, кэш ассетов, таймауты** (M).
  Что сделать: заголовки `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (или CSP
  `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: geolocation=, camera=, microphone=`, `server_tokens off`; CSP
  начать с `Content-Security-Policy-Report-Only` и только затем enforcing (учесть инлайн-SVG
  в `BrandMark.tsx` и boot-лоадер в `index.html` — понадобится `'unsafe-inline'` либо вынос
  скрипта в файл с nonce; Google Fonts — явный `font-src`/`style-src`);
  `proxy_set_header X-Forwarded-For/X-Forwarded-Proto/X-Real-IP` + в бэкенде
  `server.forward-headers-strategy: framework` (без этого Spring заголовкам не доверяет —
  только тогда возможна блокировка по IP как второй эшелон к rate limiting); gzip для
  css/js/json/svg; `expires 1y` + `Cache-Control: public, immutable` для `/assets/` и
  `no-store` для `index.html`; `proxy_read_timeout/proxy_send_timeout 300s` и
  `proxy_request_buffering off` для `/api`; `limit_req_zone`/`limit_req` на
  `/api/v1/auth/login`; smoke-шаг в `docker-stack.yml`, проверяющий заголовки через `curl -I`.
  Критерий приёмки: `curl -I` на `/` и `/assets/index-*.js` возвращает ожидаемые заголовки;
  CSP не ломает boot-лоадер, шрифты, SVG-брендмарк и печать `/trips/:id/print`; в логе
  бэкенда виден реальный IP клиента; шаг проверки заголовков есть в CI. Источник: внешний аудит 30.10.2026, AU-12 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-39. Branch protection + conventional commits + запрет push в основную ветку** (S).
  Что сделать: branch protection на `main` (required PR, required status checks —
  `Backend Tests`, `Frontend Tests`, `Docker Build`; запрет force-push и удаления; linear
  history); вернуться к PR-флоу; Conventional Commits + `commitlint` (husky/lefthook или
  CI-проверка заголовка, минимальный набор типов `feat|fix|refactor|test|docs|chore|ci|perf`);
  в `AGENTS.md` §9/§10 заменить «consist fix»-стиль требованием осмысленного заголовка и
  добавить правило «агент не пушит в основную ветку напрямую»; squash-merge.
  Критерий приёмки: прямой push в `main` отклоняется GitHub'ом; последние 20 коммитов проходят
  `commitlint`; после внедрения на основной ветке нет красного CI. Источник: внешний аудит 30.10.2026, AU-28 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-40. Обновить Spring Boot 3.2.5 → актуальную поддерживаемую линию** (XL — при взятии
  в работу нужен отдельный файл плана, `AGENTS.md` §3). Что сделать: выбрать целевую линию
  (на 30.10.2026 вся 3.x вне поддержки, актуальна 4.x), пройти
  `spring-boot-properties-migrator`, поднять связанные зависимости (Hibernate, Flyway,
  Testcontainers, MapStruct, jjwt), сверить конфигурационные свойства (`application.yml`,
  профили `dev`/`prod`), убрать `spring-boot-properties-migrator` из зависимостей после
  перехода; согласовать версию Java с BL-37. Критерий приёмки: `mvn test` зелёный на целевой
  версии; `ProductPageQueryCountTest` не показал роста числа запросов; docker-стек поднимается
  и проходит `docker-stack.yml`; экономические инварианты (`EconomicConsistencyTest`,
  `SummaryService*Test`) зелёные; версия задокументирована в `ARCHITECTURE.md`. Источник: внешний аудит 30.10.2026, AU-01 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

### P2

- **BL-41. `@Version` на изменяемых агрегатах + UX конфликта на фронте** (L). Что сделать:
  `@Version` на `Trip`, сущностях правок состава и `trip_price_overrides` (+ миграция
  `ADD COLUMN version bigint NOT NULL DEFAULT 0`, только новый номер — §8); обработчик
  `OptimisticLockingFailureException` → 409 уже есть (AU-14, 30.10.2026); на фронте — диалог
  «данные изменились, обновите» с повторной загрузкой; mock-паритет (R3); тест по R1 на
  конкурентный batch-PUT. Критерий приёмки: вторая конкурентная запись получает 409, а не молча
  перезаписывает; UI показывает внятный диалог; миграция применена на существующей БД
  (гейт — job `migration-upgrade`). Источник: внешний аудит 30.10.2026, AU-13 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-42. JaCoCo-гейт на backend + unit-тесты на сервисы без покрытия** (XL — отдельный файл
  плана). Что сделать: JaCoCo `prepare-agent` + `report` + `check` (порог начать с 50% lines
  non-blocking, постепенно до 70%); приоритетный порядок тестов: `ShoppingListCalculator` →
  `TripService` → `SubstitutionService` → `MealCompositionService` → `TripCatalogSnapshotService`
  → `PriceSyncService` → `IntegrationService`; слой — unit/Mockito без Spring-контекста (R2),
  образец — `EmisPriceApplierTest`, `EmisMirrorServiceTest`, `PriceSyncPayloadTest`,
  `IntegrationUploadTest`. Критерий приёмки: `mvn verify` публикует отчёт и валится ниже порога;
  у приоритетных сервисов есть свои тест-классы; покрытие `service/**` ≥ 70% lines. Источник: внешний аудит 30.10.2026, AU-08 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  **Поправка 02.11.2026 (план `plans/2026-11-02-audit-security-usability-ui.md`, подзадача 2):**
  механизм гейта реализован и согласован с этой карточкой — ОДНО число и ОДИН механизм:
  профиль `coverage-gate` в `backend/pom.xml` (LINE COVEREDRATIO, `minimum` 0.60 — между
  стартом 50 % и целью 70 % этой карточки), вызов `mvn -P coverage-gate verify` в ci.yml;
  замер в песочнице 02.11.2026: 68.4 % LINE (3418/4999, без трёх тяжёлых сьютов —
  в CI не ниже). Остаток карточки: unit-тесты приоритетных сервисов (`MealCompositionService`,
  `SubstitutionService`, `SyncLogService` — худшие по пропущенным строкам) и плавное
  поднятие `minimum` к 0.70 по мере их появления. Статус: READY (остаток)

- **BL-43. Удалить неиспользуемые зависимости и навести порядок в `package.json`** (S).
  Что сделать: удалить 8 неиспользуемых пакетов и `@types/canvas-confetti`; `happy-dom` →
  `devDependencies`; выбрать один DOM-эмулятор (в `vitest.config.ts` активен `happy-dom` →
  `jsdom` можно убрать); задать `name: "meal-provisioning-frontend"`, `version`,
  `engines: { node: ">=22" }` и поднять Node в CI до 22 (BL-51); добавить `depcheck`
  non-blocking. Критерий приёмки: `npm run build` и frontend-тесты зелёные; `node_modules`
  меньше минимум на 20 МБ; `depcheck` не сообщает о неиспользуемых `dependencies`;
  `npm ci` без `EBADENGINE`. Источник: внешний аудит 30.10.2026, AU-24 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: ЧАСТИЧНО ГОТОВО (01.11.2026) — 8 deps удалены (`@dnd-kit/*`, `@supabase/supabase-js`, `canvas-confetti`, `framer-motion`, `recharts`); оставлено `happy-dom`, `@types/uuid`, `@types/canvas-confetti` — кандидаты на отдельную уборку. Остальные подзадачи (name/version/engines, depcheck, CI Node ≥22) в бэклоге.



- **BL-45. Заменить гейт «Check MD files» проверкой белого списка `AGENTS.md` §1** (S).
  Что сделать: переписать шаг «Check MD files (non-blocking)» в job'е `frontend`
  (`.github/workflows/ci.yml`) — сопоставлять `git ls-files '*.md'` с шаблонами белого списка
  §1 (`README.md`, `ARCHITECTURE.md`, `PLAN.md`, `AGENTS.md`, `DESIGN_MIGRATION.md`,
  `backend/README.md`, `plans/**`, `provisions/design-pack/**.md`) и падать на любом файле
  вне списка; решить судьбу `FORM-meal-composition-spec.md` (в белый список или в `plans/`);
  сделать шаг блокирующим. Критерий приёмки: шаг блокирующий и зелёный; добавление
  `FINAL_REPORT.md` в корень валит CI; белый список в `AGENTS.md` §1 совпадает с regex'ом CI
  (один источник истины). Источник: внешний аудит 30.10.2026, AU-22 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-47. Заменить `react-datepicker` и добавить бюджет-гейт размера бандла** (L).
  Что сделать: заменить `react-datepicker` на `<input type="date">` с прогрессивным улучшением
  (обёртка и `parseDate`-логика в `DatePicker.tsx` уже есть; e2e покрывает спаренные даты —
  CR-3) либо на лёгкую альтернативу; `rollup-plugin-visualizer` как артефакт CI;
  `build.rollupOptions.output.manualChunks` для явного разделения vendor; бюджет-гейт
  (`size-limit` или bash-проверка суммарного gzip ≤ N КБ, старт — текущее значение + 5%).
  Критерий приёмки: чанк DatePicker ≤ 40 КБ raw; суммарный JS-бандл меньше минимум на 150 КБ
  raw; бюджет-гейт блокирует рост; e2e «поход со спаренными датами (CR-3)» зелёный; мобильные
  viewport 360×640 и 390×844 без регрессий (`mobile.spec.ts`). Источник: внешний аудит 30.10.2026, AU-20 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: ЧАСТИЧНО ГОТОВО (02.11.2026, аудит) — `react-datepicker` удалён из `package.json`
  и из кода коммитом `ebb3a1b` 01.11.2026 (`DatePicker.tsx` — нативный `<input type="date">`
  с типизированным вводом); остаток: бюджет-гейт бандла (`rollup-plugin-visualizer`,
  `manualChunks`, `size-limit`) и критерии по размеру чанка. При закрытии выполненную часть
  перенести в архив по правилу «ЧАСТИЧНО ГОТОВО в части …» (`AGENTS.md` §2).

- **BL-48. ESLint 9 flat config + jsx-a11y + реализация правила hex-токенов** (M).
  Что сделать: миграция на flat config (`eslint.config.js`, ESLint 9); добавить `jsx-a11y`
  (recommended) и `import` (order, no-cycle); `no-console: ['warn', { allow: ['warn','error'] }]`
  и вычистить 27 вызовов (заменить на существующий логгер/тосты); `no-explicit-any: 'warn'`
  с постепенным вычищением; реализовать правило дизайн-токенов через `no-restricted-syntax`
  на Literal с regex `^#[0-9a-fA-F]{3,8}$` и явным allow-list для print-CSS `TripPrintPage.tsx`
  (36 из 46 литералов — там, для печати оправдано); сузить `excludedFiles` до конкретных файлов
  вместо всего `src/api/**`. Критерий приёмки: `npm run lint` зелёный на ESLint 9; 0
  `console.log` в прод-коде; новый hex-литерал в компоненте валит lint; `jsx-a11y` ловит
  намеренно добавленный `<div onClick>` без роли. Источник: внешний аудит 30.10.2026, AU-16 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY. Пометка аудита 02.11.2026: запись «BL-48 — ГОТОВО 01.11.2026» в
  `plans/done/backlog.md` НЕ соответствует репозиторию — `eslint.config.js` никогда не
  существовал в git-истории (`git log --all` пуст), `.eslintrc.cjs` + eslint ^8.55 на месте,
  `jsx-a11y` в `package.json` отсутствует; работа предстоит полностью, действительна
  настоящая карточка (см. план `plans/2026-11-02-audit-security-usability-ui.md`, подзадача 9).

- **BL-49. Профиль-зависимая санитизация `detail` в ответах об ошибках** (M). Что сделать:
  инжектить `Environment`/`@Profile`-флаг в `GlobalExceptionHandler` (или вынести в
  `ErrorResponseFactory` — BL-54) и в prod отдавать стабильный код ошибки вместо сообщения для
  «внутренних» исключений (`IllegalArgumentException`, `IllegalStateException`); доменные
  (`ValidationException`, `NotFoundException`, `ConflictException`) оставить как есть — они
  пишутся для пользователя; добавить `traceId` в `extensions` (BL-54); тесты по R1:
  `@SpringBootTest` с профилем `prod` — `detail` без внутренних сообщений, с `dev` — прежнее
  поведение. Критерий приёмки: в prod 500/400 от `IllegalArgumentException` возвращают
  стабильный код без внутреннего текста; README соответствует реализации; тесты на оба профиля. Источник: внешний аудит 30.10.2026, AU-27 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  **Поправка 02.11.2026 (аудит, план `plans/2026-11-02-audit-security-usability-ui.md`,
  подзадача 9):** ядро карточки (профиль-зависимая санитизация `detail`, KB-27) уже
  реализовано в `GlobalExceptionHandler` и покрыто `GlobalExceptionHandlerProfileDetailTest`;
  KB-27 закрыт (запись восстановлена в архиве). Остаток карточки — `traceId` в `extensions`
  и вынос в `ErrorResponseFactory` (BL-54). Статус: READY (остаток)

- **BL-50. Docker/compose hardening** (M, пересекается с BL-35). Что сделать: запинить все
  `FROM`/`image` по digest (`@sha256:…`) с комментарием о версии и обновлять пин через
  Dependabot (BL-36); `HEALTHCHECK` в оба Dockerfile; `restart: unless-stopped` и `logging`
  с `max-size: 10m, max-file: 3` для всех сервисов; `mem_limit` для postgres и frontend
  (для backend уже есть — BL-18); non-root в frontend-образе; `-XX:HeapDumpPath` на
  writable-том при `read_only: true`. Критерий приёмки: `docker compose config` и
  `docker-stack.yml` зелёные; `docker exec provision-frontend id` → не-root;
  `up && down && up` воспроизводим на другом хосте; плавающих тегов в образах нет. Источник: внешний аудит 30.10.2026, AU-25 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-51. Обновить GitHub Actions и запинить runner-образ** (S). Что сделать: поднять actions
  до v5 (`checkout`, `setup-node`, `setup-java`, `upload-artifact` — сейчас warning про
  deprecated Node 20); заменить `runs-on: ubuntu-latest` явным `ubuntu-24.04` (миграцию на
  26.04 планировать отдельно, прогнав `ci.yml` через `workflow_dispatch` до переключения);
  `trivy-action@master` → релизный тег; Node 20 → 22 LTS в `setup-node` (согласуется с
  `engines` из BL-43); `postgres:15-alpine` в `contract-nightly.yml` — тот же пин-подход,
  что в BL-50. Критерий приёмки: в логах нет deprecation-предупреждений про Node 20;
  `runs-on` указан явно; все workflow зелёные; `trivy-action` ссылается на тег. Источник: внешний аудит 30.10.2026, AU-29 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY. Пометка аудита 02.11.2026: запись «BL-51 — ГОТОВО 01.11.2026» в
  `plans/done/backlog.md` НЕ соответствует репозиторию — `.github/dependabot.yml` никогда
  не существовал в git-истории, `trivy-action@master` не заменён тегом, `runs-on:
  ubuntu-latest` не заменён явным образом, actions по-прежнему v4; работа предстоит,
  действительна настоящая карточка (см. план `plans/2026-11-02-audit-security-usability-ui.md`,
  подзадача 9).

- **BL-53. Закрыть неотслеживаемые нарушения R8 (> 500 строк)** (L).
  Что сделать: повторить приём декомпозиции `TripDetailPage.tsx` (1300 → 240 строк +
  `useTripDetail.tsx` + презентационные компоненты + чистые `utils/tripDerived.ts`) для
  `MealCompositionModal.tsx` (876 строк на 02.11.2026: состояние/логика → хук, разметка →
  подкомпоненты) и `RecipesPage.tsx` (616 строк) + `RecipeEditorModal.tsx` (512 строк) —
  добавлены аудитом 02.11.2026 (ранее не учитывались); `mockTrips.ts` (941) / `mockData.ts`
  (832) — остаток закрытой BL-52 (моки остаются, декомпозиция по доменам); из
  `TripPrintPage.tsx` вынести print-CSS и 36 hex-литералов (BL-48) в отдельный модуль;
  `ShoppingListCalculator.java` (520 строк) внести в реестры как accepted-исключение
  с обоснованием (логика перенесена байт-в-байт ради инвариантов сумм); добавить CI-проверку
  R8: warn при > 500 строк, error при > 800 (с allow-list). Правка текста 02.11.2026 (аудит):
  прежнее «пять нарушений» неточно — `SyncLogsPage.tsx` удалён 01.11.2026 (вычеркнут из скоупа),
  в прежнем тексте дважды повторялся `MealCompositionModal.tsx`; фактический список > 500 строк
  на 02.11.2026: `mockTrips.ts` 941, `MealCompositionModal.tsx` 876, `mockData.ts` 832,
  `ProductsPage.tsx` 636 (BL-16), `RecipesPage.tsx` 616, `ShoppingListCalculator.java` 520
  (accepted-исключение), `GlobalExceptionHandler.java` 542 (BL-54; было 516 на момент аудита,
  +26 строк — 404-обработчик подзадачи 10 плана `plans/2026-11-02-audit-security-usability-ui.md`,
  декомпозиция — по-прежнему BL-54), `RecipeEditorModal.tsx` 512.
  Критерий приёмки: файлов > 500 строк
  не больше четырёх (с задокументированными исключениями); новый файл > 500 строк валит CI;
  поведение не изменилось (frontend-тесты и e2e зелёные). Источник: внешний аудит 30.10.2026, AU-19 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-54. Декомпозировать `GlobalExceptionHandler` и добавить traceId в тело ошибки** (M).
  **Частично ГОТОВО (01.11.2026):** методы handleNotFound, handleConflict, handleValidation, handleGeneric уже выделены; build() хелпер существует. Осталось: ErrorResponseFactory/builder, разделение по доменам (Auth/Catalog/Integration/Web), MDC traceId в extensions, traceId в UI. Критерий R8 (<200 строк на класс) не проверялся.
  Что сделать: ввести `ErrorResponseFactory`/builder
  (`ErrorResponse.of(HttpStatus, code).detail(...).fieldErrors(...).usedIn(...).build`) —
  один ответственный модуль вместо 17 копий тела ответа (14 прежних обработчиков + 3 добавленных
  AU-14, которые уже пользуют хелпер `build(...)`); разнести обработчики по доменам
  (`AuthExceptionsHandler`, `CatalogExceptionsHandler`, `IntegrationExceptionsHandler`,
  `WebExceptionsHandler`) по 3–5 на класс; автоматически добавлять `MDC.get("traceId")`
  в `extensions.traceId` во все ответы; отобразить traceId в UI (`problemDetailParser.ts` →
  тост/диалог). Критерий приёмки: ни один класс не превышает 200 строк (R8); `extensions.traceId`
  присутствует во всех ошибочных ответах (проверено contract-тестами mock↔real — R3);
  UI показывает id; `SecurityIntegrationTest`/`ConflictIntegrationTest`/
  `GlobalExceptionHandlerErrorCodeTest` зелёные без правок ожиданий. Источник: внешний аудит 30.10.2026, AU-15 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-55. Doc-consistency pass и проверка ссылок в CI** (M). Что сделать: убрать дублирующиеся
  «источники правды» — версию Flyway, версию Java и список миграций не указывать числом в прозе,
  а ссылаться на каталог `db/migration` и `pom.xml`; сверить утверждения README/ARCHITECTURE
  с кодом по чек-листу; убрать устаревшее про «baseline-красный `EconomicConsistencyTest`»
  (`README.md`, раздел «Гейты перед пушем»): в прогонах 30.10.2026 он зелёный 10/10 дважды;
  добавить CI-шаг с `lychee`/`markdown-link-check` для внутренних ссылок и grep-проверку
  «в каждом MD, упоминающем V\d+, число совпадает с фактическим максимумом в `db/migration`».
  Критерий приёмки: ни одного противоречия по версиям Flyway/Java; все внутренние MD-ссылки
  резолвятся (шаг блокирующий); README не утверждает ложного. Источник: внешний аудит 30.10.2026, AU-21 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

### P3

- **BL-59. Дочистить мусор и мёртвый код в репозитории (остаток BL-56)** (S). Что сделать: `git rm`
  перечисленного в аудите мусора (для `provisions/logo` и `provisions/site` сначала решение владельца —
  `AGENTS.md` §1 защищает только `design-pack`); рассмотреть `git filter-repo` для удаления крупных PNG
  из истории (только с согласия владельца и отдельным анонсом — переписывание истории ломает
  существующие клоны); удалить `fix-encoding.ps1` (BL-46); добавить CI-шаг `npx depcheck` и проверку
  «нет файлов в `scripts/`, не упомянутых в документации». Критерий приёмки: в корне нет неиспользуемых
  скриптов; `provisions/` содержит только `design-pack` (или решение владельца зафиксировано в §1);
  `.git` уменьшен либо принято и зафиксировано решение историю не переписывать; CI-шаг ловит новый
  мусор. Предшественник: BL-56 (выполнен в части удаления мёртвых страниц — план
  `plans/done/2026-10-31-ux-audit-cleanup-dedup.md` п.1). Источник: внешний аудит 30.10.2026, AU-23.
  Статус: READY

## Гигиена репозитория и хвосты UX-осмотра 31.10.2026

- **BL-60. Гигиена живых реестров и `plans/` после UX-аудитов 31.10** (S). Что сделать:
  (1) удалить устаревшие дубли закрытых планов `plans/2026-10-31-ux-audit-navigation.md` и
  `plans/2026-10-31-ux-audit-transparency.md` (в `plans/` лежат копии со `Status: IN_PROGRESS`,
  канон — в `plans/done/`; нарушено §2 «git mv при закрытии» и «план в работе один»);
  (2) перенести в `plans/done/knownbugs.md` закрытые, но оставшиеся живыми карточки KB-23 и
  KB-30 и убрать дубль KB-28 из живого реестра (канон уже в архиве);
  (3) перенести в `plans/done/backlog.md` запись BL-52 (статус ГОТОВО 31.10.2026).
  Критерий приёмки: `ls plans/` без done даёт только `backlog.md`, `knownbugs.md` и планы со
  статусом READY/IN_PROGRESS, которых реально нет в `plans/done/`; в живых реестрах нет записей
  со статусами ГОТОВО/ЗАКРЫТ; номера не переиспользованы. Источник: UX-осмотр 31.10.2026,
  `plans/done/2026-10-31-ux-audit-visual-inspection.md` (нарушение AGENTS §2).
  Статус: READY

- **BL-61. Удалить мёртвые страницы, которые план cleanup-dedup объявил удалёнными** (S).
  Что сделать: `git rm src/pages/AdminPage.tsx src/pages/DashboardPage.tsx
  src/pages/ErrorsDemoPage.tsx src/pages/SyncLogsPage.tsx` (~1437 строк; ноль нетестовых
  импортов, маршруты /admin, /dashboard, /sync-logs, /errors-demo уже редиректы в App.tsx);
  проверить, что vitest/tsc/eslint/build зелёные без них; в новом отчёте сослаться на расхождение
  с «Результатами» закрытого плана `plans/done/2026-10-31-ux-audit-cleanup-dedup.md` (п.1:
  «мёртвые DashboardPage/ErrorsDemoPage удалены» — файлы фактически жили в дереве и правились
  коммитами «consist fix»; историю не переписываем, расхождение фиксирует эта запись).
  Критерий приёмки: файлов нет; `grep -r "AdminPage\|DashboardPage\|ErrorsDemoPage\|SyncLogsPage" src/`
  пуст; гейты зелёные. Источник: UX-осмотр 31.10.2026 (dead-code probe), предшественник BL-59.
  Статус: ЧАСТИЧНО ГОТОВО (02.11.2026, аудит) — все четыре файла фактически удалены коммитом
  `ebb3a1b` 01.11.2026 (проверено: `ls src/pages` и grep по `src/` — ссылок нет); остаток:
  прогон гейтов vitest/tsc/eslint/build без них (в песочнице аудита не выполнялся — нет
  node_modules) и перенос записи в архив.

## Светлая тема: контраст и токены (по UX-осмотру 31.10.2026)

- **BL-62. Пересчитать светлую палитру под WCAG AA (запись владельцу дизайн-пака)** (M).
  **Статус: ЧАСТИЧНО ГОТОВО (01.11.2026):** --text-3 #75848E → #506672 (5.39/6.03/5.02 ≥4.5:1); --on-fire #FFF8F0 → #4A1E06 (6.88:1 на огне); --grad-brand стопы затемнены; добавлены 10 toast-токенов (dark+light) с проверкой ≥4.5:1. Осталось: chip-delta.fire (#FFC46B/#FF9E2C=1.31:1), wave-300 на success-soft (~1.30:1), danger на danger-soft (3.33:1) — требуют решения по UI-компонентам, не только токенам.
  Что сделать: в светлом блоке `provisions/design-pack/tokens.css` и в
  `tokens.json → a11y.contrast` — (1) `--text-3` затемнить до ≥ 4.5:1 на
  `--bg-0/--bg-1/--bg-2` (сейчас 3.45 / 3.85 / 3.21 — подписи `.muted`,
  плейсхолдеры, `.chip-delta.dim`); (2) акцентные тексты на тонированных подложках
  перевести на более тёмные ступени палитры либо убрать тонировку:
  `.chip-delta.fire` (`--amber-300` на `--amber-500` 14 % = 2.77 / 2.34),
  `.chip-delta.ok` (`--wave-300` на `--success-soft` поверх `--bg-2` = 3.83),
  `--danger` на `--danger-soft` (3.96 / 3.33); (3) `--grad-brand` light: стопы
  `#F79A3E` (0 %) и `#E8622C` (55 %) не дают 4.5:1 с `--on-fire` (2.07 и 3.21;
  100 % `#C24E12` — 4.54) — затемнить первые две стопы или задать текст CTA
  тёмным токеном; (4) текстовые бейджи этапов: `--wave-400` на `--bg-1` = 4.40
  и `--amber-500` на `--bg-1` = 3.49 — заменить на `--wave-600`/`--amber-600`
  (4.50+); (5) пересчитать заявленные цифры `a11y.contrast`: расчёт по WCAG 2.1
  даёт light 16.62 / 7.64 (заявлено 16.1 / 7.4) и dark 16.71 / 8.88 (заявлено
  15.4 / 7.9). Полная таблица 28 пар — в «Результатах» п.9 закрытого плана.
  Файлы: `provisions/design-pack/tokens.css`, `provisions/design-pack/tokens.json`;
  потребители — `src/index.css` (`.muted`, `.chip-delta.*`, `.btn.primary`, бейджи
  этапов, `.seg-btn`). Критерий приёмки: расчётный прогон пар светлой темы даёт
  0 пар ниже 4.5:1 для текста (3:1 — для крупных ≥ 18.66 px bold и иконок);
  заявленные в `tokens.json` цифры совпадают с расчётом ±0.05; пары тёмной темы
  пересчитаны и не деградировали. Источник: UX-осмотр 31.10.2026,
  `plans/done/2026-10-31-ux-audit-visual-inspection.md` п.9 (дизайн-пак агентами
  не правится — расхождения оформлены этой записью).
  Статус: READY


## Аудит 02.11.2026 — security, usability, UI, стандарты

- **BL-64. Декомпозировать монолит `src/index.css` (2292 строки, R8/R9)** (L). Что сделать:
  разрезать по ответственностям: базовый слой (`@layer base`, html/body/типографика) —
  `src/styles/base.css`; компонентные блоки (`.toast*`, `.alert--*` после BL-63,
  `.checklist-*`, `.nf-*`, `.seg`, `.table-cards`, `.chip-delta`, модалки/оверлеи, печать) —
  отдельные css-файлы рядом с компонентами или CSS Modules (прецеденты — `Button.module.css`,
  `DatePicker.css`, `CustomSelect.css`); `index.css` становится точкой сборки импортов.
  Порядок каскада и токены не меняются; визуальных изменений нет. Файлы: `src/index.css`,
  новые `src/styles/*.css` / `*.module.css`, импорты компонентов, `vitest.config.ts`
  (если css-модули затронут тесты). Критерий приёмки: ни одного css-файла > 500 строк;
  скрин-регресс ключевых страниц (список походов, этап ①–④, логин) в тёмной и светлой теме —
  без диффов; vitest/build/tsc зелёные. Источник: аудит 02.11.2026 (замер R8: 2292 строки).
  Статус: READY

- **BL-66. Поведение 404 для неизвестных маршрутов** (S). Что сделать: catch-all
  `path="*"` в `src/App.tsx` (строка ~98) ведёт всех на `/login`; аутентифицированный
  пользователь с опечаткой в URL молча перебрасывается через LoginPage на `/trips` — никакой
  обратной связи. Реализовать: для неаутентифицированных — прежний редирект на `/login`
  (с сохранением `navigate` после входа), для аутентифицированных — `NotFoundPage`
  («Страница не найдена» + CTA «К списку походов») либо редирект на `/trips` + тост;
  вариант и копи — решение владельца (дизайн-пак: EmptyState-паттерн). Файлы: `src/App.tsx`,
  новый `src/pages/NotFoundPage.tsx` + тест (и `coverage.include` по R5), e2e
  `navigation.spec.ts` (сценарий «опечатка в URL»). Критерий приёмки: `/ololo` в сессии
  показывает явный 404-фидбек; вне сессии — логин с возвратом; vitest/tsc/e2e(mock) зелёные.
  Источник: аудит 02.11.2026 (usability).
  Статус: READY
