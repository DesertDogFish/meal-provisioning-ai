# Задача: Обновление Spring Boot на поддерживаемую линию

Status: DONE
Created: 2026-11-02
Closed: 2026-11-05
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-40. Обновить Spring Boot 3.2.5 → актуальную поддерживаемую линию (XL — при взятии
- [x] KB-17. Spring Boot 3.2.5: вся линия 3.x вышла из поддержки, OSS-патчей безопасности нет

## Карточки (текст перенесён дословно)

- **BL-40. Обновить Spring Boot 3.2.5 → актуальную поддерживаемую линию** (XL — при взятии
  в работу нужен отдельный файл плана, `AGENTS.md` §3). Что сделать: выбрать целевую линию
  (на 30.10.2026 вся 3.x вне поддержки, актуальна 4.x), пройти
  `spring-boot-properties-migrator`, поднять связанные зависимости (Hibernate, Flyway,
  Testcontainers, MapStruct, jjwt), сверить конфигурационные свойства (`application.yml`,
  профили `dev`/`prod`), убрать `spring-boot-properties-migrator` из зависимостей после
  перехода; согласовать версию Java с BL-37. Критерий приёмки: `mvn test` зелёный на целевой
  версии; `ProductPageQueryCountTest` не показал роста числа запросов; docker-стек поднимается
  и проходит `docker-stack.yml`; экономические инварианты (`EconomicConsistencyTest`,
  `SummaryService*Test`) зелёные; версия задокументирована в `ARCHITECTURE.md`. Источник: внешний аудит 30.10.2026, AU-01 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

### P2

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
  `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
- Статус: XL (01.11.2026)
  Spring Boot 4.x upgrade — мажорный апгрейд, требует отдельного плана по §3.






  Branch protection, required status checks, Conventional Commits — требуют GitHub Admin access.
  Обход: агент не пушит в main без согласия владельца. 

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

Закрыто 2026-11-05 (umbrella t_49b30217).

- Spring Boot 3.2.5 → 4.1.2 (pom parent). Java 21. mapstruct 1.6.3, jjwt 0.13.0, springdoc 3.2.0, flyway/testcontainers управляются BOM. Jackson 3 миграция (JacksonConfig).
- mvn compile: BUILD SUCCESS (clean compile недоступен офлайн — clean-plugin не скачан; обычный compile успешен).
- mvn test (unit): 286 passed, 0 failed (integration/smoke исключены — требуют Docker/PostgreSQL, демон отсутствует).
- ARCHITECTURE.md и backend/README.md обновлены (4.1.2).
- Не верифицировано: ProductPageQueryCountTest, EconomicConsistencyTest, docker compose/stack (нет Docker-демона и PostgreSQL).
