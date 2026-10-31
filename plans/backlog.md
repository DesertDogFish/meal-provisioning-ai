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

- **BL-10. Правило «плотность ≈ 1» на фронте (чеклист/закупка).** `src/utils/checkUnits.ts`
  приводит количество только внутри своей размерности: `unitOptions('KG')` = ['г','кг'],
  `unitOptions('L')` = ['мл','л'], а `convertToBase({300,'г'}, 'L')` и `({300,'мл'}, 'KG')`
  дают `null`. Нужно: `unitOptions('KG')` += ['мл','л'], `unitOptions('L')` += ['г','кг'],
  `unitOptions('PCS'|'PACK', pw)` += ['мл','л'] (`piece_weight_g` читается как мл), ветки
  `convertToBase`: 'г'→L = a/1000, 'кг'→L = a, 'мл'→KG = a/1000, 'л'→KG = a, 'мл'/'л'→PCS/PACK
  через pw. Бэкенд уже согласован: `MealCompositionService.weightOfGrams` считает KG|L как ×1000 г.
  Критерий: `src/utils/checkUnits.test.ts` обновлён и зелёный (ассерты
  `unitOptions('KG')).toEqual(['г','кг'])` и `unitOptions('L')).toEqual(['мл','л'])` меняются).
  Делать в сессии, где можно запустить vitest (`npm ci`).
  Статус: READY

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

- **BL-28. PWA-минимум для телефона.** Что сделать: `public/manifest.webmanifest`, иконки
  (192/512), `theme-color` из токенов design-pack, предзагрузка/кэш шрифтов; service worker —
  по желанию, офлайн-данные уже живут в localStorage (BL-27). Файлы: `public/*`, `index.html`.
  Критерий приёмки: «Добавить на главный экран» на Android/iOS даёт иконку и полноэкранный
  запуск в теме приложения, Lighthouse (PWA) не сообщает об отсутствующем manifest.
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
  Статус: READY

- **BL-43. Удалить неиспользуемые зависимости и навести порядок в `package.json`** (S).
  Что сделать: удалить 8 неиспользуемых пакетов и `@types/canvas-confetti`; `happy-dom` →
  `devDependencies`; выбрать один DOM-эмулятор (в `vitest.config.ts` активен `happy-dom` →
  `jsdom` можно убрать); задать `name: "meal-provisioning-frontend"`, `version`,
  `engines: { node: ">=22" }` и поднять Node в CI до 22 (BL-51); добавить `depcheck`
  non-blocking. Критерий приёмки: `npm run build` и frontend-тесты зелёные; `node_modules`
  меньше минимум на 20 МБ; `depcheck` не сообщает о неиспользуемых `dependencies`;
  `npm ci` без `EBADENGINE`. Источник: внешний аудит 30.10.2026, AU-24 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-44. Включить e2e и конфиги в typecheck** (S). Что сделать: `tsconfig.e2e.json`
  (extends базового, `include: ["e2e", "playwright.config.ts"]`,
  `types: ["node", "@playwright/test"]`) и `tsconfig.node.json` для `vitest.config.ts`/
  `vite.config.*`; скрипт `typecheck:all`, включающий все три; заменить `vite.config.js` на
  `.ts`; добавить шаг в `ci.yml`. Критерий приёмки: `npm run typecheck:all` покрывает `e2e/**`
  (`--listFiles | grep -c e2e/` > 0) и падает на намеренно внесённой ошибке типа в спеке. Источник: внешний аудит 30.10.2026, AU-17 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

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

- **BL-46. Убрать BOM из пяти файлов и добавить гейт в CI** (S). Что сделать: снять BOM
  (`sed -i '1s/^\xEF\xBB\xBF//'`, в том числе в `docker-compose.yml` — он стоит перед
  `services:`); добавить блокирующий CI-шаг `! git grep -Il $'\xEF\xBB\xBF' -- .`; удалить
  `fix-encoding.ps1` (BL-59) — гейт заменяет его полностью; если PowerShell-скрипты останутся,
  добавить `*.ps1 text eol=crlf` в `.gitattributes`. Критерий приёмки: `git grep` по BOM пуст;
  намеренно добавленный BOM валит сборку. Источник: внешний аудит 30.10.2026, AU-26 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
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
  Статус: READY

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
  Статус: READY

- **BL-49. Профиль-зависимая санитизация `detail` в ответах об ошибках** (M). Что сделать:
  инжектить `Environment`/`@Profile`-флаг в `GlobalExceptionHandler` (или вынести в
  `ErrorResponseFactory` — BL-54) и в prod отдавать стабильный код ошибки вместо сообщения для
  «внутренних» исключений (`IllegalArgumentException`, `IllegalStateException`); доменные
  (`ValidationException`, `NotFoundException`, `ConflictException`) оставить как есть — они
  пишутся для пользователя; добавить `traceId` в `extensions` (BL-54); тесты по R1:
  `@SpringBootTest` с профилем `prod` — `detail` без внутренних сообщений, с `dev` — прежнее
  поведение. Критерий приёмки: в prod 500/400 от `IllegalArgumentException` возвращают
  стабильный код без внутреннего текста; README соответствует реализации; тесты на оба профиля. Источник: внешний аудит 30.10.2026, AU-27 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

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
  Статус: READY

- **BL-52. Решение по мок-слою: вырезать из прод-сборки или сделать явным демо-режимом**
  (L, нужно решение владельца → отдельный план). Что сделать: выбрать вариант —
  (A) демо-режим как фича: явное переключение с подтверждением, постоянный баннер «демо-данные»,
  запрет в prod-сборке по умолчанию, build-флаг `VITE_ENABLE_MOCK`; или (B) вырезать мок-слой
  и `contract-nightly.yml` из прод-артефакта, оставив моки тестам (отдельный entry/условная
  сборка). В обоих вариантах — `import.meta.env.PROD` + `VITE_ENABLE_MOCK` в `resolveMode`,
  чтобы в prod переключение было невозможно без флага сборки. Критерий приёмки: решение
  зафиксировано в `ARCHITECTURE.md`; в prod-сборке чанк `mockServer` отсутствует ЛИБО режим
  защищён баннером и подтверждением; e2e-сценарии E2E-06/07/08 (фолбэк, смена режима, очистка
  кеша) обновлены и зелёные. Источник: внешний аудит 30.10.2026, AU-18 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-53. Закрыть пять неотслеживаемых нарушений R8 (> 500 строк)** (L).
  Что сделать: повторить приём декомпозиции `TripDetailPage.tsx` (1300 → 240 строк +
  `useTripDetail.tsx` + презентационные компоненты + чистые `utils/tripDerived.ts`) для
  `MealCompositionModal.tsx` (состояние/логика → хук, разметка → подкомпоненты) и
  `SyncLogsPage.tsx`; `mockTrips.ts`/`mockData.ts` решаются в рамках BL-52; из
  `TripPrintPage.tsx` вынести print-CSS и 36 hex-литералов (BL-48) в отдельный модуль;
  `ShoppingListCalculator.java` (520 строк) внести в реестры как accepted-исключение
  с обоснованием (логика перенесена байт-в-байт ради инвариантов сумм); добавить CI-проверку
  R8: warn при > 500 строк, error при > 800 (с allow-list). Критерий приёмки: файлов > 500 строк
  не больше четырёх (с задокументированными исключениями); новый файл > 500 строк валит CI;
  поведение не изменилось (frontend-тесты и e2e зелёные). Источник: внешний аудит 30.10.2026, AU-19 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-54. Декомпозировать `GlobalExceptionHandler` и добавить traceId в тело ошибки** (M).
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

- **BL-57. Согласовать порт dev-сервера (3000 vs 5173)** (S). Что сделать: вернуть в
  `vite.config.js` `port: 5173` (соответствует документации и CORS-дефолту) и убрать CLI-флаг
  из `playwright.config.ts` как избыточный, ЛИБО — если 3000 выбран намеренно — согласованно
  поменять README, CORS-дефолт и playwright-конфиг. Критерий приёмки: `npm run dev` поднимает
  сервер на порту, который обещает README; `npm run test:e2e` работает без CLI-переопределения
  порта; dev-сервер и docker-стек поднимаются одновременно без конфликта. Источник: внешний аудит 30.10.2026, AU-30 (сводка 30 задач — `plans/done/2026-10-30-external-audit-p0-block.md`).
  Статус: READY
