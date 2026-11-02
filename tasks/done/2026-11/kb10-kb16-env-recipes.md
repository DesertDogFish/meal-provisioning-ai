# Заметка: KB-10 и KB-16 (лимиты песочницы) перенесены в skills/testing.md

Status: DONE
Created: 2026-11-02
Closed: 2026-11-02

## Что сделано

При реструктуризации MD (02.11.2026) карточки KB-10 (тяжёлые интеграционные сьюты не
запускаются в песочнице) и KB-16 (Playwright OOM) — это не чинимые дефекты кода, а знания
о среде исполнения. Их рабочее содержание (рецепты per-class прогонов, лимиты памяти,
поправки 1–4) перенесено в `skills/testing.md`, который агент читает перед любым прогоном.
Карточки ниже сохранены дословно как историческая запись (ENVIRONMENT LIMIT).

---

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
- **Поправка 4 02.11.2026 (сведение параллельного пуша):** после переименования/удаления
  файлов ресурсов (миграции) обязательно вычищать устаревшие копии в `backend/target/classes/db/migration/`
  (или делать `mvn clean`): Flyway сканирует classpath, а `mvn test` НЕ удаляет из target файлы,
  пропавшие из исходников. Симптом: «Found more than one migration with version N» при чистом
  исходном дереве (поймано при перенумеровке V35→V36 после коммита владельца `5eb70f8c` —
  в target/classes лежал старый V35__refresh_token_reuse_detection.sql рядом с новым
  V35__trip_checklist_bought_version.sql). Второй урок того же сведения: тестовые БД в
  LocalPgFallback имеют РАЗНЫЕ имена (`provision_test_*`, `provision_upgrade_test`,
  `provision_meta_test`) и переиспользуются между прогонами — при очистке дропать все
  `provision_%`, иначе `FlywayUpgradeIntegrationTest` падает «checksum mismatch» по
  миграциям, файлы которых менялись после прошлого прогона.
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
