# Задача: довести бэкенд-тесты до ≤1 минуты (fast lane) и ускорить интеграционные

Status: READY
Created: 2026-11-06
Closed:

## Цель
Полный `mvn test` — **4 мин 20 с** (418 тестов, из них 100 интеграционных). Ожидание
владельца: гейт на PR не дольше **1 минуты**. Разделить прогон на быстрый гейт (unit +
web-слой, без БД) и полный набор; интеграционную часть ускорить за счёт отказа от
пересоздания схемы на каждый тест.

## Замеры baseline (06.11.2026, реальные прогоны)
- `mvn test` (всё): **260 с**, `Tests run: 418, Failures: 0, Errors: 0, Skipped: 1`.
- `mvn test -Dtest='!*IntegrationTest'` (без интеграционных): **73 с**, `Tests run: 324`.
- Сумма времени по классам из surefire: 260 с; интеграционные — 19 классов, 100 тестов, 3.3 мин.
  Топ: `ChecklistBoughtIntegrationTest` 22.6 с (12 тестов), `ChecklistActualQtyIntegrationTest`
  21.1 с (11), `AuthIntegrationTest` 17.5 с (10), `ProductEmisBindingIntegrationTest` 16.4 с (4),
  `CatalogIntegrationTest` 13.3 с (7).

## Подзадачи
- [x] 1. Профиль `fast`: в `pom.xml` maven-surefire `excludes` для `**/*IntegrationTest.java` и `**/*SmokeTest.java`; приёмка: `mvn test -Pfast` ≤ 75 с, 324 теста, BUILD SUCCESS. — **Факт: 319 тестов (не 324: тот замер был по `-Dtest='!*IntegrationTest'`, без исключения `*SmokeTest`), 1:04, BUILD SUCCESS.**
- [x] 2. CI: на PR гонять `mvn test -Pfast`, на merge в main — полный `mvn test`; приёмка: оба шага в `.github/workflows/ci.yml`, полный шаг не блокирует PR. — **Сделано: шаг «Backend tests (fast lane, PR gate)» под `if: pull_request`; полный `-P coverage-gate verify` под `if: != pull_request`. В GitHub Actions не проверялось (push не делался).**
- [x] 3. Убрать `TestDataIsolation.reset` (drop-all + Flyway V1..Vn) из `@BeforeEach` хотя бы в 3 самых медленных классах — заменить на откат транзакции (`@Transactional` на классе) или `CREATE DATABASE ... TEMPLATE provision_test_seed`; приёмка: эти классы суммарно ≥ 40 % быстрее, тесты зелёные, изоляция сохранена (прогнать в случайном порядке). — **Сделано шаблонной БД `<db>_tpl`: было 64.6 с → 36.1 с (−44 %) на Auth+Catalog+ChecklistBought. Случайный порядок: 418 тестов зелёные.**
- [x] 4. Один Postgres на весь сьют вместо контейнера на класс: статический `@Container` в общем `ContainerSuite` + разные схемы на класс; приёмка: число стартов контейнера в логе уменьшилось, полный прогон ≤ 2 мин. — **Сделано через `SharedPostgres`: один контейнер на JVM, база на класс. Полный прогон 2:46 одним форком — в 2 минуты не уложился; с `-DforkCount=3` — 1:21 (см. п.5).**
- [x] 5. Параллелизм: `-DforkCount=2 -DreuseForks=true` (или JUnit 5 parallel с отдельными схемами); приёмка: полный прогон зелёный два раза подряд, ≤ 90 с. — **`-DforkCount=3`: 1:21, два прогона подряд зелёные (418/418). `forkCount=2` даёт 1:47.**
- [x] 6. Зафиксировать результат в `backend/README.md` §Тесты: команды, время, что чем покрыто (unit / MockMvc / e2e); приёмка: цифры совпадают с фактическим прогоном. — **Сделано: таблица замеров + описание SharedPostgres и шаблонной БД.**


## Заметки
`TestDataIsolation.reset` перед **каждым** тестом делает `DROP SCHEMA public CASCADE` и полный
`flyway migrate` — это 22 класса × N тестов. Причина в комментарии класса: сид каталога V3/V4
нельзя удалять, FK users RESTRICT не даёт чистить через `deleteAll()`. Поэтому замена должна
сохранять сид: шаблонная БД после миграций — самый дешёвый вариант.
`mvn` в git-bash работает через шим `~/bin/mvn` (вызывает `mvn.cmd` через PowerShell); тестам нужен
`JWT_SECRET` из `.env` (`set -a; . ../.env; set +a`).
Число «~60 минут» из раннего аудита — это длительность карточки ревью (чтение репозитория,
`npm test`, разбор диффа), а не самого сьюта; не использовать.

## Результаты (заполнить при закрытии)

Всё измерено на Windows, Docker поднят. Ветка `ai-fixes`, рабочая копия `.worktrees/ai-fixes` (не закоммичено).

| Прогон | Команда | Было | Стало |
|---|---|---|---|
| полный сьют | `mvn test` | 4:20 / 418 тестов | **2:46 / 418 (1 skipped)** |
| параллельно | `mvn test -DforkCount=3` | — | **1:21 / 418** |
| fast-lane (гейт PR) | `mvn test -P fast` | 1:13 / 319 | **1:04 / 319** (профиль был добавлен в прошлой сессии, подтверждён) |
| 3 самых медленных класса | Auth+Catalog+ChecklistBought | 64.6 с (29 reset'ов = 38.2 с) | **36.1 с** (−44 %) |

Что сделано:
1. `SharedPostgres` — один контейнер `postgres:15-alpine` (`-c max_connections=400`) на JVM вместо 21 контейнера по классу; `LocalPgFallback` для окружений без Docker поднят с тем же лимитом соединений. `ContainerSuiteExtension` теперь только гарантирует запуск общего сервера.
2. `TestDataIsolation.reset` — шаблонная БД: первый reset в JVM накатывает миграции в `<db>_tpl`, каждый следующий делает `DROP DATABASE … WITH (FORCE)` + `CREATE DATABASE … TEMPLATE` (0.1 с вместо 1.32 с). Пул Hikari вытесняется ПОСЛЕ пересоздания БД (иначе FORCE убивает соединения, которые выдаются без проверки из-за aliveBypassWindow 500 мс → «connection was aborted»). Автоматический откат на `drop schema + migrate`, если шаблон недоступен.
3. 21 тестовый класс переведён с собственного контейнера на `SharedPostgres.jdbcUrl("<база>")`.
4. CI: PR → `-P fast test`, push в main → полный `-P coverage-gate verify` (PR не блокирует).
5. `backend/README.md` §Тесты — команды, таблица замеров, описание механики.

Что осталось / риски:
- Полный прогон **одним форком** — 2:46, приёмка «≤ 2 мин» выполнена только с `-DforkCount=3` (1:21). Параллелизм не включён в pom по умолчанию: в песочнице агента ~1 ГБ памяти, два-три JVM там дают OOM. Включать осознанно.
- CI-шаги не прогонялись в GitHub Actions (пуша не было).
- `forkCount=3` даёт три контейнера (по одному на JVM) — на CI это +3 образа postgres одновременно; при нехватке ресурсов снижать до 2.

