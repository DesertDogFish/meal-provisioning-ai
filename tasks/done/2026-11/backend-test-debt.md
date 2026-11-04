# Задача: Тестовый долг backend: ЕМИСС, цены, сервисы без покрытия

Status: DONE
Created: 2026-11-02
Closed: 2026-11-05
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-1. `EmisUnitTest` (unit, `backend/src/test/java/com/provision/service/`).
- [x] BL-4. `EmisCatalogServiceTest` + `EmisControllerTest` (`@WebMvcTest`): поиск по подстроке
- [x] BL-5. Привязка продукта (integration): `ProductRequest.emisCode` — несуществующий код →
- [x] BL-6. Сид V29 (integration): 191 привязка и 13 без привязки; «Бумага туалетная, рулон» —
- [x] BL-7. Пайплайн синка (integration): `PriceSyncService.runSync` из локальной копии →
- [x] BL-24. Генератор большой SDMX-фикстуры и память-бенчмарк в дереве. Доказательство
- [ ] BL-42. JaCoCo-гейт на backend + unit-тесты на сервисы без покрытия (XL — отдельный файл — отложено до JaCoCo/coverage-gate (нужен Postgres)
- [x] BL-58. Golden-fixtures живых ответов ЕМИСС: страница показателя и варианты A/B/C/D.
- [x] KB-9. Новое поведение ЕМИСС не покрыто тестами

## Карточки (текст перенесён дословно)

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
  `tasks/done/2026-10/2026-10-28-price-sync-lazy-session.md`: вызов фонового синка ВНЕ транзакции
  со стаб-провайдером (`@ContainerSuite`, Testcontainers/LocalPgFallback) — настоящая защита
  от возврата `LazyInitializationException`, которую unit-тесты с Mockito не ловят.
  Статус: READY

## ЕМИСС, цены и единицы

- **BL-24. Генератор большой SDMX-фикстуры и память-бенчмарк в дереве.** Доказательство
  «66,2 МБ выгрузки разбираются в 128 МБ heap» получено харнесом ВНЕ репозитория
  (`/tmp/harness3/BigSdmx.java` + сгенерированный `big-sdmx.xml`), поэтому в CI оно не
  повторяется и может тихо протухнуть. Что сделать: тестовый генератор SDMX (параметры — число
  позиций, регионов, месяцев) в `backend/src/test/java/com/provision/integration/` + замер
  пика heap (например, `@EnabledIfSystemProperty` или тег `big`, чтобы не гонять его в каждом
  прогоне). Критерий приёмки: генератор собирает документ ≥ 60 МБ во временный файл, разбор
  даёт ожидаемое число точек и позиций, пик heap не превышает заданный порог; обычный `mvn test`
  не замедляется. Источник: подзадача 6 плана `tasks/done/2026-10/2026-10-29-sdmx-stax-streaming.md`.
  Статус: READY

- **BL-42. JaCoCo-гейт на backend + unit-тесты на сервисы без покрытия** (XL — отдельный файл
  плана). Что сделать: JaCoCo `prepare-agent` + `report` + `check` (порог начать с 50% lines
  non-blocking, постепенно до 70%); приоритетный порядок тестов: `ShoppingListCalculator` →
  `TripService` → `SubstitutionService` → `MealCompositionService` → `TripCatalogSnapshotService`
  → `PriceSyncService` → `IntegrationService`; слой — unit/Mockito без Spring-контекста (R2),
  образец — `EmisPriceApplierTest`, `EmisMirrorServiceTest`, `PriceSyncPayloadTest`,
  `IntegrationUploadTest`. Критерий приёмки: `mvn verify` публикует отчёт и валится ниже порога;
  у приоритетных сервисов есть свои тест-классы; покрытие `service/**` ≥ 70% lines. Источник: внешний аудит 30.10.2026, AU-08 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  **Поправка 02.11.2026 (план `tasks/done/2026-11/2026-11-02-audit-security-usability-ui.md`, подзадача 2):**
  механизм гейта реализован и согласован с этой карточкой — ОДНО число и ОДИН механизм:
  профиль `coverage-gate` в `backend/pom.xml` (LINE COVEREDRATIO, `minimum` 0.60 — между
  стартом 50 % и целью 70 % этой карточки), вызов `mvn -P coverage-gate verify` в ci.yml;
  замер в песочнице 02.11.2026: 68.4 % LINE (3418/4999, без трёх тяжёлых сьютов —
  в CI не ниже). Остаток карточки: unit-тесты приоритетных сервисов (`MealCompositionService`,
  `SubstitutionService`, `SyncLogService` — худшие по пропущенным строкам) и плавное
  поднятие `minimum` к 0.70 по мере их появления. Статус: READY (остаток)

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
  `tasks/done/2026-10/2026-10-29-sdmx-stax-streaming.md`.
  Статус: READY

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
- Источник: `tasks/done/2026-10/2026-10-28-emis-local-copy-and-product-linking.md`.
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
  8/8 и `EmisMirrorServiceTest` 6/6, план `tasks/done/2026-10/2026-10-29-full-audit.md`,
  подзадача 27): `PriceSyncService` (оркестрация синка
  и счётчики — частично покрыт метриками emis.sync.* того же плана), `priceSyncStatus`
  в `ProductService`, multipart-путь загрузки файла
  (`IntegrationService.uploadSnapshot`, `api.postFile`), сиды V27/V28/V29 (идемпотентность
  проверена двойным прогоном вручную), `JdkEmisTransport` (живая сеть — KB-10).
- Статус: OWNER TASK (01.11.2026)
  ЕМИСС тесты: согласование с владельцем продукта. 

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

(заполняется при закрытии)
