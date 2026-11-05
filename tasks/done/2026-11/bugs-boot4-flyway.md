# Пачка багов: Boot 4 — Flyway не запускается

Status: DONE
Created: 2026-11-05
Closed: 2026-11-05

## Цель

Починить падение бэкенда в Docker после перехода на Spring Boot 4: Flyway не
накатывает миграции (`flyway_schema_history` отсутствует), Hibernate с
`ddl-auto=validate` падает на `Schema validation: missing table [emis_prices]`.

## Подзадачи

- [x] BUG: `provision-backend` падает с `Schema validation: missing table [emis_prices]`, в БД нет ни одной таблицы. Файлы: `backend/pom.xml`, `backend/src/test/java/com/provision/config/FlywayAutoConfigurationTest.java`. Приёмка: red-тест «`FlywayAutoConfiguration` есть на classpath» падает до фикса; после фикса тест зелёный, `docker compose up -d --build` поднимает backend healthy, `flyway_schema_history` заполнен, `emis_prices` существует.

## Заметки

- Причина: в Boot 4 `spring-boot-autoconfigure` размодулирован; автоконфигурация Flyway
  переехала в модуль `spring-boot-flyway` (стартер `spring-boot-starter-flyway`).
  В `pom.xml` остался только `flyway-core`, поэтому бин `Flyway` не создавался —
  миграции молча не запускались, а `flyway_schema_history` даже не появилась.
- Заодно пин `<flyway.version>10.10.0</flyway.version>` несовместим с Boot 4.1.2
  (Boot управляет Flyway 12.4.0, и `spring-boot-flyway` собран против 12.x) — пин убран.
- RED: `FlywayAutoConfigurationTest` (проверка classpath) — до фикса падает, т.к. класса
  `org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration` нет.

## Результаты (заполнить при закрытии)

- Сделано: в `backend/pom.xml` добавлен `spring-boot-starter-flyway` (модуль
  `spring-boot-flyway`), убран пин `flyway.version=10.10.0` — Flyway управляется BOM
  Boot 4.1.2 (12.4.0). `flyway-database-postgresql` остался без версии.
- RED→GREEN: `FlywayAutoConfigurationTest` — до фикса `Tests run: 1, Failures: 1`
  (класс автоконфигурации отсутствует), после фикса `Tests run: 1, Failures: 0`.
- Соседний тест: `FlywayUpgradeIntegrationTest` — `Tests run: 4, Failures: 0, Errors: 0`
  (Testcontainers PostgreSQL 15, миграции V1..V39, validate зелёный).
- Docker: `docker compose build backend` + `docker compose up -d --wait` — postgres,
  backend, frontend все Healthy. В логах: `Successfully applied 36 migrations … now at
  version v39`; `flyway_schema_history` — 36 успешных строк, `emis_prices` и
  `ingredients` существуют. `GET http://localhost:3000/api/v1/meta` → `db: ok`.
- Не проверено: полный `mvn test` (по правилам — только per-class), CI (не запускался).
- Остаток/риск: `.github/workflows/ci.yml` извлекает тег `flyway/flyway` из
  `<flyway.version>`; после удаления пина используется fallback `10.10.0` — CLI-тег
  остаётся прежним, для validate/info поверх истории Flyway 12 это допустимо, но при
  желании можно закрепить 12.4.0 отдельной задачей.
- `README.md` строка 200 по-прежнему предлагает `flyway-maven-plugin:10.10.0:repair`
  для старого образа — не правилась: команда относится к образу до апгрейда и работает
  независимо от версии в pom.
