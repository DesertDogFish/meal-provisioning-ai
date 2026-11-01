# Known bugs — реестр открытых дефектов

Дефекты и ограничения, которые **знаем, но сознательно отложили**. Правила ведения —
`AGENTS.md` §2 («Планы: папка `plans/`»).

- **Здесь только баги**: симптом → влияние → обход/почему отложили → источник. Перечней
  «что сделать», объёмов работ и номеров `BL-n` в этом файле нет — задачи живут в
  `plans/backlog.md` (правило «в задачах — задачи, в багах — баги», `AGENTS.md` §2).
- Закрытые карточки не остаются здесь и не удаляются: они переносятся в
  `plans/done/knownbugs.md` с пометкой `ЗАКРЫТ` (дата и чем закрыто — план или коммит).
  Нумерация `KB-n` сквозная по обоим файлам, номера не переиспользуются.
- Сюда попадает то, что не чинится в текущей задаче. Дефект, найденный в ходе работы, живёт
  в секции `Known bugs` активного плана и переезжает сюда, только если план закрыт, а дефект
  нет. Каждая карточка несёт поле `- Статус:` последней строкой: `ОТКРЫТ` — зарегистрирован,
  работа не начата; `ВЗЯТ В РАБОТУ — plans/<файл плана>.md` — работу взял план, карточка
  остаётся здесь до закрытия. Связь «дефект ↔ работа» живёт в плане, а не в карточке.
- Разбор реестра владельцем 29.10.2026: KB-9 и KB-10 оставлены как есть (решения владельца —
  в карточках); закрытые тогда KB-1…KB-8 и KB-11…KB-13 — в `plans/done/knownbugs.md`.
- `KB-n` здесь — не «baseline-красные сьюты». Baseline-красных сьютов в бэкенде нет
  (`OffConfigBindingTest` удалён вместе с OFF 28.10.2026).
- Метки `KB-1…KB-5` внутри закрытого плана `plans/done/2026-10-28-price-sync-lazy-session.md` —
  локальные метки того плана, они все закрыты и в этот реестр не мигрировали.

### KB-9. Новое поведение ЕМИСС не покрыто тестами

- Симптом: по явному указанию владельца («тесты пока не пишем») не покрыты: локальная копия
  (`EmisMirrorService`), конвертер единиц (`EmisUnit`/`EmisPriceApplier`, включая правила
  «упаковка N шт.» и «плотность ≈ 1»), поиск привязки (`EmisCatalogService`, `EmisController`),
  загрузка файла (`uploadSnapshot`/`parseSnapshot`/`postFile`), `priceSyncStatus`,
  сиды V27/V28/V29, перенос цен в `ingredient_prices`.
- Влияние: регресс в математике цен будет пойман только глазами владельца (нарушение R1/R3 —
  осознанное, зафиксировано владельцем).
- Обход: изменения проверены вручную — прогон конвертера по всем 191 привязке на апрельских
  ценах ЕМИСС, `CatalogIntegrationTest`/`ConflictIntegrationTest`/`SnapshotIsolationIntegrationTest`
  зелёные на V1→V29, идемпотентность V29 проверена двойным прогоном.
- Источник: `plans/done/2026-10-28-emis-local-copy-and-product-linking.md`.
- **Статус 29.10.2026: оставлено как есть по решению владельца** («KB-9 оставляем как есть
  пока»). Долг растёт: к списку добавилось предупреждение о сомнительной привязке
  (`EmisUnit.convertsTo`/`linkWarning`, `EmisCatalogService.LinkContext`, контекстные параметры
  `EmisController`) и значок общей привязки (`ProductResponse.emisSharedCount`,
  `IngredientRepository.countByEmisCodes`) — проверены вручную (харнес на 11 парах, идентичные
  тексты мока, vitest 456/456), тестов нет.
- **Статус 29.10.2026 (вечер): долг сокращён** (владелец отменил «тесты пока не пишем»
  для этой зоны и заказал тесты зон ЕМИСС целиком). Покрыто тестами:
  конвертер единиц (`EmisUnitTest` 20 — разбор суффикса, `convertsTo`, `pricePerUnit`,
  `linkWarning` по всем ветвям), поиск привязки (`EmisCatalogServiceTest` 16 — `LinkContext`
  с контекстом и без, «свежая» цена, лимиты выдачи, форма DTO; `EmisControllerTest` 5 — срез
  `@WebMvcTest`, параметры `unit`/`pieceWeightG`/`price`, дробный вес с запятой), значок общей
  привязки (`EmisSharedCountIntegrationTest` 5 на реальной БД: общая позиция, отвязка соседа,
  снимки похода не считаются), разбор выгрузки (`SdmxStreamParserTest` 16, golden-фикстура
  боевого ответа; `RosstatEmisProviderTest` 34, в том числе `parseSnapshot` загруженного файла),
  frontend (`ProductTable.test.tsx` — значок со счётчиком, `src/api/contractEmis.test.ts` 21 —
  форма `EmisProductDto`, контекстные параметры, тексты предупреждений, `emisSharedCount`;
  входит в `npm run test:contract`). Прогон: 94/94 + 5/5 backend, 482/482 frontend.
  **Остаток долга** (открыт; сокращён 29.10.2026 вечером — добавлены `EmisPriceApplierTest`
  8/8 и `EmisMirrorServiceTest` 6/6, план `plans/done/2026-10-29-full-audit.md`,
  подзадача 27): `PriceSyncService` (оркестрация синка
  и счётчики — частично покрыт метриками emis.sync.* того же плана), `priceSyncStatus`
  в `ProductService`, multipart-путь загрузки файла
  (`IntegrationService.uploadSnapshot`, `api.postFile`), сиды V27/V28/V29 (идемпотентность
  проверена двойным прогоном вручную), `JdkEmisTransport` (живая сеть — KB-10).
- Статус: OWNER TASK (01.11.2026)
  ЕМИСС тесты: согласование с владельцем продукта. 

### KB-10. Тяжёлые интеграционные сьюты не запускаются в песочнице агента

- Симптом: `UserPricesIntegrationTest`, `EconomicConsistencyTest`, `DockerStackSmokeTest`
  получают OOM-kill (exit 137) даже при `-Xmx256m`; воспроизведено на чистом HEAD.
- Влияние: это ограничение среды (2 vCPU / ~1 ГБ RAM, нет Docker-демона), а не падение
  тестов. Помечать в отчётах как «не прогнано из-за лимита памяти», не как «failed».
- Обход: остальные интеграционные сьюты в песочнице идут через локальный кластер PostgreSQL
  на `:5433` (`LocalPgFallback`, `initdb` в `/tmp/ltc-pgdata`, суперпользователь `test`)
  по классам (`mvn -o test -Dtest='Имя1,Имя2' -DfailIfNoSpecifiedTests=false`) с
  `MAVEN_OPTS=-Xmx512m`.
- **Поправка 29.10.2026:** `-DargLine="…"` в этом проекте ИГНОРИРУЕТСЯ — surefire-конфиг
  `backend/pom.xml` задаёт `<argLine>` литералом (javaagent Mockito), поэтому свой `-DargLine`
  не подхватывается. Память и агенты задаются через `MAVEN_OPTS` + `-DforkCount=0` (тесты идут
  в JVM самого maven) — так снято покрытие jacoco 0.8.12 для пакета `integration`.
- Источник: прогоны 29.10.2026.
- **Поправка 2 29.10.2026 (вечер, подзадача 28):** `EconomicConsistencyTest` (10/10, ~65 c)
  и `UserPricesIntegrationTest` (5/5, ~50 c) УСПЕШНО прогоняются по отдельности с
  `MAVEN_OPTS="-Xmx512m -XX:MaxMetaspaceSize=256m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m
  …mockito-javaagent…" -DforkCount=0` + `JWT_SECRET` + LocalPgFallback. OOM-kill (137) даёт
  только ПОЛНЫЙ прогон `mvn test` (несколько тяжёлых Spring-контекстов в одной JVM), а не эти
  классы сами по себе. В отчётах больше не помечать их «не прогнано»; не запускается в
  песочнице по-прежнему только `DockerStackSmokeTest` (нет Docker-демона).
- **Поправка 3 30.10.2026 (внешний аудит, P0-блок):** полный прогон `mvn test -DforkCount=0`
  одним процессом роняет не JVM, а сам PostgreSQL: `ERROR: out of memory` (SQLSTATE 53200)
  внутри `V27__seed_emis_catalog_and_prices.sql` → `flywayInitializer` не создаётся, дальше
  каскад «ApplicationContext failure threshold (1) exceeded» у остальных классов. Так упали
  `ProductSearchInjectionTest`, `ShoppingExclusionsDayIntegrationTest` и один тест
  `TripManualItemsIntegrationTest`; те же классы батчем зелёные (4/4, 4/4, 5/5).
  Рабочий рецепт (проверен: 219 unit-тестов одним прогоном + 75 Spring-тестов четырьмя
  батчами, 0 падений): батчи по 2–3 Spring-класса, `MAVEN_OPTS=-Xmx400m`, `-DforkCount=0`,
  `JWT_SECRET` как в `ci.yml` (без него контекст падает на fail-fast `jwtProperties`), и снос
  накопившихся тестовых БД между батчами
  (`psql -h localhost -p 5433 -U test -d postgres -c 'DROP DATABASE "provision_test_*" WITH (FORCE)'`).
  Юнит-классы (без `@SpringBootTest`/`@ContainerSuite`) идут одним прогоном целиком.
  Уточнение к поправке 2: `DockerStackSmokeTest` в песочнице ЗЕЛЁНЫЙ (5/5) — несмотря на имя,
  Docker ему не нужен, он работает через тот же `LocalPgFallback` (единственный класс
  с `@ActiveProfiles("test")`).
- **Статус 29.10.2026: оставлено как есть по решению владельца** («KB-10 оставляем как есть
  пока»): ограничение песочницы, не дефект кода; поправка 2 уточняет обход, поправка 3 —
  рецепт батчей и причину 53200.
- Статус: ENVIRONMENT LIMIT (01.11.2026)
  Тяжёлые интеграционные сьюты не запускаются в песочнице агента (ограничение среды, не дефект кода).



### KB-16. Playwright test-runner не стартует в песочнице агента (OOM)

- Симптом: `npx playwright test` падает на `newPage` с `Target crashed`; в логе —
  исчерпание V8 CodeRange в gpu-процессе. Воспроизводится на чистом `HEAD` без правок задачи
  → ограничение среды (2 vCPU / ~1 ГБ RAM), а не кода. Флаги `--single-process` и
  `--in-process-gpu` не помогают (процесс зависает).
- Влияние: e2e-гейт (`npm run test:e2e`) в песочнице не выполняется, статус «e2e зелёные
  в CI» не заявляется (R6).
- Обход: браузер запускается библиотечно — `chromium.launch({ chromiumSandbox: false,
  args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox'] })`, по одной
  странице на процесс (второй браузер в том же node-процессе снова даёт OOM). Так проверены
  360×640 — 28/28 проверок, 390×844 — 3/3, 1440×900 — 4/4, каталог продуктов 360 — 2/2;
  сценарии закреплены в `e2e/mobile.spec.ts` (M-01…M-09) и `e2e/main-flow.spec.ts` (E2E-10).
- Источник: подзадача 10 плана `plans/done/2026-10-29-ui-nowrap-and-mobile.md`.
- Статус: ENVIRONMENT LIMIT (01.11.2026)
  Playwright OOM в песочнице агента (ограничение среды, не дефект кода).
- Статус 31.10.2026 (вечер, UX-осмотр): деградация шире раннера — после ~15 успешных
  библиотечных запусков за сессию chromium начинает падать уже на `newPage()`
  (`trap int3` в рендерере по dmesg, воспроизводится и на headless-shell, и на полном
  chromium, и с `--no-zygote`); standalone `--dump-dom` работает. Лечение — перезапуск
  песочницы; осмотр из-за этого не переснял light-тему (подзадача 9 плана
  `plans/done/2026-10-31-ux-audit-visual-inspection.md` требует реального браузера).

### KB-17. Spring Boot 3.2.5: вся линия 3.x вышла из поддержки, OSS-патчей безопасности нет

- Симптом: приложение собрано на Spring Boot 3.2.5 (релиз 20.04.2024). По данным spring.io
  на 30.10.2026 поддержка 3.2, 3.3, 3.4 и 3.5 прекращена (последняя, 3.5, — 30.06.2026),
  актуальная линия — 4.x.
- Влияние: новые CVE в Tomcat/Spring Framework/Jackson не закрываются подъёмом версии —
  только ручным пином каждой зависимости; накопление неустранимых находок (см. KB-21) и
  дрейф плагинов/образов.
- Обход/почему отложили: апгрейд — задача XL (мажорная линия: валидация, конфиг-свойства,
  Hibernate, Flyway, тесты), по §3 требует отдельного файла плана; в P0-блок внешнего аудита
  не входила. Промежуточная мера — Dependabot, `npm audit` в CI и ночной job дрейфа
  зависимостей (оформлены отдельными записями в `plans/backlog.md`).
- Источник: внешний аудит 30.10.2026, AU-01 (таблица 30 задач —
  `plans/done/2026-10-30-external-audit-p0-block.md`).
- Статус: XL (01.11.2026)
  Spring Boot 4.x upgrade — мажорный апгрейд, требует отдельного плана по §3.






  Branch protection, required status checks, Conventional Commits — требуют GitHub Admin access.
  Обход: агент не пушит в main без согласия владельца. 

### KB-22. Нет branch protection: прямой push в основную ветку, красный CI не блокирует
- Симптом: все 610 прогонов CI — прямой `push` в `main`; required PR и required status checks
  не настроены, force-push и удаление ветки не запрещены, история нелинейна; из 45 последних
  прогонов 6 красных. Заголовки коммитов не соответствуют Conventional Commits (пример —
  «consist fix» на ревизии `2ab57fb`).
- Влияние: красная сборка на основной ветке не мешает следующим пушам; ревью изменений
  отсутствует; откат и разбор регрессий затруднён.
- Обход: агент не пушит в основную ветку без явного согласия владельца; коммиты P0-блока
  локальные (см. «Результаты» плана `plans/done/2026-10-30-external-audit-p0-block.md`).
- Источник: внешний аудит 30.10.2026, AU-28.
- Статус: OWNER TASK (01.11.2026)
  Branch protection, required status checks, Conventional Commits — требуют GitHub Admin access. Агент не пушит в main без согласия владельца.

### KB-36. Backend не стартует: Flyway «Found more than one migration with version 30»

- Симптом: в `backend/src/main/resources/db/migration/` два файла версии 30 —
  `V30__ingredient_prices_latest_index.sql` (в дереве с 29.10.2026, применён на
  существующих БД) и `V30__optimistic_locking_version.sql` (добавлен коммитом `ebb3a1b`
  01.11.2026). Flyway падает на resolve ДО применения: `FlywayException: Found more than
  one migration with version 30`; bean `flywayInitializer` не создаётся, контекст Spring
  не поднимается. Замер в песочнице 01.11.2026: `SnapshotIsolationIntegrationTest` 3/3
  ERROR (лог: `BeanCreationException ... flywayInitializer`). docker-стек не стартует,
  CI job'ы `backend` и `migration-upgrade` красные. Второй скрытый дефект той же партии:
  `@Version` добавлен в 8 сущностей (включая `TripChecklistBought`), а колонка `version`
  миграцией — только в 7 таблиц: у `trip_checklist_bought` (V32) её нет → после устранения
  дубля старт упадёт на `ddl-auto=validate` (missing column [version]).
- Влияние: HEAD `75a8e1c` непригоден к запуску: backend не стартует ни локально, ни в
  compose, ни в CI; интеграционные тесты не выполняются; миграции не накатываются.
- Обход: рабочего нет (только не запускать backend; фронтенд в mock-режиме не затрагивается).
- Источник: аудит 02.11.2026, подзадача 1 плана `plans/2026-11-02-audit-security-usability-ui.md`;
  остаток KB-24, закрытой 01.11.2026 преждевременно (карточка в архиве утверждает
  «@Version добавлен…», фактически работа не запускается). Нарушен `AGENTS.md` §11
  (новый номер = max + 1).
- Статус: ВЗЯТ В РАБОТУ — plans/2026-11-02-audit-security-usability-ui.md

### KB-37. CI-гейт «Coverage gate (JaCoCo lines >= 60%)» не измеряет покрытие и падает не по делу

- Симптом: шаг в `.github/workflows/ci.yml` (job `backend`, ~строка 95) вызывает
  `mvn -B -ntp jacoco:check@coverage-gate`, но в `backend/pom.xml` execution с goal `check`
  имеет id `coverage-check` и находится в профиле `coverage-gate`, который CI не активирует
  (`-P` отсутствует). Замер той же командой в песочнице 01.11.2026:
  `[ERROR] Failed to execute goal org.jacoco:jacoco-maven-plugin:0.8.12:check (coverage-gate)
  ... The parameters 'rules' for goal ... are missing or invalid`. Даже при активации профиля
  селектор `@coverage-gate` не совпадает с id `coverage-check`; кроме того
  `<threshold>60</threshold>` при `counter=LINE` трактуется JaCoCo как COVEREDRATIO=60
  (6000 %; шкала 0.0–1.0) — корректно вызванный гейт не проходил бы никогда.
- Влияние: гейт покрытия backend — фикция: шаг либо краснит CI по неверной причине, либо
  (при «починке» вызова без порога) молча пропускает всё. KB-25 (архив, 01.11.2026)
  отрапортовала «гейт добавлен» — фактически он не работал ни дня.
- Обход: нет; до починки шаг будет красным после того, как тесты снова смогут запускаться.
- Источник: аудит 02.11.2026, подзадача 2 плана `plans/2026-11-02-audit-security-usability-ui.md`;
  остаток KB-25, закрытой 01.11.2026 преждевременно.
- Статус: ВЗЯТ В РАБОТУ — plans/2026-11-02-audit-security-usability-ui.md

### KB-38. Prod-представление: CSP блокирует брендовые шрифты, Vercel без security-заголовков, манифест PWA в чужой палитре

- Симптом: (1) CSP в `nginx.conf` — `style-src 'self' 'unsafe-inline'; font-src 'self'`,
  а `index.html` (~строки 41–47) грузит стили и файлы шрифтов с `fonts.googleapis.com` /
  `fonts.gstatic.com` → в docker-prod оба запроса блокируются (CSP violation в консоли),
  Unbounded/Manrope не применяются, UI откатывается на системные шрифты — не соответствует
  дизайн-паку; (2) во вложенном `location /assets/ ... { location ~* ... }` из-за правил
  наследования `add_header` server-заголовки не действуют, а вручную добавлены 4 из 5 —
  CSP там отсутствует (в т.ч. для SVG); (3) `vercel.json` не содержит секции `headers` —
  публичное демо на Vercel отдаётся без CSP/X-Frame-Options/nosniff/Referrer-Policy
  (nginx-заголовки туда не попадают); (4) `src/pwa/manifest.json`:
  `background_color: #1a1a2e`, `theme_color: #16213e` — цвета вне токенов дизайн-пака
  (dark `--bg-0` = #0B141B): splash/статус-бар PWA вне бренда.
- Влияние: prod-сборка визуально не соответствует дизайн-системе; Vercel-демо лишено
  базовой защиты (clickjacking, MIME-sniffing); PWA-брендинг нарушен.
- Обход: частичное — в dev (vite) CSP nginx не действует и шрифты грузятся; проверка
  дизайна в dev-режиме маскирует дефект.
- Источник: аудит 02.11.2026, подзадача 5 плана `plans/2026-11-02-audit-security-usability-ui.md`;
  смежно с задачей nginx-hardening внешнего аудита 30.10.2026 (AU-12) — данная карточка
  фиксирует дефекты ТЕКУЩЕЙ сборки, а не будущие улучшения.
- Статус: ВЗЯТ В РАБОТУ — plans/2026-11-02-audit-security-usability-ui.md

### KB-39. Реестры plans/ недостоверны: дубли BL-48/BL-51 в двух файлах, архивные «ГОТОВО» опровергнуты HEAD, BL-63 не была зарегистрирована

- Симптом: (1) BL-48 и BL-51 присутствуют одновременно в живом `plans/backlog.md`
  (READY) и в `plans/done/backlog.md` («ГОТОВО 01.11.2026») — нарушено `AGENTS.md` §2
  («номер всегда однозначно находится в одном из двух файлов»); (2) архивные записи не
  соответствуют репозиторию: `eslint.config.js` и `.github/dependabot.yml` никогда не
  существовали в истории (`git log --all -- eslint.config.js .github/dependabot.yml` пуст),
  `.eslintrc.cjs` + eslint ^8.55 + отсутствие jsx-a11y на месте, `trivy-action@master` не
  заменён тегом, `runs-on: ubuntu-latest` не заменён; (3) номер BL-63 назначен закрытым
  планом `plans/done/2026-10-31-ux-audit-visual-inspection.md` и упомянут в `PLAN.md`
  («открыты BL-62/BL-63»), но карточка отсутствовала в обоих реестрах до 02.11.2026;
  (4) KB-24/KB-25 закрыты 01.11.2026, однако заявленная работа не функционирует
  (остатки перерегистрированы как KB-36/KB-37); (5) KB-22 дублируется: живая карточка
  (OWNER TASK) и копия в `plans/done/knownbugs.md` со статусом «не закрыт» — в архиве
  закрытых карточка лежит незакрытой.
- Влияние: реестры показывают работу, которой нет; планирование по ним пропускает
  реально открытые задачи (ESLint 9 + jsx-a11y, Dependabot, trivy-тег); нарушен R6
  (отчёты «ГОТОВО» без проверки фактов) — тот же класс, что урок BL-20/KB-14 из §2.
- Обход: перед взятием «закрытого» в работу сверять утверждения карточки с HEAD
  (`ls`/`grep`/`git log --all`); аудит 02.11.2026 такую сверку выполнил.
- Источник: аудит 02.11.2026, подзадача 9 плана `plans/2026-11-02-audit-security-usability-ui.md`;
  связано с коммитами 01.11.2026 (`ebb3a1b`, `75a8e1c`).
- Статус: ВЗЯТ В РАБОТУ — plans/2026-11-02-audit-security-usability-ui.md



