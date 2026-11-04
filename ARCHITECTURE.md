# Architecture

> **Что этот документ:** факты, контракты, принятые архитектурные решения (ADR), целевая
> структура. **Чего здесь нет:** истории задач («что делалось в патче N» — в `tasks/done/`),
> летучих чисел (версии зависимостей, номера миграций, число строк/тестов/покрытие — только
> ссылка на источник правды: `backend/pom.xml`, `package.json`, `db/migration/`, CI).

Стек бэкенда: Spring Boot 4.1.2 (Java 21), PostgreSQL 15 + Flyway (источник правды по версиям — `backend/pom.xml`).

> Правило для правок: новое решение → раздел «Архитектурные решения»; новый факт/контракт →
> тематический раздел; отчёт о работе → файл задачи, НЕ сюда. Прежняя редакция (с историей
> патчей) заморожена: `tasks/done/archive/architecture-pre-rewrite-2026-11-02.md`.

## Overview

Provision — SPA + REST-бэкенд + PostgreSQL. Домен: каталог продуктов и блюд (глобальный,
ведёт админ), походы пользователей (меню по дням/приёмам), расчёт закупок/стоимости/
калорийности, интеграция Росстат/ЕМИСС (средние потребительские цены).

Ключевой инвариант: **поход не ссылается на глобальный справочник** — приёмы пищи указывают
на trip-scoped копии блюд и продуктов (снепшоты); справочник и цены живут своей жизнью,
план похода заморожен на момент планирования (ADR-2).

## Data Flow

### Режимы работы

| Режим | Источник данных | Когда |
|---|---|---|
| `real` | REST API бэкенда (`VITE_API_URL`, в Docker — same-origin через nginx `/api`) | продакшн-сборка, compose |
| `mock` | `src/api/mockServer.ts` (фасад) + модули `mock*` (in-memory + localStorage) | офлайн-демо, component/e2e-тесты |
| `auto` | пинг `GET /api/v1/meta` (700 мс), фолбэк в mock + watchdog-возврат | дефолт dev-сборки |

**Прод = только real** (ADR-1). Mock (демо-данные, бейдж `ApiModeBadge`, переключатель,
auto-фолбэк) доступен только в dev-сборке или прод-сборке с явным `VITE_ENABLE_MOCK=true`
(демо-стенд Vercel — `vercel.json → build.env`). В проде без флага `apiMode=mock` в
localStorage и `VITE_API_MODE=mock` игнорируются, `resolveMode` всегда даёт `real`, чанк
`mockServer` в артефакт не попадает (мёртвая ветка dynamic import), а при недоступном
бэкенде страницы показывают ошибку с кнопкой «Повторить» вместо тихого ухода на демо-данные.
Приоритет (dev/демо): переключатель UI (localStorage `apiMode`) → `VITE_API_MODE` → auto.
Формы ответов mock и real обязаны совпадать — это фиксируют contract-тесты
(`npm run test:contract`, nightly parity).

### Слои данных

```
React-страницы ── ApiClient (fetch + refresh single-flight + ProblemDetail-ошибки)
   │  real: /api/v1/**          mock: mockServer (те же роуты и формы ответов)
   ▼
Spring MVC controllers (DTO records, Bean Validation, RFC7807-подобные ErrorResponse)
   ▼
Services (@Transactional; ownership-проверки trip.user == principal)
   ▼
Spring Data JPA repositories (@Query JOIN FETCH / DISTINCT ON; Specifications для продуктов)
   ▼
PostgreSQL + Flyway (ddl-auto=validate; источник правды по версиям — `backend/src/main/resources/db/migration/`)
```

Правки состава и снепшоты применяются в расчётном конвейере `SummaryService.computeShopping`
— единая @Transactional-точка для shopping / by-days / person / kcal (без self-invocation и N+1).

## Core Calculations

### Калорийность

Только из продуктов: `kcal(порция) = Σ kcal_per_100g × граммы / 100 / base_servings`, где
граммы = `amount×1000` (KG/L) или `amount×piece_weight_g` (PCS/PACK). Колонка
`recipes.calories_per_serving` — deprecated legacy. Ккал приёма = порция × effectivePeople;
ккал/чел/день = Σ приёмов дня / people дня.

### Люди и количества

`effectivePeople = meal.peopleOverride ?: day.peopleOverride ?: trip.defaultPeople`.
Количество ингредиента на приём = `recipe_amount / base_servings × effectivePeople`
(scale 3, HALF_UP), с применением правок состава: `removed` исключает строку, `added`
(EXTRA) добавляет `amount_per_serving` КАК АБСОЛЮТ на приём — без масштабирования
людьми/baseServings (ADR-3), substitution переносит количество `from → to × ratio`.
Конвертация единиц — единый источник `UnitOfMeasure.gramsPerOne/toGrams`
(KG/L → ×1000; PCS/PACK → ×piece_weight_g, без него конвертация неизвестна).

### Закупки и упаковки

Агрегат по ингредиенту: сумма по приёмам дня (by-days) и по дням (shopping). Упаковки: при
`round_to_packs` и `pack_size`: `packsToBuy = ceil(total/pack_size)`, `buyAmount =
packs×pack_size`, `leftover = buyAmount − total`. Та же формула на клиенте —
`utils/checklist.ts` (паритет `SummaryService.calculatePacks` охраняется тестом).

### Стоимость (план/факт)

- **План по дням:** `qty_day × plannedUnitPrice(ingredient, day)`; цена = последняя с
  `effective_from ≤ date` (price-series кэш, DISTINCT ON-запросы).
- **План похода (строка):** Σ по дням; `plannedUnitPrice` строки = средневзвешенная
  `plannedCost/qty` (scale 2).
- **Факт:** `actualUnitPrice = trip_price_override ?: plannedUnitPrice`;
  `actualCost = qty × actualUnitPrice`. Оверрайд ставится из чека
  (`PUT /trips/{id}/price-overrides/{ingredientId}`, цена ЗА ЕДИНИЦУ) и действует на весь поход.
- **Снепшот:** у продуктов-копий одна строка цены, замороженная при создании копии →
  правки глобальных цен план похода не меняют.
- `deltaPercent = (actual−planned)/planned×100` (scale 2; planned=0 → 0).
  Итоги = сумма округлённых строк.

### Эталон округлений

| Величина | Scale | Режим |
|---|---|---|
| количества (приём, агрегаты) | 3 | HALF_UP |
| деньги строки и итоги | 2 | HALF_UP |
| unit price в ответах | 2 | HALF_UP |
| packs/buy/leftover | 3 (packs — int) | CEIL для packs |
| ккал | 0 | HALF_UP |

Округление только на выводе; внутренние расчёты — полная точность. Клиент НЕ пересчитывает
деньги/ккал (ADR-10): источник — ответы `/summary/*`.

### Формат вывода чисел и единиц

Единственный источник — `src/utils/format.ts`; форматировать числа в компонентах напрямую
(`toFixed`, дефолтный `toLocaleString`) запрещено:

| Что | Функция | Результат | Пример |
|---|---|---|---|
| Итоговые суммы (KPI, «Итого», чеки) | `formatRub` | целые ₽, неразрывный пробел тысяч и перед ₽ (₽ не переносится) | «1 234 ₽» |
| Цены за единицу | `formatPrice` | ровно 2 знака, запятая | «887,65» |
| Количества | `formatQty` | человеческая единица, адаптивная точность | «200 г», «1,5 кг», «8 шт», «2 уп» |
| Короткая единица для подписей | `unitShortLabel` | кг/г/л/мл/шт/уп, пусто → «ед.» | «₽ / кг» |
| Категория продукта | `categoryName` | DTO-объект или строка → строка | «Мясо» |

Разделитель тысяч — неразрывный пробел (ru-RU), десятичный — ЗАПЯТАЯ, всегда. `humanize`
(client.ts, calc.ts) и `formatAmount` (calculations.ts) — обёртки над `formatQty`.

DTO-рассинхрон имён/единиц закрыт нормализацией в одном месте: бэкенд в рецептах отдаёт
плоские поля (`ingredientId/ingredientName/unit/unitLabel`), mock — вложенный `ingredient`.
Все загрузки — через `getRecipes`/`getTripRecipes` (client.ts, `normalizeRecipe`); расчётное
ядро читает обе формы через `ingOf`. Прямые `api.get('/recipes'|'/trips/{id}/recipes')` в
компонентах запрещены. Итоги похода — ОДИН источник: KPI шапки и «Итого» в закупке из
`shoppingTotalFinal`, «По дням» — `calculateDayShopping` с теми же исключениями.

## Изоляция каталога похода (снепшоты)

Приём пищи ссылается на trip-scoped копию: у `recipes` и `ingredients` есть `trip_id`
(NULL = глобальный справочник) и `snapshot_of` (оригинал; ON DELETE SET NULL). Копия
создаётся при добавлении приёма (`TripCatalogSnapshotService.snapshotRecipeForTrip`):
рецепт + задействованные продукты (по разу на поход) + одна строка цены на продукт-копию.

Следствия:
- админ может удалять/менять глобальные блюда и продукты, не ломая спланированные походы;
- правки глобальных цен не меняют план похода (факт — через `trip_price_overrides`);
- каталожные эндпоинты (`GET /recipes`, `GET /admin/products`, `GET /prices`) отдают только
  глобальные записи (`trip_id IS NULL`);
- страницы похода берут блюда через `GET /trips/{id}/recipes`, цены — `GET /trips/{id}/prices`
  (fallback на глобальные для legacy-походов до снепшотов);
- уникальность имени продукта (`name_norm`, `unit`) — partial-индекс только по глобальным;
  копии создаются с `code = NULL`.

Правила привязки (охраняются `EconomicConsistencyTest`):
- **один снепшот на (поход, оригинал)**: `createRecipeCopy` переиспользует копии продуктов
  других рецептов похода (`findByTripIdAndSnapshotOf`);
- **заморозка цены на дату старта похода**: копия получает строку цены с
  `effective_from ≤ trip.startDate` (фолбэк — на сегодня); замороженный план виден при
  резолве на любой день и сервером (`loadLatestPrices`), и клиентом (`findPriceForDate`);
- **все ссылки похода — только trip-scoped**: `updateMeal` снепшотит рецепт как `addMeal`;
  `MealCompositionService.putComposition` резолвит каждый входящий id модулем
  `TripScopedIdResolver` (строка рецепта → её снепшот → продукт своего похода → снепшот-копия
  глобального; чужой trip-scope/несуществующий → 404); `TripPriceOverrideService` редиректит
  чек, введённый на глобальный id, на снепшот похода.

Семантика удаления блюд: `DELETE /admin/recipes/{id}` отвечает 409 только если приёмы
ссылаются НАПРЯМУЮ на этот id (возможно лишь для legacy-строк до снепшотов). Клиент не
блокирует удаление превентивно по `usedIn`, а показывает ответ сервера; mock при удалении
занятого глобального блюда перепривязывает такие приёмы на снепшот-копии.

## Правки состава приёма (composition API)

Хранение — поверх `trip_ingredient_substitutions` (без отдельной таблицы):

| State UI | Хранилище | Эффект в конвейере |
|---|---|---|
| RECIPE | записи нет | derived = amount/baseServings × people |
| SCALED | from=X, to=X, ratio | derived × ratio |
| EXTRA | added=true, from=null, to=X, amount_per_serving = абсолют на приём | добавка к агрегату БЕЗ масштабирования (`EffectiveLine.absolute`) |
| EXCLUDED | removed=true, to=null | строка рецепта пропускается |
| замена | from=A, to=B, ratio | qty(B) += qty(A)×ratio; qty(A) := 0; SCALE-правки A переносятся на B |

API: `GET/PUT /api/v1/trips/{tripId}/meals/{mealId}/composition` (GET — сервер считает
масштабирование и totals; PUT — атомарный batch-диф desired-состояния; desired-PUT не
включает EXTRA-строку, помеченную «Удалить»; отсутствие EXTRA в items = удаление правки).
SUBST с from==to отклоняется валидацией сервиса (400), в GET/PUT-ответе источник замены
обнулён (иначе totals считали бы продукт дважды). Порядок в конвейере:
SCALE → people → EXCLUDE → EXTRA → substitutions.

Конкурентность: batch-PUT берёт `OPTIMISTIC_FORCE_INCREMENT` на строке приёма, поэтому два
одновременных сохранения состава не могут молча перезаписать друг друга — вторая запись
получает 409, а клиент показывает диалог «данные изменились» с перечитыванием.

Модули (SRP): `MealCompositionService` — оркестратор (валидация, контекст, GET-ответ),
`CompositionDiffEngine` — диф-коммит, `TripScopedIdResolver` — резолв входящих id,
`CompositionCalculator` — чистая математика веса/ккал/стоимости. UI: `MealCompositionModal`
(5 статусов-бейджей, merge-подтверждение, инлайн-замены, dirty-state, live-итоги; свободный
ввод при сохранении резолвится в справочник через check-name/`POST /admin/products` — на
сервер уходят только реальные id).

## Цены: локальная копия ЕМИСС (Росстат)

Единственный провайдер — `RosstatEmisProvider` (code `ROSSTAT`): средние потребительские
цены Росстата через ЕМИСС (fedstat.ru), ежемесячно. **Портал — только транспорт** (ADR-4):
приложение не ходит в сеть за ценой при расчёте чека, источник цен — локальная копия в БД.
Контракт провайдера: `PriceProvider` (`code`, `testConnection`) + `EmisDataSource`
(`downloadSnapshot`, `parseSnapshot`). Прежний провайдер Open Food Facts демонтирован
полностью (данные вычищены миграцией; `source='OFF'` в схемах не существует).

### Локальная копия и привязка

- `emis_products` — справочник позиций: `code` (PK), `name`, распознанная единица наблюдения
  (`unit_kind` MASS/VOLUME/COUNT/OTHER, `unit_amount`, `unit_scale` KG/G/L/ML/PCS,
  `unit_label`), `loaded_at`.
- `emis_prices` — точки цен: unique `(emis_code, region_code, period_year, period_month)`,
  `price numeric(14,2)`; индекс под «последнюю цену».
- Регион — один (`643004.АГ`, РФ без новых субъектов); глубина — `period-years` из конфига
  (точки вне окна отбрасываются при записи, устаревшие удаляются).
- Внешних ключей между `emis_*` и `ingredients` нет намеренно: привязка «софт»
  (`ingredients.emis_code`), продукт не ломается, пока справочник не загружен.
- Несколько продуктов на одном коде — законно (цена синка приходит одна на всех → значок
  «общая привязка» + счётчик `emisSharedCount` в `ProductResponse`, считается пакетно без N+1).
- `ProductRequest.emisCode`: пусто/null = отвязать; неизвестный код = `VALIDATION_ERROR`.
- `ProductResponse`: `emisCode`, `emisName`, `priceSyncStatus` = `NOT_LINKED` / `NO_DATA` /
  `SYNCED`, `emisSharedCount`.
- Поиск позиций для привязки: `GET /admin/emis/products?query=&limit=[&unit=&pieceWeightG=&price=]`
  → `EmisProductDto(code, name, unitLabel, latestPrice, latestPriceDate, pricePerUnit, warning)`;
  с контекстом продукта цена пересчитывается на НАШУ единицу и добавляется `warning`
  (пересчёт только на сервере — деньги на клиенте не считаются). UI: `EmisLinkPicker`
  в модалке продукта (debounce, цена/период в списке, «Отвязать»).

### Единица наблюдения и пересчёт цены

Название позиции ЕМИСС определяет, к чему относится цена ряда:
- «…, 10 шт.» / «…, 25 пакетиков» — COUNT с `unit_amount`: цена ЗА НАБОР;
- «…, упаковка 500 листов» — слово-упаковка впереди числа: COUNT, `unit_amount=1`,
  цена ЗА УПАКОВКУ ЦЕЛИКОМ;
- «…, кг» / «…, л» / «…, 100 мл» — MASS/VOLUME с масштабом.

`EmisPriceApplier` + `EmisUnit.pricePerUnit` приводят цену ряда к единице продукта
(`piece_weight_g` для штучных): KG→KG = P; KG→PCS = P·pw/1000; G(n)→KG = P·1000/n;
G(n)→PCS = P·pw/n; L→L = P; ML(n)→L = P·1000/n; COUNT(n)→PCS = P/n.

**Плотность ≈ 1 (решение владельца, ADR-5):** масса и объём пересчитываются 1:1
(KG→L = P, ML(n)→L = P·1000/n, L→KG = P, ML(n)→KG = P·1000/n), `piece_weight_g` штучного
продукта при цене ряда ЗА ОБЪЁМ читается как миллилитры: ML(n)→PCS = P·pw/n. Для сред с
плотностью далеко от 1 (сжиженный газ, аэрозоли) правило физически неверно — такие позиции
не привязываются вовсе. Отбрасываются (точка уходит в `skipped`-счётчик, не искажая цену):
COUNT→KG/L (нет веса штуки) и OTHER (услуга/нераспознанный суффикс). Эвристик по названию
продукта нет: единица берётся из названия позиции ЕМИСС.

**Предупреждение о сомнительной паре** (не блокирует привязку — решение владельца):
`EmisUnit.convertsTo(unit, pieceWeightG)` — возможен ли пересчёт в принципе;
`EmisUnit.linkWarning(...)` собирает текст по трём признакам: (1) пересчёт невозможен;
(2) масштаб не сопоставим — единица наблюдения крупнее штуки продукта ≥ 100 раз;
(3) цена уехала — после пересчёта отличается от текущей ≥ 10 раз.

### Пайплайн синхронизации

`POST /admin/integrations/ROSSTAT/sync/prices` → 202 `{logId}` →
`IntegrationService.executePriceSync` (`@Async`-граница) → `PriceSyncService.runSync`:

1. **download** — одна попытка, без транзакции и БД-сессии (`open-in-view: false`);
2. **`EmisMirrorService.store`** (`REQUIRES_NEW`) — upsert справочника и цен, обрезка окна
   `period-years`; счётчики (`products`, `prices`, `deleted`) → `SyncLog.details.mirror`
   вместе с `snapshotSource` («портал rosstat» / «файл <имя>»);
3. **`EmisPriceApplier.apply`** на каждый привязанный продукт (`REQUIRES_NEW`) — пересчёт
   единицы, upsert `ingredient_prices` (`source=ROSSTAT`) по датам точек;
4. **`finalizeSyncLog`** — статус ВЫВОДИТСЯ из счётчиков: `errors==0 → SUCCESS`,
   `errors>0 && работа выполнена → PARTIAL`, `errors>0 && ничего не сделано → FAILED`.

**Ручные цены не защищены (решение владельца):** у привязанного продукта синк перезаписывает
действующую цену любого источника и удаляет оставшиеся ручные срезы
(`deleteManualByIngredientId`) — иначе стоимость меню считалась бы по вчерашней ручной цифре.
В деталях запуска: `перезаписано N, удалено M`; действия строк — `CREATED/UPDATED/SKIPPED/ERROR`.

Правила фонового кода: **никаких JPA-сущностей между транзакциями** (между шагами —
plain-record `LinkedProduct`/`LocalPrice`), **короткие `REQUIRES_NEW`-транзакции только
через self-прокси** (`ObjectProvider<…>`; вызов через `this.` обходит прокси Spring),
внутри транзакции сущность перезагружается по id.

### Ручная загрузка выгрузки (multipart)

ЕМИСС блокирует зарубежные дата-центры и отдаёт `302`/`503` на узкие наборы фильтров,
поэтому ручная загрузка файла — полноценный путь, а не аварийный:

- `POST /admin/integrations/{provider}/upload`, multipart-поле `file` → 202 `{logId}`;
  тот же `PriceSyncService.runSync`, но `parseSnapshot(bytes, fileName)` вместо скачивания;
  подключение провайдера НЕ требуется.
- Защиты: неизвестный провайдер → 404; пустой файл → 400 `EMPTY_FILE`; идущий синк → 409
  `SYNC_ALREADY_RUNNING`; ошибка чтения → 400 `FILE_READ_ERROR`; не-SDMX/слишком большой →
  `IntegrationUnavailableException` с причиной.
- Лимит объёма — ТРИ согласованных значения (меняются только вместе):
  `integration.rosstat.max-response-bytes` = `EMIS_UPLOAD_MAX_FILE_SIZE` (multipart) =
  `client_max_body_size` в `nginx.conf` (96 МБ).

### Протокол портала (как качаем)

Прямой «ссылки на CSV» у ЕМИСС нет; протокол (референс — CRAN fedstatAPIr):

1. `GET {base-url}/indicator/{indicator-id}` — страница показателя; сессия прогревается
   GET главной страницы (JSESSIONID до целевого запроса);
2. одноразовый Struts CSRF-токен: канонически из `div#downloadTokenHolder`
   (`input[name=struts.token.name]` → имя, `input[name=<имя>]` → значение), fallback —
   пара токенов по документу, затем одиночный `input[name=struts.token]`. Имя поля НЕ
   хардкодится. С неверным именем портал отвечает `200 text/html` и заглушкой «CSRF блокировка»;
   при ненайденном токене ошибка несёт диагностику страницы (title, размер, маркеры, видимый
   текст) — единственный канал отладки при геоблоке;
3. словари фильтров из встроенного JS страницы: объект после маркера `filters:` (извлечение
   балансировкой скобок с учётом строк; читается Jackson: ALLOW_SINGLE_QUOTES /
   ALLOW_UNQUOTED_FIELD_NAMES);
4. `POST {base-url}/indicator/downloadData.do?format=sdmx`, form-urlencoded: `title`,
   `struts.token.name`, `<имя токена>`, `id` (= `indicator-id`), `lineObjectIds*`,
   `columnObjectIds*`, `selectedFilterIds*`, `filterObjectIds`. POST с `Redirect.NEVER`:
   `302` + `Location` = портал отклонил набор фильтров;
5. ответ — SDMX 1.0 GenericData: `CodeLists` (всегда полные словари независимо от фильтров —
   одна выгрузка обновляет весь справочник) + `Series/Obs`. Год — в `Obs/generic:Time`,
   месяц — в атрибуте ряда `Series/Attributes/Value[@concept="PERIOD"]` русским названием,
   регион — `s_OKATO`, товар — `s_grtov` (код классификатора), цена — `Obs/ObsValue/@value`
   с запятой как разделителем.

**Разбор потоковый (StAX, ADR-6):** `SdmxStreamParser.parse(InputStream, regionTitle, maxBytes)`
захватывает поддерево `CodeList`/`Series` в момент закрытия — в heap живёт ОДИН ряд, память
не растёт с объёмом выгрузки (66 МБ разбираются при `-Xmx128m`). XXE закрыт
(`SUPPORT_DTD=false`, внешние сущности запрещены). Ряды до словаря товаров буферизуются
(потолок 10 000 — превышение прерывает разбор внятной ошибкой). `LimitedInputStream` обрывает
ЧТЕНИЕ на `max-response-bytes`. Транспорт отдаёт тело потоком
(`EmisTransport.Session.postFormStream` → `StreamResult`); диагностика отказа собирается по
«голове» ответа (4 КБ, PushbackInputStream): HTML-заглушка CSRF, `text/html` вместо SDMX,
`302`, `503` различимы без чтения всего тела.

Инварианты портала (подтверждены живыми зондами): все поля с несколькими значениями обязаны
присутствовать в `selectedFilterIds` (иначе `302`); ось «Год» сужать НЕЛЬЗЯ (`302`),
«Период» и «Товары» — можно; полный ряд — десятки МБ (ограничивает только `max-response-bytes`);
после ~12 быстрых POST портал троттлит `503`.

**Выбор фильтров:** регион — один (из конфига); товары, годы, единицы — ВСЕ значения;
ось «Период» — `period-months` последних месяцев (0 = все 12; окно хранения режет
`EmisMirrorService`). Один POST на синхронизацию.

### Конфигурация

`integration.rosstat.{base-url, indicator-id, region, region-code, user-agent, period-years,
period-months, max-response-bytes}`; `integration.contact-email` — контакт для UA;
`EMIS_UPLOAD_MAX_FILE_SIZE` — лимит multipart. Индикатор по умолчанию — «Средние
потребительские цены на товары и услуги» (месяц). Кэша нет намеренно: единственная точка
входа — кнопка синхронизации (или файл), её смысл — положить в БД свежие данные.
Страж биндинга конфига — `RosstatConfigBindingTest`.

**Версия приложения в User-Agent:** единственный источник версии — `backend/pom.xml`;
`app.version: ${APP_VERSION:@project.version@}` (фильтрация ресурсов spring-boot-parent),
`APP_VERSION` переопределяет без пересборки; `build-info` (spring-boot-maven-plugin) кладёт
в jar `META-INF/build-info.properties` — по нему видно, какая сборка отвечает.

**Ограничения (честно):** ЕМИСС блокирует зарубежные дата-центры (live-проверка из CI
невозможна, работает из сети РФ); портал нестабилен → ручная загрузка полноценна; данные —
раз в месяц; позиции общие («Консервы мясные», не «Тушёнка 325 г»), поэтому часть продуктов
привязана к цене категории — приближённо, по решению владельца.

## API-контракт (Frontend ↔ Backend)

### Ошибки и DTO

- Ошибки: `{type,title,status,detail,instance,errors[],usedIn[]}` (RFC7807-подобные); коды
  конфликтов машиночитаемые: `DUPLICATE_PRODUCT`, `PRODUCT_IN_USE`, `DUPLICATE_PRICE_DATE`,
  `RECIPE_IN_USE` (исторический — для рецептов недостижим через походы),
  `SYNC_ALREADY_RUNNING`. В профиле `prod` `detail` внутренних исключений
  (`IllegalArgumentException`/`IllegalStateException`, ошибки каркаса Spring MVC) заменяется
  стабильным кодом; доменные исключения (`ValidationException`, `NotFoundException`,
  `ConflictException`) отдают пользовательский текст; неизвестный API-путь → 404 ProblemDetail.
- `RecipeResponse.ingredients[]`: `{ingredientId, ingredientName, unit, unitLabel, amount}`
  (плоские поля) + расширения `categoryName/packSize/roundToPacks/pieceWeightG/kcalPer100g`;
  `CompositionResponse.catalogRecipeId` (`snapshotOf ?: id`) — навигация «Изменить блюдо в
  справочнике» из приёма со снепшотом.
- `ShoppingItemResponse`: план/факт пары + `packSize/packsToBuy/buyAmount/leftoverAmount/substitutedFrom`.
- Поля снепшотов: `tripId`, `snapshotOf` у рецептов/продуктов (копии не попадают в каталожные списки).
- Пагинация продуктов: Spring Page (`content/page/size/totalElements/...`); mock повторяет форму.

### Даты и деньги

ISO: `YYYY-MM-DD` (date-only) и ISO-8601 datetime; в БД `TIMESTAMP WITHOUT TZ` —
соглашение «серверное время» (миграция на TIMESTAMPTZ — открытая задача). Деньги:
`NUMERIC(10,2)` RUB в БД; в JSON — number с 2 знаками; отображение — «Формат вывода» выше.

### Эндпоинты похода (семантика, которую обязан держать и mock)

```
GET  /api/v1/trips                        список с полем progress (см. ниже)
PUT  /api/v1/trips/{id}                   имя/заметки/defaultPeople всегда; смена дат —
                                          ЧАСТИЧНОЕ стирание: дни вне диапазона удаляются
                                          (приёмы orphanRemoval, дневные ручные позиции CASCADE),
                                          пересекающиеся дни сохраняют план (те же id),
                                          недостающие даты добавляются; UI — confirm с перечнем
GET  /api/v1/trips/{id}/recipes           trip-scoped копии блюд
GET  /api/v1/trips/{id}/prices            trip-scoped срезы цен (fallback: глобальные)
GET  /api/v1/prices                       глобальные latest-срезы
GET  /api/v1/trips/{id}/summary/{menu|shopping|shopping/by-days|person}
GET/PUT /api/v1/trips/{id}/meals/{mealId}/composition     состав приёма (batch-диф)
GET/POST /api/v1/trips/{id}/manual-items, DELETE .../{itemId}
                                          ручные позиции; DTO {id, tripId, dayId|null,
                                          ingredientId, ingredientName, unit, amount, note?};
                                          amount — абсолют; вливаются в закупку (все),
                                          «по дням» (dayId), чеклист (все)
GET/POST /api/v1/trips/{id}/shopping-exclusions, DELETE .../{ingredientId}
                                          одно множество ключей двух форматов: <ingredientId>
                                          (весь поход) и <dayDate>::<ingredientId> (день);
                                          PUT {items:[{ingredientId, dayDate|null}]} (legacy
                                          ingredientIds принимается); дневное исключение
                                          уменьшает количество дня и агрегат, но не вычёркивает
                                          позицию в другие дни
POST /api/v1/trips/{id}/menu-approval       toggle утверждения меню ① (owner-only;
                                          200 + полный TripResponse; 404 чужой поход)
GET/POST/DELETE /api/v1/trips/{id}/substitutions[/{id}]   замены from→to (ratio)
PUT/DELETE /api/v1/trips/{id}/price-overrides/{ingId}     факт-цены (чеки), за единицу
GET/PUT /api/v1/trips/{id}/checklist-bought               отметки «взято» (см. ниже)
GET/PUT /api/v1/trips/{id}/checklist-actual-qty           фактическое количество чеклиста
                                          («сколько реально берём/взяли»; см. ниже)
POST/PUT/DELETE /api/v1/admin/recipes[/{id}]              ADMIN CRUD блюд с составом
```

**`progress` в списке походов** (`TripProgressResponse`):
`{stage: menu|shopping|checks, meals, checklistTotal, facts, factsTotal, totalCost,
costPerPerson}` — клиент открывает список ОДНИМ запросом (без N+1). Сервер считает на своей
стороне (`TripProgressService` поверх канонического `ShoppingListCalculator` + исключения);
mock — `mockTripProgress.buildTripProgress` через клиентский `deriveTripView` (паритет-тест).
`progress` заполняется ТОЛЬКО в списке, в `GET /trips/{id}` — null; сбой расчёта одного
похода не роняет список (best effort: null). `stage` считается без отметок «взято»; клиент
уточняет shopping → store по отметкам и считает `ready` через `utils/readiness`.

**`menuApproved` похода** (`TripResponse`, trip-workflow-redesign п.2): boolean — меню
этапа ① утверждено владельцем. Toggle `POST /api/v1/trips/{id}/menu-approval` (owner-only;
404 чужой/неизвестный; 409 CONCURRENT_MODIFICATION при конфликте `@Version`, V34).
Хранение — `trips.menu_approved_at TIMESTAMPTZ NULL` (V38, БЕЗ backfill: решение владельца
03.11.2026). Mock — роут `menu-approval` в `mockTrips.handleTripsImpl` + сид-значения в
`mockData.mockTrips`; паритет — `src/api/contractMenuApproval.test.ts`. Клиент:
`done.menu` = menuApproved (redesign п.4), этап ⑤ «Поход готов» — п.5.

**Отметки «взято» чеклиста** — серверные (`trip_checklist_bought`), сервер — источник истины,
localStorage — кэш и буфер офлайн-записи:

```
GET /api/v1/trips/{tripId}/checklist-bought   -> 200 [{ingredientId, neededStamp}]
PUT /api/v1/trips/{tripId}/checklist-bought   body {items:[{ingredientId, neededStamp}]}
```

- `neededStamp` — клиентский штамп потребности `round(needed×1000)` (`utils/checklist.ts`);
  0 легитимен (`@PositiveOrZero`), отрицательные/дробные → 400. Ключ отметки —
  `<ingredientId>@<нужно×1000>`: изменение потребности автоматически сбрасывает отметку.
- PUT — идемпотентная полная замена набора (не патч): пустой `items` очищает, дубликаты
  схлопываются, `items` ≤ 2000; неизвестный `ingredientId` → 404 с откатом (набор прежний);
  чужой поход → 404.
- Введённые факты (цена чека, «Взяли») НЕ аннулируются при изменении потребности: цена за
  единицу применяется к текущему «нужно», суммы пересчитываются.

**Фактическое количество чеклиста** (`trip_checklist_actual_qty`) — тоже серверное:

```
GET /api/v1/trips/{tripId}/checklist-actual-qty -> 200 [{ingredientId, amount, unit}]
PUT /api/v1/trips/{tripId}/checklist-actual-qty body {items:[{ingredientId, amount, unit}]}
```

- Пара `{amount, unit}` — человеческая единица ввода (`г`|`кг`|`мл`|`л`|`шт`|`уп`), не базовые
  единицы продукта: ровно то, что человек видит и правит в чеклисте и в чеке.
- Ключ — `(trip_id, ingredient_id)`: в отличие от «взято» факт НЕ привязан к штампу
  потребности и переживает пересчёт людей/состава.
- PUT — идемпотентная полная замена набора: пустой `items` очищает, дубли `ingredientId`
  схлопываются (последнее значение), `items` ≤ 2000; `amount > 0`, `unit` не пустой и ≤ 16;
  неизвестный `ingredientId` → 404 с откатом; чужой поход → 404.
- Синхронизация клиента: тот же паттерн, что у «взято» (сервер — истина, localStorage — кэш и
  буфер офлайн-записи), но БЕЗ union: у факта нет «надгробий» удалений, поэтому при `dirty`
  локальная карта авторитетна и досылается целиком, а чистый кэш заменяется серверным
  снимком. Порядок PUT на поход строго последовательный (очередь); невалидные пары не
  отправляются и вычищаются из кэша, чтобы флаг `dirty` не завис. Событие `online` досылает
  всё отложенное по походам сессии («в магазине нет связи»).

### Клиентские контракты данных

- Данные похода — только сервер (ADR-9); localStorage-ключи `trip-*` — кэш/стейдж отображения:
  `trip-checklist-actualqty-{tripId}` → `Record<ingredientId, {amount, unit}>`
  (unit ∈ 'г'|'кг'|'мл'|'л'|'шт'|'уп'; legacy-число читается как `{amount, unit:''}`);
  серверный источник — `checklist-actual-qty` (§Эндпоинты похода), ключ кэша — кэш и буфер
  офлайн-правок с `dirty`-флагом `trip-checklist-actualqty-dirty-{tripId}`;
  `trip-checklist-packs-*` — корректировка расчётных упаковок ± (расчётная математика не меняется).
  Факт-количества «Взяли» — ОДИН источник для чеклиста, колонки «Взяли» и печатного отчёта.
- `utils/recipeEdits.ts`: `buildEffectiveIngredients(ingredients, edits)` и
  `buildEffectiveRecipesMap(recipesMap, edits, snapshotOf?)` — ЕДИНЫЙ источник состава с
  правками для меню/закупки/дней/«на человека»/чека/отчёта.
- `ingredientId` в клиентских расчётах приводится к строке (`String(id)`): серверные правки
  приносят string-id, снепшот-строки и trip-цены — number-id; строгое === оставляло продукты
  «без цены».
- «На человека»: делитель `realPeople = Σ effectivePeople(дни) / число дней` (min 1) —
  `utils/calculations.ts: realTripPeople`.
- «Закупка на поход»: `hasPrice = planned || есть факт чека`; список «⚠ нет цен» — только
  позиции без плановой цены И без чека. Ввод чека суммой: «Факт ₽» = сумма за купленное
  количество, цена за единицу = `фактСумма / количество` (`utils/checkInput.ts`), хранение —
  в контракте price-overrides (за единицу).
- Префил «Взяли» ожидаемым количеством (`checkUnits.neededAsActual`) — уровень отображения,
  НЕ хранится: фактом становится только реальный ввод.
- Печатный отчёт `/trips/{id}/print` (`TripPrintPage`, без Layout): тот же клиентский конвейер
  цифр (единый источник), факт — из стейджа/price-overrides; план/факт: у позиции с чеком —
  факт; если чеки есть у всех позиций — плановые колонки не выводятся; PDF — диалогом печати
  браузера.
- Готовность похода (`utils/readiness.ts`): «меню → закупка (отметки “взято”) → чеки»;
  гейт ввода чека — boughtCount > 0.

## Key Components

### Backend

- `SummaryService.computeShopping` — единый расчётный конвейер (shopping/by-days/person/kcal),
  price-series кэш, пакетные загрузки (JOIN FETCH / DISTINCT ON / IN-батчи). Расчёт в модулях:
  `MealPlanCalculator` (люди/количества/округление итогов), `ShoppingListCalculator` (закупка,
  упаковки), `DailySummaryCalculator` (меню по дням), `PerUserSummaryCalculator` («на человека»).
- `TripCatalogSnapshotService` — copy-on-write снепшоты.
- `TripIngredientEditService`, `TripShoppingExclusionService` — правки/исключения;
  `MealCompositionService` + `CompositionDiffEngine`/`TripScopedIdResolver`/`CompositionCalculator`
  — состав приёма; `TripManualItemService` — ручные позиции (ownership 404, trip-scope резолв).
- `SearchEscape` — единое экранирование LIKE (`%`, `_`, `!` — escape-символ); пагинация
  каталога клампит page≥0, size 1..200.
- `PriceResolutionService` — actual = override ?: planned.
- `SecurityConfig` + `JwtService`/`JwtAuthenticationFilter`/`LoginAttemptService` — stateless
  JWT, rate-limit, CORS из ENV, fail-fast секрета (`JwtProperties.validate`).
- `AuthService`/`RefreshTokenRepository` — ротация и reuse-detection refresh-токенов (§Security).
- `DevDataInitializer`/`DevTripsInitializer` — демо-пользователи и демо-походы (profile `dev`
  + `SEED_DEMO_USERS=true`), демо-походы — через снепшот-сервис.
- `com.provision.integration` — модули ЕМИСС (каждый ≤ 500 строк, R8): `RosstatEmisProvider`
  (протокол и сборка слепка), `EmisPortalPage` (HTML страницы показателя), `EmisRequestForm`
  (тело POST), `JdkEmisTransport`/`EmisTransport` (транспорт, диагностика), `EmisValues`
  (словари фильтров из JS), `SdmxStreamParser` (StAX-разбор SDMX).
- `EmisMirrorService` — локальная копия (`emis_products`/`emis_prices`); `EmisCatalogService` —
  поиск позиций для привязки; `PriceSyncService` — оркестрация синка; `EmisPriceApplier` +
  `EmisUnit` — пересчёт и запись `ingredient_prices`; `SyncDetailsBuilder` — `SyncLog.details`.
- `GlobalExceptionHandler` — единый ProblemDetail (коды конфликтов, field-errors, 404 на
  неизвестный путь, профиль-зависимый `detail`).
- `TripProgressService` — `progress` для списка походов.

### Frontend

- `api/client.ts` — режимы, refresh single-flight, событие `auth:session-lost`, `postFile`
  (multipart); `api/mockServer.ts` — фасад mock-паритета (роутер `handleRequest` + тонкие
  обёртки), ресурсы в модулях `mockState/mockEmis/mockSync/mockPrices/mockSnapshot/
  mockComposition/mockCatalog/mockTrips/mockAuth`.
- `Modal` — единая портальная модалка: оверлей `.modal-overlay`, закрытие крестиком/Esc/кликом
  по фону, `lockBodyScroll` со счётчиком вложенных оверлеев и компенсацией ширины скроллбара.
  Поведение оверлеев: `utils/overlayStack.ts` (Esc закрывает только верхний),
  `utils/focusTrap.ts` (Tab-цикл внутри, фокус при открытии и возврат триггеру, программные
  переводы — `preventScroll: true`); те же правила в `BottomSheet` (свой портал).
- `TripDetailPage` (6 вкладок): тонкий layout — состояние в хуке `pages/useTripDetail.tsx`,
  производные в `utils/tripDerived.ts`, презентация в `TripActions/TripSummaryPanel/
  TripDaysList/TripMealCard/TripShoppingTab/TripDayShoppingTab/TripPersonTab/ExclusionCheckbox`;
  `PriceOverridesTab` — чеки план/факт (инлайн-ввод сумм в таблице закупки по категориям,
  без модалки). `RecipeEditorModal` — админ-редактор блюда; `ProductsPage` — CRUD + цена
  срезом + `EmisLinkPicker`; `IntegrationsPage` — подключение, синк, ручная загрузка файла.
  `CustomSelect`/`NumberField`/`DateRange`/`DatePicker`/`AmountInput`/`FreeAmountInput`/
  `ConfirmDialog`(`useConfirm`) — общие контролы; дропдауны в портале
  (`utils/dropdownPos.ts`, `CustomSelect.usePortalDropdown`: fixed, zIndex 110 > --z-modal 90,
  репозиция на scroll/resize).
- `AmountInput`: для KG/L ввод в г/мл с переключателем «г↔кг» (порог 1000), наружу всегда
  базовые единицы; промежуточный 0 не эмитится.
- Дизайн-система «Провиант»: токены в `src/index.css` (классы-компоненты `.toast*`,
  `.alert--*`; сырая палитра Tailwind и хардкод-цвета запрещены), источник правды дизайна —
  `provisions/design-pack/`.
- PWA: `src/pwa/manifest.json` + `src/pwa/sw.js` (в корне `dist` — scope = каталог файла);
  регистрация SW ТОЛЬКО в prod-сборке (`import.meta.env.PROD` в `main.tsx`), ошибки регистрации
  не ломают приложение. Стратегии: навигация — network-first (офлайн — оболочка из кэша);
  статика — stale-while-revalidate; APP_SHELL — прекэш в install. НЕ кэшируются: не-GET,
  чужой origin, `/api/`, `/auth/`, `sw.js`. Офлайн: оболочка открывается, данные похода —
  из localStorage-кэша (источник истины — сервер; офлайн-очередь — открытая задача в `tasks/`).
  Шрифты self-hosted (`public/fonts/`) — кэшируются как статика.

## Security

- **JWT:** access 1 ч; refresh — TTL из `jwt.refresh-token-expiration` (дефолт 7 д), хардкод
  сроков запрещён. Токены: `iss`/`aud` обязательны и проверяются, `typ=JWT`, clock skew 60 c.
- **Refresh-ротация mark-based (ADR-8):** хэш токена в БД — HMAC-SHA256 от ПРОИЗВОДНОГО ключа
  `HMAC-SHA256(JWT_SECRET, "provision-refresh-hash")` (key separation). Ротация: старый токен
  не удаляется, а помечается `revoked_at`/`replaced_by_id` атомарным
  `UPDATE … WHERE revoked_at IS NULL`. Предъявление отозванного = reuse-detection (OAuth
  Security BCP, refresh token replay) → отзыв ВСЕЙ семьи токенов пользователя, `log.warn`,
  метрика `auth.refresh.reuse`, 401; гонка параллельных ротаций трактуется так же строго;
  отзыв семьи коммитится несмотря на 401 (`noRollbackFor` — side-effect до throw в
  @Transactional иначе откатывается). Просроченные чистятся физически лениво (в запросе
  refresh); logout удаляет токен; fail-fast при секрете < 32 байт.
- **Login/register/refresh лимиты** (`LoginAttemptService`): login — 5 неудач на email в окне
  15 мин → блокировка 15 мин (429 + Retry-After), успех сбрасывает счётчик; register — ключ
  `register:<email>`, 5 конфликтов занятого email за окно → 429 (массовая регистрация
  случайными email — уровень IP-лимита nginx); refresh — единый глобальный ключ
  `refresh:__global__` (потолок 50 за окно → 429; владельца у UUID-токена нет, доверенного XFF
  пока нет). Ответы login/refresh не различают «нет пользователя» и «неверный пароль»
  (анти-энумерация).
- **Парольная политика:** `@Size(min=8, max=100)` (NIST SP 800-63B) — одинаково в бэкенде
  (`RegisterRequest`), mock-слое (`mockAuth.ts`) и клиентской проверке LoginPage; меняется
  только во всех трёх местах сразу; RU-копи — `validationMessages.passwordTooShort`.
- **Ownership:** все trip-эндпоинты фильтруют `trip.user = principal` (чужое → 404 той же
  формы, что «не найдено»); ADMIN-зона под `@PreAuthorize`. Mock держит паритет: владелец из
  токена сессии `mock-access-token-<id>` (`mockState.sessionUserId/findOwnTrip/ownTripOr404/
  visibleTrips`), без токена mock пермиссивен (демо/e2e). Демо-пароли сидов — только из env
  (`ADMIN_PASSWORD`/`DEMO_USER_PASSWORD`).
- **Профили:** `dev` (DEBUG, Swagger, демо-сид) / `prod` (WARN/INFO, springdoc выключен,
  ошибки без внутреннего `detail`, actuator health+info).
- **CORS:** whitelist из ENV, `allowCredentials=false` (токен в заголовке).
- **Транспорт/периметр:** backend не публикуется наружу (только nginx — security-заголовки,
  `client_max_body_size`, access-лог); CSP и полный комплект заголовков заданы и в `/assets/`
  location nginx (вложенный location НЕ наследует server-`add_header`), и в `vercel.json`
  (+ HSTS); `Referrer-Policy: strict-origin-when-cross-origin`; fail-fast `POSTGRES_PASSWORD`
  в compose (`${POSTGRES_PASSWORD:?…}`).
- **Открытый риск (зафиксирован):** refresh-токен в localStorage (XSS); перевод в httpOnly-cookie
  — открытая задача (`tasks/docker-nginx-hardening.md`, смежно с nginx XFF/limit_req).

## Database

PostgreSQL + Flyway. Источник правды по версиям и составу — каталог
`backend/src/main/resources/db/migration/` (номера в прозе НЕ фиксируются — устаревают).
Правила миграций — `skills/migrations.md`; апгрейд существующей БД охраняют
`FlywayUpgradeIntegrationTest` и CI-job `migration-upgrade`.

Факты схемы (смысловые):
- **Снепшоты:** `recipes.trip_id/snapshot_of`, `ingredients.trip_id/snapshot_of`; partial
  unique `(name_norm, unit) WHERE trip_id IS NULL`; копии с `code = NULL`.
- **История цен:** `ingredient_prices` UNIQUE(ingredient_id, effective_from), `source` ∈
  MANUAL/ROSSTAT/API; композитный индекс `(ingredient_id, effective_from DESC)` под DISTINCT
  ON-срезы «последняя цена»; сид генерирует 24 мес. сезонного дрейфа детерминированно.
- **Копия ЕМИСС:** `emis_products` (PK `code`, единица наблюдения), `emis_prices` (unique
  `(emis_code, region_code, period_year, period_month)`, индекс под «последнюю цену»);
  `ingredients.emis_code` — софт-привязка без FK.
- **Отметки «взято»:** `trip_checklist_bought` — `trip_id` FK ON DELETE CASCADE,
  `ingredient_id` FK ON DELETE CASCADE, `needed_stamp BIGINT NOT NULL` (0 легитимен),
  `created_by` FK users, unique `(trip_id, ingredient_id, needed_stamp)` + индекс по trip_id;
  набор меняется только идемпотентным PUT (bulk-DELETE + saveAll в одной транзакции).
- **Факт количества чеклиста:** `trip_checklist_actual_qty` — `trip_id`/`ingredient_id` FK
  ON DELETE CASCADE, `amount NUMERIC(14,3) > 0`, `unit VARCHAR(16)` (человеческая единица
  ввода), `created_by` FK users, unique `(trip_id, ingredient_id)` + индекс по trip_id;
  меняется только идемпотентным PUT (полная замена набора).
- **Оптимистичные блокировки:** изменяемые сущности похода (`trips`, `trip_days`,
  `trip_meals`, `trip_manual_items`, `trip_price_overrides`, `trip_shopping_exclusions`,
  `trip_ingredient_substitutions`, `trip_checklist_bought`, `trip_checklist_actual_qty`)
  имеют `version BIGINT NOT NULL DEFAULT 0` (`@Version`); конфликт → 409
  `CONCURRENT_MODIFICATION`. Состав приёма защищён `OPTIMISTIC_FORCE_INCREMENT` на строке
  приёма в `MealCompositionService`: batch-PUT фиксирует изменение агрегата, и вторая
  конкурентная запись получает 409 вместо молчаливой перезаписи.
- **Refresh-токены:** `revoked_at`, `replaced_by_id` (FK на себя, ON DELETE SET NULL) —
  mark-based ротация и reuse-detection.
- **Журнал синков:** partial unique индекс `sync_logs(provider) WHERE status='RUNNING'` —
  один идущий синк на провайдера (409 `SYNC_ALREADY_RUNNING`).
- **Ручные позиции:** `trip_manual_items` (day_id ON DELETE CASCADE, ingredient RESTRICT,
  amount>0 CHECK).
- Пропуски номеров миграций осознанные: V9 не создавалась; V14/V15 удалены из дерева ДО
  широкого применения (сид демо-юзерей заменён `DevDataInitializer`). БД с V14/V15 в истории
  стартуют без ручных действий благодаря `spring.flyway.ignore-migration-patterns: "*:missing"`
  (ADR-7; `*:future`/`*:pending`/checksum намеренно НЕ игнорируются). Альтернатива для
  оператора — `flyway repair` или `DELETE FROM flyway_schema_history WHERE version IN ('14','15')`.

## Testing Strategy

| Слой | Инструмент | Гейт |
|---|---|---|
| Unit backend | JUnit5+AssertJ+Mockito | `mvn test` (CI blocking) |
| Integration backend | MockMvc + Testcontainers ИЛИ LocalPgFallback (initdb без Docker) | там же |
| Экономический страж | `EconomicConsistencyTest`: сквозной сценарий (каталог → поход → приёмы → состав → чеки) с числами, посчитанными на бумаге; охраняет меню/закупку/дни/«на человека»/состав/оверрайды, правила снепшотов (integrity-блок read-only SQL) и заморозку плана | `mvn test` (CI blocking) |
| Unit/component frontend | vitest + RTL | `npm run test` (CI blocking) |
| Coverage backend | JaCoCo, профиль `coverage-gate` (LINE COVEREDRATIO, порог в pom) | `mvn -P coverage-gate verify` (CI blocking) |
| Coverage frontend | v8, per-file lines ≥80% на зоне изменения (`coverage.include` vitest.config) | `npm run test:coverage` (R5) |
| Types/lint | `tsc --noEmit` (app+e2e+node), eslint | CI blocking |
| Contract mock↔real | vitest `test:contract` c `CONTRACT_TARGET` | nightly parity (non-blocking) |
| E2E mock | Playwright (webServer vite) | nightly + non-blocking на PR |
| E2E real | Playwright против compose-стека (`E2E_BASE_URL`) | nightly blocking на schedule |
| Docker stack | compose up + smoke `/meta` + nginx-прокси | CI blocking |
| Гигиена репо | дубли номеров миграций, UTF-8 BOM | CI blocking (job Repo Hygiene) |

Правила: red-green для каждого фикса (R1), тест того слоя, где изменение (R2), фича без
теста не готова (R3), `@Disabled` только с TODO и ссылкой на задачу (R4). Команды прогонов
в песочнице агента и тяжёлые сьюты — `skills/testing.md`.

## Deployment (Docker Compose)

`docker compose up --build`: postgres (healthcheck pg_isready, порт только 127.0.0.1) →
backend (healthcheck wget /meta, JWT_SECRET обязателен, профиль по умолчанию `dev`) →
frontend (nginx: SPA + прокси `/api`). Прод-сценарий: `SPRING_PROFILES_ACTIVE=prod`,
`SEED_DEMO_USERS=false` (дефолт `.env.example`), свой `POSTGRES_PASSWORD`.

- **Backend не публикуется наружу** (ADR-11): в базовом compose у backend нет `ports` — API
  доступен только через nginx и внутри docker-сети. Для отладки и CI-джоб, бьющих в `:8080`
  напрямую, — overlay `docker-compose.debug.yml` (`127.0.0.1:8080:8080`) через
  `COMPOSE_FILE=docker-compose.yml:docker-compose.debug.yml`.
- **Прод-представление:** брендовые шрифты Unbounded/Manrope — self-host woff2 в
  `public/fonts/` (`@font-face` в `src/index.css`, unicode-range-срезы latin+cyrillic);
  внешних запросов к шрифтам нет (CSP `font-src 'self'`). PWA-манифест — в токенах бренда
  (`background_color`/`theme_color` = `--bg-0` dark; light — `<meta name="theme-color">` с
  media). Vercel-демо: mock разрешён явным `VITE_ENABLE_MOCK=true` + секция `headers`.
- **Память backend:** `mem_limit: ${BACKEND_MEM_LIMIT:-1g}` + `-XX:MaxRAMPercentage=70.0` в
  Dockerfile (без явной настройки JVM взяла бы 25 % лимита); `JAVA_OPTS` переопределяется без
  пересборки; `HeapDumpOnOutOfMemoryError` включён. Потоковый разбор SDMX укладывается в
  128 МБ heap на ответе 66 МБ — 1 ГБ покрывает выгрузку и применение цен с запасом.

## Архитектурные решения (ADR)

Короткая память «почему так». Отмена решения — новая запись с датой, старая не удаляется.

1. **Два режима данных (mock/real) с контракт-паритетом; прод = только real.** Mock —
   демо/тесты без бэкенда; паритет форм охраняют contract-тесты. Прод без флага не уходит
   в mock молча: при недоступном бэкенде — явная ошибка с «Повторить».
2. **Снепшоты каталога (copy-on-write) вместо ссылок похода на справочник.** План похода
   заморожен; админ-правки глобального каталога не ломают походы. Альтернатива (версионирование
   справочника) отвергнута как дороже. Цена копии замораживается на дату старта похода.
3. **EXTRA-правка хранит АБСОЛЮТ на приём** (`amount_per_serving` added-строк), а не «на порцию»:
   добавка («банка сгущёнки на приём») не должна масштабироваться людьми. Охраняется
   `EconomicConsistencyTest` + contract-тестом состава.
4. **ЕМИСС — только транспорт; источник цен — локальная копия в БД.** Расчёт чека не зависит
   от доступности/геоблока портала; ручная загрузка файла — полноценный путь (портал
   нестабилен и блокирует зарубежные ЦОД).
5. **Плотность ≈ 1 для MASS↔VOLUME; сомнительные пары — предупреждение, не блокировка.**
   Привязки «цена категории» — осознанное приближение владельца; позиции с несопоставимым
   масштабом (газ в баллонах) не привязываются.
6. **Потоковый StAX-разбор SDMX вместо DOM.** Память O(один ряд): полный ответ (десятки МБ)
   разбирается в 128 МБ heap; DOM требовал 600–700 МБ. XXE закрыт, чтение ограничено
   `max-response-bytes`.
7. **`spring.flyway.ignore-migration-patterns: "*:missing"`** — remedy для удалённых исторически
   V14/V15: БД с ними в истории стартуют без ручных действий. Заглушки файлов отвергнуты
   (checksum mismatch), `*:future`/`*:pending`/checksum НЕ игнорируются (откат образа и
   незапущенные миграции должны падать громко).
8. **Refresh: mark-based ротация + reuse-detection с отзывом семейства; хэш — HMAC от
   производного ключа.** Украденный/утёкший токен при предъявлении инвалидирует всю семью;
   signing-ключ access-токенов не переиспользуется напрямую (key separation).
9. **Сервер — единственный источник данных похода.** localStorage — только кэш и буфер
   офлайн-записи; новые клиентские хранилища данных похода запрещены (существующие — долг,
   задача в `tasks/ux-behavior.md`).
10. **Деньги и ккал считает сервер; клиент форматирует.** Исключения — preview в
    админ-редакторах и live-итоги модалок до сохранения; формулы — «Эталон округлений».
11. **Backend не публикуется наружу, только через nginx.** Периметр (заголовки, CSP, лимиты
    тела) в одной точке; прямой доступ — только debug-overlay для локальной отладки и CI.
12. **Шрифты self-host.** Внешние CDN несовместимы с CSP `font-src 'self'` и добавляют
    внешнюю зависимость прод-представления.
13. **Оптимистичные блокировки (`@Version`) на агрегатах похода** вместо пессимистичных:
    конфликт редок, UX — 409 с понятным текстом.
14. **Документация — задача-центричная:** работа живёт в файлах `tasks/`, закрытие = `mv` в
    `tasks/done/`; этот документ — только факты/решения (правило правок — в шапке).

## Известные ограничения

- Refresh-токен в localStorage (XSS-риск) — httpOnly-cookie в задаче `tasks/docker-nginx-hardening.md`.
- ЕМИСС геоблокирует зарубежные ЦОД — live-проверка протокола только из сети РФ; CI покрыт
  фейк-транспортом и golden-фикстурами.
- Pack репозитория ~112 МБ (исторический коммит `node_modules`) — переписывание истории
  отложено (задача владельца).
- `TIMESTAMP WITHOUT TZ` («серверное время») — миграция на TIMESTAMPTZ отложена.
- Техдолг клиентских расчётов (вкладки закупок на клиенте, `tripStaging`) — задачи
  `tasks/ux-behavior.md`; список живых задач — `ls tasks/`.
