# План: обновление Spring Boot 3.2.5 → 4.1.2 (BL-40, KB-17)

Status: IN PROGRESS
Created: 2026-11-04
Связанная задача: `tasks/upgrade-spring-boot.md`

## Целевая версия
- Spring Boot: 4.1.2 (актуальная поддерживаемая линия на 10.2026, OSS-патчи до 10.2027).
- Java: 21 (согласовано с BL-37; Spring Boot 4.x поддерживает Java 17+, 21 LTS).
- Hibernate: управляется Spring Boot 4.1.2 BOM.
- Flyway: управляется Spring Boot 4.1.2 BOM (ожидается 11.x).
- Testcontainers: управляется Spring Boot 4.1.2 BOM (ожидается 1.21.x).
- MapStruct: 1.6.3.
- jjwt: 0.13.0.
- springdoc-openapi: 3.2.0 (линия для Spring Boot 4.x).

## Фазы

### Фаза 0 — Baseline (уже зелёный)
- `mvn test` на 3.2.5: 245 unit + integration (по данным code-audit).
- `ProductPageQueryCountTest` фиксирует число запросов (baseline до апгрейда).

### Фаза 1 — Plan file (этот файл)
- [x] Создан `tasks/upgrade-spring-boot-plan.md`.

### Фаза 2 — Обновление pom.xml
- [ ] parent spring-boot-starter-parent → 4.1.2
- [ ] mapstruct.version → 1.6.3
- [ ] jjwt.version → 0.13.0
- [ ] springdoc.version → 3.2.0
- [ ] flyway.version: снять явный пин, управлять BOM (flyway-database-postgresql без version)
- [ ] testcontainers: снять явный пин, управлять BOM
- [ ] Добавить spring-boot-properties-migrator (compile/runtime, временно) для отчёта о переименованиях свойств
- [ ] Оставить java.version=21

### Фаза 3 — Компиляция и исправление API-дрейфа
- [ ] mvn compile
- [ ] Исправить ошибки импортов/аннотаций Spring Security 7, Hibernate 7, Flyway 11, jjwt 0.13, springdoc 3.x
- [ ] Прогнать mvn test, исправить падения

### Фаза 4 — Конфигурация
- [ ] Проверить application.yml + dev/prod профили через отчёт properties-migrator
- [ ] Убрать spring-boot-properties-migrator
- [ ] Обновить ARCHITECTURE.md: версия Spring Boot

### Фаза 5 — Верификация
- [ ] mvn test зелёный (числа)
- [ ] ProductPageQueryCountTest: число запросов не выросло (сравнить с baseline)
- [ ] EconomicConsistencyTest + SummaryService*Test зелёные
- [ ] docker compose up (стек поднимается)
- [ ] docker-stack.yml зелёный (локально по возможности)

## Решения
- Целевая линия: 4.1.2 (не milestone/RC).
- Java остаётся 21 (BL-37).
- properties-migrator удаляется после успешного прогона.

## Заметки / прогресс
- Выполнено 2026-11-04: parent → 4.1.2, mapstruct 1.6.3, jjwt 0.13.0, springdoc 3.2.0, flyway/testcontainers управляются BOM.
- JacksonConfig переведён на Jackson 3 (JsonMapperBuilderCustomizer, tools.jackson).
- application.yml/dev/prod: убран write-dates-as-timestamps, server.error → spring.web.error.
- Тесты: 195 unit (без integration/smoke/MetaController) зелёные; интеграционный набор заблокирован отсутствием Docker/PG в среде (как в Step 4).
- Compose config валиден (`docker compose config`), Docker daemon в среде не стартует.
- properties-migrator добавлен и удалён после проверки конфига.
- ARCHITECTURE.md/README обновлены до Spring Boot 4.1.2.
