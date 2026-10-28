# Architecture

## Overview

Provision — SPA + REST-бэкенд + PostgreSQL. Домен: каталог продуктов и блюд (глобальный, ведёт админ), походы пользователей (меню по дням/приёмам), расчёт закупок/стоимости/калорийности, интеграция Росстат/ЕМИСС (средние потребительские цены).

Ключевой инвариант (V20): **поход не ссылается на глобальный справочник** — приёмы пищи указывают на trip-scoped копии блюд и продуктов; справочник и цены свободно живут своей жизнью, план похода заморожен на момент планирования.

## Data Flow

### Режимы работы

| Режим | Источник данных | Когда |
|---|---|---|
| `real` | REST API бэкенда (`VITE_API_URL`, в Docker — same-origin через nginx `/api`) | продакшн-сборка, compose |
| `mock` | `src/api/mockServer.ts` (in-memory + localStorage) | офлайн-демо, component/e2e-тесты |
| `auto` | пинг `GET /api/v1/meta` (700 мс), фолбэк в mock + watchdog-возврат | дефолт dev-сборки |

Приоритет: переключатель UI (localStorage `apiMode`) → `VITE_API_MODE` → auto. Контракт mock↔real фиксируют contract-тесты (`npm run test:contract`, nightly parity). **Известное отклонение:** mock-`summary/shopping` пока отдаёт фикстуру FIX-1, а не расчёт из meals (PLAN P2) — новые эндпоинты так не делать.

### Слои данных

```
React-страницы ── ApiClient (fetch + refresh single-flight + ProblemDetail-ошибки)
   │  real: /api/v1/**          mock: mockServer (те же роуты и формы ответов)
   ▼
Spring MVC controllers (DTO records, Bean Validation, RFC7807-подобные ErrorResponse)
   ▼
Services (Transactional; ownership-проверки trip.user == principal)
   ▼
Spring Data JPA repositories (@Query JOIN FETCH / DISTINCT ON; Specifications для продуктов)
   ▼
PostgreSQL 15 + Flyway V1–V20 (без.hand-right схем: ddl-auto=validate)
```

Правки состава похода (V19) и снепшоты (V20) применяются в расчётном конвейере `SummaryService.computeShopping` (единая @Transactional-точка для shopping / by-days / person / kcal, без self-invocation и N+1).

## Core Calculations

### Калорийность (CR-1)

Только из продуктов: `kcal(порция) = Σ kcal_per_100g × граммы / 100 / base_servings`, где граммы = `amount×1000` (KG/L) или `amount×piece_weight_g` (PCS/PACK). Колонка `recipes.calories_per_serving` — deprecated legacy. Ккал приёма = порция × effectivePeople; ккал/чел/день = Σ приёмов дня / people дня.

### Люди и количества

`effectivePeople = meal.peopleOverride ?: day.peopleOverride ?: trip.defaultPeople`.
Количество ингредиента на приём = `recipe_amount / base_servings × effectivePeople` (scale 3, HALF_UP), с применением правок состава V19: `removed` исключает строку, `added` добавляет `amount_per_serving × effectivePeople`, substitution переносит количество `from → to × ratio`.

### Закупки и упаковки

Агрегат по ингредиенту: сумма по приёмам дня (by-days) и по дням (shopping). Упаковки: при `round_to_packs` и `pack_size`: `packsToBuy = ceil(total/pack_size)`, `buyAmount = packs×pack_size`, `leftover = buyAmount − total`.

### Патч «UX-список 26.10» (U26–U42) — клиентские контракты

- **Чеклист закупки (вкладка «Чеклист»)** — та же упаковочная формула (`utils/checklist.ts`, паритет `SummaryService.calculatePacks`), но считается из клиентской закупки (единый источник вкладок) + информации о фасовке/категориях из справочника продуктов (best effort) и trip-рецептов. Группы — по категориям (алфавит, «Прочее» последняя), внутри — алфавит. Отметки «взято» — сессионные (не данные похода).
- **«На человека» (U33)** — делитель `realPeople = Σ effectivePeople(дни) / число дней` (min 1); без peopleOverride совпадает с `defaultPeople` (обратная совместимость фикстур). Формула в `utils/calculations.ts: realTripPeople`.
- **Overlay меню (U30)** — карточка приёма показывает серверные правки состава (`GET /trips/{id}/substitutions`): EXTRA (+бейдж), EXCLUDED (скрыт), SUBST (`from → to × ratio`), SCALE (`× ratio`). Id-сопоставление — по базовому id (mock-суффикс `::t…` снимается) и `snapshotOf` trip-копий. Semantics — паритет `classifyEdits` c mock `classifyMealEdits`/backend `MealCompositionService`. EXTRA: `absoluteAmount` (абсолют на приём, §3) либо legacy `amountPerServing × people`.
- **Ручные позиции (U40, R3)** — `GET/POST /trips/{id}/manual-items`, `DELETE /trips/{id}/manual-items/{itemId}`; DTO `TripManualItem {id, tripId, dayId|null, ingredientId, ingredientName, unit, amount, note?}`; amount — абсолют (не на порцию). Вливаются в «Закупка на поход» (все), «По дням» (dayId), «Чеклист» (все). Backend: V22 `trip_manual_items` (day_id ON DELETE CASCADE, ingredient RESTRICT, amount>0 CHECK), `TripManualItemService` (ownership 404, trip-scope резолв ингредиента по AGENTS §9). Остаток R3: встраивание в серверный `computeShopping` (source=MANUAL) и usedIn при удалении продукта.
- **PUT /trips/{id} (U36 + Fix-2 п.1)** — имя/заметки/defaultPeople всегда; смена дат — ЧАСТИЧНОЕ стирание: дни вне нового диапазона удаляются (приёмы — orphanRemoval, дневные ручные позиции — FK CASCADE), пересекающиеся дни сохраняют план (те же id), недостающие даты добавляются. Семантика идентична в `TripService.updateTrip` и mock; UI предупреждает confirm'ом с перечнем исчезающих дат.
- **По-дневные исключения (Fix-2 п.5 + Fix-5/R2-шаг2)** — одно множество ключей двух форматов: `<ingredientId>` (весь поход) и `<dayDate>::<ingredientId>` (только день). Дневное исключение уменьшает количество дня и агрегат закупки/person-сводки, но не вычёркивает позицию в другие дни (`isRowExcluded`, `dayScopedExclusions` в `utils/calculations.ts`). Серверное хранение (V23): `trip_shopping_exclusions.day_date` NULL = глобальное; уникальность — два partial-индекса; контракт `PUT/GET /trips/{id}/shopping-exclusions` — `{items:[{ingredientId, dayDate|null}]}` (legacy `ingredientIds` принимается), GET отдаёт объекты; `getExcludedIngredientIds` = только глобальные строки.
- **Чек: «Взяли» и факт-количества чеклиста (Fix-5)** — `ActualPriceDraft.qty` (стейдж) = сколько реально куплено по позиции (шт/кг); `trip-checklist-actualqty-*` = сколько реально берём по чеклисту (свободный ввод вместо степпера упаковок — товар может быть на развес/в другой фасовке). Ключ отметки «взято» = `<ingredientId>@<нужно×1000>`: изменение потребности автоматически сбрасывает отметку. Оба значения попадают в печатный отчёт (колонка «Взяли»). **Fix-8 (п.6):** введённые факты (цена чека, «Взяли») НЕ аннулируются при изменении потребности (число людей/состав) — цена за единицу применяется к текущему «нужно», суммы пересчитываются; `neededAt` deprecated (см. «Патч Fix-7» §1 — superseded).
- **Печатная версия / PDF (Fix-4 п.6)** — маршрут `/trips/{id}/print` (`TripPrintPage`, без Layout): меню по дням (страница на день, `break-after: page`), закупка по категориям с упаковками и план/факт, раздел «Деньги и кто сколько должен» (итоги, на человека по `realTripPeople`, на человеко-приём, разбивка по дням). Данные — тот же клиентский конвейер (единый источник цифр), факт — из стейджа/price-overrides. Сохранение в PDF — диалогом печати браузера (кириллица без встраивания шрифтов).
- **Чеклист: корректировка упаковок (Fix-4 п.8)** — расчётное `packsToBuy` правится ± под реальные упаковки магазина; переопределения персистентны в общем стейдже похода (`trip-checklist-packs-*`), расчётная математика (`utils/checklist.ts`) не меняется.
- **Редактирование блюда (Fix-4 п.5)** — `RecipeService.updateRecipe`: дифф состава на месте (UPDATE/DELETE/INSERT), а не `clear()`+re-add: Hibernate выполняет INSERT до DELETE коллекции и упирался в `unique(recipe_id, ingredient_id)` → 500 на любом блюде с существующим составом. Страж — `RecipeUpdateInUseIntegrationTest` (RU-01..03).
- **Ввод чека суммой (Fix-3 п.5)** — UI принимает «Факт ₽» = сумму, заплаченную за купленное количество позиции; цена за единицу выводится как `фактСумма / количество` (`utils/checkInput.ts`) и хранится в прежнем контракте `PUT /trips/{id}/price-overrides/{ingredientId}` (actualPrice — за единицу). Все сводки (Δ, итоги, «на человека», plan/fact по дням) считаются от сумм.
- **Готовность похода (Fix-3 п.2)** — цепочка «меню → закупка (чеклист: отметки “взято”) → чеки (факт-цены)»: статус-полоса в меню (`utils/readiness.ts`), гейт ввода чека (boughtCount > 0), разблокировка одной кнопкой «Отметить всё» в чеклисте. Отметки «взято» — общий стейдж похода (`trip-checklist-bought-*`).
- **Расширения DTO (Fix-2 п.3/4/7)** — `RecipeResponse.RecipeIngredientResponse`: + categoryName/packSize/roundToPacks/pieceWeightG/kcalPer100g (категории чека/чеклиста и фасовка в real-режиме без админ-доступа; фронтовая `normalizeRecipe` собирает из плоских полей ingredient-объект). `CompositionResponse`: + `catalogRecipeId` (snapshotOf ?: id) — навигация «Изменить блюдо в справочнике» из приёма, чей recipeId — trip-scoped снепшот.
- **Модалка B (U39)** — desired-PUT не включает EXTRA-строку, помеченную «Удалить» (черновой state `REMOVED`); отсутствие EXTRA в items = удаление правки (keepExtra-семантика backend/mock).
- **Единицы ввода (U31)** — `AmountInput`: для KG/L ввод в г/мл с переключателем «г↔кг» (порог 1000), наружу всегда базовые единицы (контракт T0 не меняется). Промежуточный 0 не эмитится (исключение — кнопкой «Искл.»).

### Стоимость (план/факт)

- **План по дням:** `qty_day × plannedUnitPrice(ingredient, day)` — цена = последняя с `effective_from ≤ date` (price-series кэш, DISTINCT ON-запросы).
- **План похода (строка):** `Σ по дням` (баг «цена endDate» закрыт PR #44–46); `plannedUnitPrice` строки = средневзвешенная `plannedCost/qty` (scale 2).
- **Факт:** `actualUnitPrice = trip_price_override ?: plannedUnitPrice`; `actualCost = qty × actualUnitPrice`. Оверрайд ставится из чека (`PUT /trips/{id}/price-overrides/{ingredientId}`) и действует на весь поход.
- **Снепшот (V20):** у продуктов-копий одна строка цены, замороженная при создании копии → правки глобальных цен план похода не меняют.
- `deltaPercent = (actual−planned)/planned×100` (scale 2; planned=0 → null). Итоги = сумма округлённых строк.

### Эталон округлений

| Величина | Scale | Режим |
|---|---|---|
| количества (приём, агрегаты) | 3 | HALF_UP |
| деньги строки и итоги | 2 | HALF_UP |
| unit price в ответах | 2 | HALF_UP |
| packs/buy/leftover | 3 (packs — int) | CEIL для packs |
| ккал | 0 | HALF_UP |
| вывод UI | `src/utils/format.ts` — единый контракт вывода (см. ниже) | — |

Клиент НЕ пересчитывает деньги/ккал (только форматирование); источник — ответы `/summary/*` (задача T6 переводит оставшиеся клиентские расчёты).

### Формат вывода чисел и единиц (Release-1.0, UI-consistency)

Единственный источник — `src/utils/format.ts`; форматировать числа в компонентах напрямую (`toFixed`, `toLocaleString` с настройками по умолчанию) запрещено:

| Что | Функция | Результат | Пример |
|---|---|---|---|
| Итоговые суммы (KPI, «Итого», чеки) | `formatRub` | целые ₽, неразрывный пробел тысяч И перед ₽ (Fix-7 п.24: «₽» не переносится на следующую строку) | «1 234 ₽» (не «123,678 ₽») |
| Цены за единицу (₽/кг, ₽/шт, план/факт в таблицах) | `formatPrice` | ровно 2 знака, запятая | «887,65» (не «9.86») |
| Количества | `formatQty` | человеческая единица, адаптивная точность | «200 г», «1,5 кг», «8 шт», «2 уп» |
| Короткая единица для подписей («₽ / кг») | `unitShortLabel` | кг/г/л/мл/шт/уп, пусто → «ед.» | — |
| Категория продукта | `categoryName` | объект `ProductCategoryDto` или строка → строка | «Мясо» (не «[object Object]») |

Разделитель тысяч — неразрывный пробел (ru-RU), десятичный разделитель — ЗАПЯТАЯ, всегда. Округление только на выводе; внутренние расчёты — полная точность. `humanize` (client.ts, calc.ts) и `formatAmount` (calculations.ts) — обёртки над `formatQty`.

DTO-рассинхрон имён/единиц закрыт нормализацией в одном месте: бэкенд в рецептах отдаёт плоские поля (`ingredientId/ingredientName/unit/unitLabel`), mock — вложенный `ingredient`. Все загрузки идут через `getRecipes`/`getTripRecipes` (client.ts, `normalizeRecipe`), расчётное ядро читает обе формы через `ingOf` (calculations.ts). Прямые `api.get('/recipes'|'/trips/{id}/recipes')` в компонентах запрещены — дают «Unknown» и «шт» вместо имени/единицы.

Итоги похода — ОДИН источник: KPI шапки и «Итого» в закупке считают из `shoppingTotalFinal` (фактические цены + исключения); «По дням» — из `calculateDayShopping` с теми же исключениями (раньше два пути давали спорящие суммы).

## Изоляция каталога похода (V20, снепшоты)

Приём пищи похода ссылается НЕ на глобальный справочник, а на trip-scoped копию: у `recipes` и `ingredients` есть `trip_id` (NULL = глобальный справочник) и `snapshot_of` (оригинал; ON DELETE SET NULL). Копия создаётся при добавлении приёма пищи (`TripCatalogSnapshotService.snapshotRecipeForTrip`): рецепт + задействованные продукты (по разу на поход) + одна актуальная строка цены на продукт-копию — план похода замораживается на момент планирования.

Следствия:
- админ может удалять/менять глобальные блюда и продукты, не ломая спланированные походы;
- правки глобальных цен не меняют план похода (факт — через `trip_price_overrides`);
- каталожные эндпоинты (`GET /recipes`, `GET /admin/products`, `GET /prices`) отдают только глобальные записи (`trip_id IS NULL`);
- страницы похода берут блюда через `GET /trips/{id}/recipes`, цены — через `GET /trips/{id}/prices` (trip-scoped срезы; fallback на глобальные для походов без снепшотов, созданных до V20);
- уникальность имени продукта (`name_norm`, `unit`) — partial-индекс только по глобальным.

Семантика удаления блюд (U16): `DELETE /admin/recipes/{id}` отвечает 409 только если приёмы походов ссылаются НАПРЯМУЮ на этот id — после V20 это возможно лишь для legacy-строк до миграции (бэкфил V20 перевёл все походы на снепшоты). Походы, держащие snapshot-копии, от удаления глобального оригинала не страдают, поэтому клиент (RecipesPage/AdminPage) больше не блокирует удаление превентивно по `usedIn`, а просто вызывает DELETE и показывает ответ сервера. Mock-сервер держит паритет: при удалении занятого глобального блюда mock перепривязывает такие приёмы на снепшот-копии (`snapRecipeForTrip`) вместо 409.

Расчётное ядро (SummaryService) не изменилось: копии лежат в тех же таблицах и читаются теми же запросами по id ингредиентов похода.

Правила привязки (Release-1.0, econ-guardian — охраняются `EconomicConsistencyTest`):
- **один снепшот на (поход, оригинал)**: `createRecipeCopy` переиспользует копии продуктов других рецептов похода (`snapshotIngredient` → `findByTripIdAndSnapshotOf`); до фикса каждый рецепт плодил свои копии, и один продукт разъезжался на несколько строк закупки со своими ценами/упаковками;
- **заморозка цены на дату старта похода**: копия получает строку цены, действовавшую на `trip.startDate` (фолбэк — на сегодня), с `effective_from ≤ startDate` — замороженный план виден при резолве на ЛЮБОЙ день похода и сервером (`loadLatestPrices`), и клиентом (`findPriceForDate`); V21 прижал legacy-строки бэкфила;
- **все ссылки похода — только trip-scoped**: `updateMeal` снепшотит рецепт как `addMeal`; `MealCompositionService.putComposition` резолвит каждый входящий id (строка рецепта → её снепшот по `snapshot_of` → снепшот-копия глобального продукта), поэтому EXTRA/SUBST-цели из справочника привязываются к походу с замороженной ценой; `TripPriceOverrideService` редиректит чек, введённый на глобальный id, на снепшот похода (иначе оверрайд молча не применялся);
- миграция V21 дополнительно дедуплицировала legacy-снепшоты (канон — MIN(id) на (trip_id, snapshot_of), перепривязка recipe_ingredients/substitutions/overrides).

Бэкфил: миграция V20 перевела существовавшие походы на снепшоты (temp-таблицы соответствий, перепривязка overrides/exclusions/substitutions). Повторный прогон миграций безопасен (IF NOT EXISTS + DROP temp-таблиц в начале).

## Внешние цены: Росстат / ЕМИСС (Fix-13)

Единственный активный провайдер цен — `RosstatEmisProvider` (code `ROSSTAT`):
официальные средние потребительские цены Росстата через ЕМИСС (fedstat.ru) —
«средняя цена по больнице» в рублях, ежемесячно, по ~сотне базовых категорий
(«Гречневая крупа», «Молоко питьевое»…), без ключей и лимитов по IP.
Пайплайн синхронизации общий (`POST /admin/integrations/{provider}/sync/prices`
→ 202 `{logId}` → фоновый `IntegrationService.executePriceSync`): маппинги
ингредиент↔внешняя категория (`IngredientMapping`, source `ROSSTAT`), цены —
`applyMappingPricesInTx` (upsert `IngredientPrice` по датам, `source=MANUAL`
никогда не перезаписывается).

**Протокол** (порт CRAN-пакета fedstatAPIr — референсная реализация, активно
поддерживается; прямая «ссылка на CSV» у ЕМИСС отсутствует):

1. `GET {base-url}/indicator/{indicator-id}` — страница показателя (cookie-сессия;
   сессия прогревается GET главной страницы портала — JSESSIONID до целевого запроса);
2. одноразовый Struts CSRF-токен: канонически из `div#downloadTokenHolder`
   (`input[name=struts.token.name]` → имя, `input[name=<имя>]` → значение),
   но живая разметка может отличаться — поэтому fallback: пара токенов ищется
   по всему документу, затем одиночный `input[name=struts.token]`. Если токен
   не найден, ошибка содержит диагностику страницы (title, размер, маркеры
   протокола, видимый текст) — единственный канал отладки, т.к. ЕМИСС блокирует
   зарубежные дата-центры и разработчик не видит живую страницу;
3. словари фильтров из встроенного JS страницы: объект после маркера `filters:`
   (извлечение балансировкой скобок с учётом строк; читается Jackson напрямую —
   ALLOW_SINGLE_QUOTES / ALLOW_UNQUOTED_FIELD_NAMES, без строковых gsub-трюков
   R-пакета и его «12-го тега script»); оси — `left_columns`/`top_columns`/`groups`;
4. `POST {base-url}/indicator/downloadData.do?format=sdmx`, form-urlencoded:
   `title`, `struts.token.name`, `struts.token`, `lineObjectIds*`,
   `columnObjectIds*`, `selectedFilterIds*` (`field_value`), `filterObjectIds`
   (поле «0» — сам показатель — уходит в filterObjectIds, не в оси);
5. ответ — SDMX GenericData XML: `CodeLists` (словари измерений) +
   `Series/Obs` (ряды цен). Парсер namespace-agnostic (localName), DOCTYPE
   запрещён (XXE). Измерение товаров находится по заголовку CodeList
   («товар/продукт/номенклатур»), регион — «ОКАТО/территор», «Виды показателя» —
   если среди значений есть «цена», берутся только ценовые ряды (не индексы).

**Выбор фильтров**: регион — из конфига (точное совпадение → вхождение →
«российская…» → первое значение); товары и периоды — ВСЕ значения (полный ряд
выгружается целиком, режется на своей стороне — один POST на синхронизацию).

**«Гарантированный быстрый вызов»** (требование Fix-13, боль OFF-эры — 40 с
ретраев при подключении): ровно одна попытка на операцию, никаких backoff-саг;
два уровня кэша с TTL (`cache-hours`, дефолт 24 — данные обновляются раз в месяц):

- `testConnection` — только GET страницы показателя (словарь категорий из
  фильтров; секунды, тяжёлая выгрузка не запускается);
- `searchProducts` (Fix-14) — список категорий из словаря СТРАНИЦЫ (вся
  номенклатура, включая категории без данных за период) + свежая цена каждой
  категории из кэшируемой SDMX-выгрузки (одноразовый регион-фильтрованный
  запрос, не ретраи). При недоступности выгрузки — graceful-fallback на
  справочник без цен (`price=null`), поиск не падает;
- `fetchPrices` — полная SDMX-выгрузка, но зовётся только фоновым синком
  (UI получает 202 `{logId}` и не блокируется); при сбое обновления отдаётся
  предыдущий кэш (graceful degradation), при отсутствии кэша —
  `IntegrationUnavailableException` (502) с человекочитаемой причиной
  (403 анти-бот / HTML вместо SDMX — истёк одноразовый токен / разметка
  изменилась / таймаут / DNS).

**Единицы**: Росстат отдаёт цену «за единицу категории» — эвристика `guessPack`
(яйца → 10 PCS, молоко/кефир/сок/вода/напиток/квас/морс → 1 L, остальное → 1 KG).
`packUnit` обязателен: `convertToIngredientUnit(null, …)` возвращает null, и цена
была бы молча отброшена. Валюта всегда RUB — конвертация ЦБ не нужна
(`ExchangeRateService` демонтирован вместе с OFF).

**Конфигурация**: `integration.rosstat.base-url` (https://www.fedstat.ru),
`indicator-id` (дефолт **31448** «Средние потребительские цены на товары и
услуги», месяц; альтернатива 37426 — недельные), `region` («Российская
Федерация»), `cache-hours` (24), `user-agent`; `integration.contact-email` —
контакт для UA. Env: `ROSSTAT_BASE_URL`/`ROSSTAT_INDICATOR_ID`/`ROSSTAT_REGION`/
`ROSSTAT_CACHE_HOURS`/`ROSSTAT_USER_AGENT`/`INTEGRATION_CONTACT_EMAIL`
(docker-compose пробрасывает из `.env`). Страж биндинга — `RosstatConfigBindingTest`
(реальный yml → @Value; наследник `OffConfigBindingTest` — ловушка YAML-boolean
ключа «off» ушла вместе с OFF, но урок задокументирован в yml).

**Привязки ингредиентов (Fix-14)**: `IntegrationService.createMapping` —
идемпотентный **upsert** по ключу `(internalIngredientId, source)`: повторная
привязка того же ингредиента не ошибка, а замена внешнего товара (раньше —
`IllegalStateException: Mapping already exists`, блокировавший пользователя).
Список текущих привязок — `GET /admin/integrations/{provider}/mappings`
(`IngredientBindingDto`), отвязка — `DELETE …/ingredients/{id}/mapping/{provider}`;
во фронте блок «Текущие привязки» (видимость + «Отвязать»). Цены в результате
поиска (`ExternalProductDto.price/priceDate`) — последняя точка категории из
кэшируемой выгрузки; см. `searchProducts` выше.

**Результат синхронизации (Fix-15)**: `executePriceSync` пишет в
`SyncLog.details` (jsonb) полный процесс: `requestCount` (число обращений к
провайдеру), `items[]` — постатейно на каждый маппинг (продукт, внешний код,
дата/старая→новая цена самой свежей точки, `action`
`CREATED/UPDATED/SKIPPED_MANUAL/SKIPPED/ERROR`, `reason` — счётчики точек или
текст ошибки), `errors[]` — человекочитаемые сообщения сбоев, `fatalError` —
фатальная ошибка вне цикла маппингов. Статус ВЫВОДИТСЯ из счётчиков (раньше
хардкодился `SUCCESS` при любых ошибках): `errors==0 → SUCCESS`;
`errors>0 && created+updated==0 → FAILED`; `errors>0 && работа выполнена →
PARTIAL` (миграция V25 расширяет CHECK `sync_logs.status`). Фронтенд: drawer
журнала показывает fatalError/items/errors («запросов к источнику» вместо
«к OFF»), чип и фильтр `PARTIAL` — янтарные; `IntegrationsPage` поллит журнал
каждые 2 с, пока есть `RUNNING`, и показывает итоговый тост со счётчиками,
когда запущенный запуск финишировал (записи больше не «статичные до F5»);
`SyncLogsPage` стартует синк через `ROSSTAT` (кнопка OFF-эры стучалась в
удалённого провайдера), карточка провайдера — живые данные
`GET /admin/integrations`. Контракт маппинга: `POST …/ingredients/{id}/mapping`
отвечает **200 + `IngredientBindingDto`** (пустое тело ломало `response.json()`
фронтенда — «Unexpected end of JSON input»); `client.ts` дополнительно терпит
пустое тело любого 2xx (защитный слой).

**Ограничения (честно)**: ЕМИСС блокирует зарубежные дата-центры (403 анти-бот —
из песочницы CI live-проверка невозможна, работает из сети пользователя РФ);
портал нестабилен («бесконечно падающий ЕМИСС» — README fedstatAPIr), поэтому
кэш + graceful degradation вместо ретраев; данные — раз в месяц; категории общие
(«йогурт питьевой», не «со вкусом манго»); единицы — эвристика.

**История: Open Food Facts (демонтирован в Fix-13)**. U11/Fix-9/Fix-11 строили
OFF-интеграцию (Search-a-licious + фолбэк Open Prices + карточки v2 + курсы ЦБ),
но поисковый хост OFF (`search.openfoodfacts.org`, OVH) недостижим из сети
пользователя (TLS-сброс провайдера), подключение жевало ~40 с ретраев, а
фолбэк-каталог не давал «средней цены по больнице». Удалены:
`OpenFoodFactsProvider`, `ExchangeRateService`, `IntegrationAuthException`
(заменена `IntegrationUnavailableException`), OFF-тесты, `integration.off`/
`integration.cbr` в yml, `OFF_*` в compose/.env. Legacy сохранена: `RecipeSource.OFF`
и «OFF» в CHECK-ограничениях (существующие строки БД), бейдж «OFF» в ProductTable.
Миграция V24: «ROSSTAT» в CHECK-и source (паттерн V16), сид строки integrations
ROSSTAT (список интеграций читается из БД), DELETE строки OFF.

Mock-сервер повторяет контракт роутов `/admin/integrations*` (список
IntegrationDto, connect/disconnect, sync-logs, sync → `{logId}` с фоновым
переходом лога в SUCCESS со счётчиками, products/search → ExternalProductDto —
каталог категорий Росстата, ingredients/:id/mapping → 200 + тело привязки
(Fix-15, паритет с бэкендом)), включая коды 409
`INTEGRATION_DISCONNECTED` / `SYNC_ALREADY_RUNNING` и 404 для неизвестного
провайдера (`mockIntegrations.test.ts`).

## Правки состава приёма (V19 + composition API)

Хранение — поверх `trip_ingredient_substitutions`, без новой таблицы (`MealCompositionService`, решение зафиксировано в PR #47–49):

| State UI | Хранилище | Эффект в конвейере |
|---|---|---|
| RECIPE | записи нет | derived = amount/baseServings × people |
| SCALED | from=X, to=X, ratio | derived × ratio |
| EXTRA | added=true, from=null, to=X, amount_per_serving = **абсолют на приём** (V21) | добавка к агрегату БЕЗ масштабирования (`EffectiveLine.absolute`) |
| EXCLUDED | removed=true, to=null | строка рецепта пропускается |
| замена | from=A, to=B, ratio | qty(B) += qty(A)×ratio; qty(A) := 0; SCALE-правки A переносятся на B |

API: `GET/PUT /api/v1/trips/{tripId}/meals/{mealId}/composition` (GET — сервер считает масштабирование и totals; PUT — атомарный batch-диф desired-состояния). Порядок в конвейере: SCALE → people → EXCLUDE → EXTRA → substitutions. UI: `MealCompositionModal` (5 статусов-бейджей, действия по состоянию, merge-подтверждение, инлайн-замены, dirty-state, live-итоги; свободный ввод при сохранении резолвится в справочник через check-name/`POST /admin/products` — на сервер уходят только реальные id).

Исторические девиации (устранены Release-1.0, econ-guardian):
- EXTRA: раньше сервис хранил `abs/people`, а закупка делила ещё на `baseServings` → вклад EXTRA занижался в base раз и расходился с составом/UI/mock. Теперь `amount_per_serving` added-строк хранит абсолют (спека §3), V21 сконвертировала legacy-строки (× effectivePeople первого приёма рецепта); mock хранит то же значение (паритет формы).
- SCALED: check-констрейнт V7 (`from <> to`) физически не давал сохранить «замену на себя» — PUT состава падал в 500. V21 сняла констрейнт; SUBST from==to по-прежнему отклоняется валидацией сервиса (400).
- SUBST в GET/PUT-ответе не обнулял строку-источник → totals состава считали заменённый продукт дважды. Теперь источник обнулён (паритет с mock, PR #53).

## Известный долг до Release 1.0 (реестр рассинхронов)

1. Вкладки закупок считают на клиенте (`calculations.ts`) и не видят серверные правки состава → R1.
2. `tripStaging.ts`/localStorage дублируют серверные overrides/exclusions → R1/R2.
3. mock `summary/shopping` — фикстура FIX-1, не расчёт → R8.
4. ~~EXTRA ×people~~ — закрыто (econ-guardian: абсолют в `amount_per_serving`, V21).
Критерии и порядок — PLAN.md, этапы R0–R9.

## Contract Frontend ↔ Backend

### DTO контракты

- Ошибки: `{type,title,status,detail,instance,errors[],usedIn[]}` (RFC7807-подобные); коды конфликтов машиночитаемые: `DUPLICATE_PRODUCT`, `PRODUCT_IN_USE`, `DUPLICATE_PRICE_DATE`, `RECIPE_IN_USE` (исторический, для рецептов теперь недостижим через походы), `SYNC_ALREADY_RUNNING`.
- `RecipeResponse.ingredients[]`: `{ingredientId, ingredientName, unit, unitLabel, amount}` (без вложенного объекта ингредиента).
- `ShoppingItemResponse`: план/факт пары + `packSize/packsToBuy/buyAmount/leftoverAmount/substitutedFrom`.
- V20-поля: `tripId`, `snapshotOf` у рецептов/продуктов (копии не попадают в каталожные списки).
- Пагинация продуктов: Spring Page (`content/page/size/totalElements/...`); mock повторяет форму.

### Формат дат

ISO: `YYYY-MM-DD` (date-only) и ISO-8601 datetime в UTC-локалях БД (`TIMESTAMP WITHOUT TZ` — соглашение: серверное время; миграция на TIMESTAMPTZ — в P2).

### Формат денег

`NUMERIC(10,2)` RUB в БД; в JSON — number с 2 знаками; отображение — итоги `formatRub` (целые ₽), цены за единицу `formatPrice` (2 знака, запятая) — см. «Формат вывода чисел и единиц».

### Новые/изменённые эндпоинты эпохи V19–V20

```
GET  /api/v1/trips/{id}/recipes         trip-scoped копии блюд (состав для меню/расчётов)
GET  /api/v1/trips/{id}/prices          trip-scoped срезы цен (fallback: глобальные, если копий нет)
GET  /api/v1/prices                     глобальные latest-срезы (все аутентифицированные)
POST/PUT/DELETE /api/v1/admin/recipes[/{id}]   ADMIN CRUD блюд с составом
GET/POST /api/v1/trips/{id}/shopping-exclusions, DELETE .../{ingredientId}   исключения строк закупки (V19)
GET/POST /api/v1/trips/{id}/substitutions/ingredient-edits, DELETE .../ingredient-edits/{editId}   правки состава приёма (added/removed/amount_per_serving, V19)
GET/POST/DELETE /api/v1/trips/{id}/substitutions[/{substitutionId}]   замены from→to (ratio)
PUT/DELETE /api/v1/trips/{id}/price-overrides/{ingId}    факт-цены (чеки)
GET/PUT /api/v1/trips/{id}/meals/{mealId}/composition   состав приёма (batch-диф, V19-хранилище)
GET  /api/v1/trips/{id}/summary/{menu|shopping|shopping/by-days|person}
```

## Key Components

### Backend

- `SummaryService.computeShopping` — единый расчётный конвейер (shopping/by-days/person/kcal), price-series кэш, пакетные загрузки (JOIN FETCH / DISTINCT ON / IN-батчи).
- `TripCatalogSnapshotService` — copy-on-write снепшоты (V20).
- `TripIngredientEditService`, `TripShoppingExclusionService` — правки состава/исключения (V19).
- `PriceResolutionService` — actual = override ?: planned.
- `SecurityConfig` + `JwtService`/`JwtAuthenticationFilter` — stateless JWT, CORS из ENV, fail-fast секрета (`JwtProperties.validate`).
- `DevDataInitializer` / `DevTripsInitializer` — демо-пользователи и демо-походы (profile `dev` + `SEED_DEMO_USERS=true`), демо-походы создаются через снепшот-сервис.
- `RosstatEmisProvider` (`PriceProvider`) — средние потребительские цены Росстата через ЕМИСС/fedstat.ru (Fix-13): Struts-токен → POST downloadData.do?format=sdmx → SDMX-парсер; два уровня кэша (каталог — страница показателя, цены — полная выгрузка только в фоновом синке).
- `GlobalExceptionHandler` — коды конфликтов и field-errors.

### Frontend

- `api/client.ts` — режимы, refresh single-flight, `auth:session-lost`; `api/mockServer.ts` — mock-паритет роутов.
- `Modal` — единая портальная модалка (U3/U21): оверлей `.modal-overlay`, закрытие крестиком / Esc / кликом по фону; все модальные окна (TripForm, AddMealModal, MealCompositionModal, RecipeEditorModal, ApiModeBadge, детали рецепта/продукта, ввод чека) рендерятся через портал, e2e-селекторы скопятся на `.modal-overlay`.
- `TripDetailPage` (5 вкладок) + `PriceOverridesTab` (чеки план/факт); `RecipeEditorModal` (админ-редактор блюда с составом); `ProductsPage` (CRUD + цена срезу); `CustomSelect/NumberField/DateRange/DatePicker` (контракты CR-3/CR-4).
- Дизайн-система «Провиант»: токены в `src/index.css`, design-pack в `provisions/` (источник правды дизайна; миграция — DESIGN_MIGRATION.md, ведётся отдельно).

## Security

- JWT: access 1 ч / refresh 7 д, refresh в БД хэшем с ротацией; logout удаляет токен; fail-fast при коротком/пустом секрете.
- Ownership: все trip-эндпоинты фильтруют `trip.user = principal` (404 на чужое); ADMIN-зона под `@PreAuthorize`.
- Профили: `dev` (DEBUG, Swagger, демо-сид) / `prod` (WARN/INFO, Swagger off, ошибки без detail, actuator health+info).
- CORS: whitelist из ENV, `allowCredentials=false` (токен в заголовке).
- Открытые задачи (PLAN P1): rate limiting `/auth/*`, security-заголовки и gzip в nginx, refresh в httpOnly-cookie (пока localStorage — XSS-риск зафиксирован), fail-fast `POSTGRES_PASSWORD`, backup-процедура.

## Database

- PostgreSQL 15, Flyway V1–V20. Пропуски номеров осознанные: V9 не создавалась, V14/V15 удалены из истории дерева (урок: применённые миграции НЕ удалять и НЕ править; только новые номера; в существующих БД демо-юзеры V14/V15 могли остаться — cleanup-запрос в README).
- Снепшоты: `recipes.trip_id/snapshot_of`, `ingredients.trip_id/snapshot_of`; partial unique `(name_norm, unit) WHERE trip_id IS NULL`; копии создаются с `code = NULL`.
- История цен: `ingredient_prices` UNIQUE(ingredient_id, effective_from); сид V13/V17 генерирует 24 мес. сезонного дрейфа детерминированно.
- Гигиена: pack репозитория ~112 МБ из-за исторического коммита `node_modules` — переписывание истории в PLAN P1.

## Testing Strategy

| Слой | Инструмент | Гейт |
|---|---|---|
| Unit backend | JUnit5+AssertJ+Mockito | `mvn test` (CI blocking) |
| Integration backend | MockMvc + Testcontainers ИЛИ LocalPgFallback (initdb без Docker) | там же |
| Экономический страж | `EconomicConsistencyTest` (E2E-ECON): сквозной сценарий (каталог → поход → приёмы → состав → чеки) с числами, посчитанными на бумаге; охраняет меню/закупку/дни/«на человека»/состав/оверрайды, привязки V20 (integrity-блок read-only SQL) и заморозку плана | `mvn test` (CI blocking) |
| Unit/component frontend | vitest + RTL | `npm run test` (CI blocking) |
| Coverage | v8, per-file lines ≥80% на зоне изменения (список include в vitest.config) | `npm run test:coverage` локально (R5) |
| Types/lint | `tsc --noEmit`, eslint | CI blocking (typecheck добавлен в T0) |
| Contract mock↔real | vitest `test:contract` c `CONTRACT_TARGET` | nightly parity (non-blocking) |
| E2E mock | Playwright (webServer vite) | nightly + non-blocking на PR |
| E2e real | Playwright против compose-стека (`E2E_BASE_URL`) | nightly blocking на schedule (триаж CI-3) |
| Docker stack | compose up + smoke `/meta` + nginx-прокси | CI blocking (красный, CI-2) |

Правила: red-green для каждого фикса (R1), тест того слоя, где изменение (R2), фича без теста не готова (R3), `@Disabled` только с TODO и ссылкой (R4).

## Deployment (Docker Compose)

`docker compose up --build`: postgres (healthcheck pg_isready, порт только 127.0.0.1) → backend (healthcheck wget /meta, JWT_SECRET обязателен, profile по умолчанию `dev`) → frontend (nginx: SPA + прокси `/api`). Прод-сценарий: `SPRING_PROFILES_ACTIVE=prod`, `SEED_DEMO_USERS=false`, свой `POSTGRES_PASSWORD`, образы за реестром (задача P1: публикация в ghcr + стенд).


## Патч «Fix-6» (UX-список 26.10, шестая итерация) — контракты

### 1. Серверные правки состава в клиентских расчётах (п.22/25, R1-рассинхрон)
- `GET /trips/{id}/ingredient-edits` → `TripIngredientEditResponse` дополнен полями
  `fromUnit`/`toUnit` (единицы from/to-продуктов). Mock отдавал их и раньше — паритет.
- Новый `src/utils/recipeEdits.ts`:
  - `buildEffectiveIngredients(ingredients, edits)` — применяет правки к составу рецепта:
    EXCLUDE → удалить строку; SCALE (from==to) → `amount × ratio`; SUBST → количество
    from переносится на to (`× ratio`, флаг `substitutedFrom`); EXTRA (added/from=null) →
    новая строка с `absolute: true` (абсолют на приём — людьми НЕ масштабируется, §3/V21).
  - `buildEffectiveRecipesMap(recipesMap, edits, snapshotOf?)` — карта рецептов с
    применёнными правками; ЕДИНЫЙ источник для меню/закупки/дней/«на человека»/чека/отчёта
    (TripDetailPage, PriceOverridesTab, TripPrintPage).
- `calculations.ts`: строки с `absolute` не масштабируются `people/baseServings`
  (`calculateMenuByDays` прокидывает флаги `added`/`substitutedFrom` для бейджей меню).
- Страницы больше не применяют `overlayEditsOnIngredients` к меню (menuOverlay остаётся
  как библиотека хелперов — classifyEdits/stripSnapshotSuffix/editMatchesRecipe).

### 2. Фактическое количество: свободные единицы (п.8/9/11)
- Хранилище (localStorage, клиентский стейдж похода): `trip-checklist-actualqty-{tripId}` →
  `Record<ingredientId, { amount: number; unit: string }>`, unit ∈ 'г'|'кг'|'мл'|'л'|'шт'|'уп'.
  Совместимость: legacy-число (Fix-5) читается как `{amount, unit: ''}`.
- ОДИН источник для чеклиста, колонки «Взяли» чека и печатного отчёта (повторного ввода нет).
- `utils/checkUnits.ts`: `unitOptions(baseUnit, pieceWeightG)` (штучным с известным весом
  штуки доступны г/кг), `convertToBase(...)` — приведение к базовой единице или null
  (несопоставимо), `isActualLessThanNeeded(...)` — подсветка «взято меньше».
- Компонент `FreeAmountInput` (число + чипы единиц).

### 3. Подтверждения опасных действий (п.7)
- `ConfirmDialog` + `useConfirm()` — промис-диалог (alertdialog): title/message/confirmLabel/
  tone('danger'|'warning'). Заменяет window.confirm: удаление похода/приёма/блюда/продукта/
  ручной позиции, смена дат похода, сброс демо-данных, закрытие Модалки B с правками.

### 4. Чек: одна таблица вместо модалки (п.18/20/21/23/26/28)
- PriceOverridesTab: модалка «Ввести чек», кнопка, чекбокс «только расхождения» и note-box
  удалены. Ввод сумм — инлайн в таблице «Закупка», сгруппированной по категориям
  (плашки-строки, формат как в чеклисте), полная высота без внутреннего скролла.
- Нейминг колонок: «Нужно · Взяли · Думали ₽ · Заплатили ₽ · Отклонение».
- Подтабы («Закупка/По дням/На человека») — сегменты `.seg`.

### 5. Печатный отчёт (п.3/4/5)
- Меню дня группируется по типам приёмов: плашки-заголовки (цвета бейджей приложения),
  внутри — 2 колонки.
- Стили `.print-doc` (рамки/зебра) действуют и на экране (вынесены из @media print).
- План/факт: у позиции есть чек (`hasFact`) — выводится факт; все позиции с чеками —
  плановые колонки не выводятся вовсе; «Расхождение» — только при смешанном состоянии.

## Патч «Fix-7» (UX-список 26.10, седьмая итерация) — контракты

### 1. Свежесть фактов: сброс чека при правке состава/количества (п.17) — SUPERSEDED Fix-8 (п.6)
- **Fix-8 (п.6) отменил аннулирование фактов**: «если я поменял количество человек
  в походе, это не значит, что надо удалять все значения, которые я вводил по закупкам».
  Факты (цена чека `ActualPriceDraft.price`, «Взяли» `ChecklistActual`) переживают
  изменение потребности позиции: цена за единицу применяется к ТЕКУЩЕМУ «нужно»,
  суммы пересчитываются потребителями автоматически. `neededAt` больше не пишется
  (поле deprecated — только legacy-записи Fix-7 в localStorage); `factIsFresh`/`neededStamp`
  сохранены как deprecated-утилиты (чистые функции, UI их как gating не использует).
  Отметки «взято» чеклиста — прежнее поведение (Fix-5 п.8): ключ `<ingredientId>@<нужно×1000>`,
  при смене потребности галочка слетает (подтверждение количества), но ВВЕДЁННЫЕ значения
  (цены, «Взяли») не стираются.
- (историческое) Fix-7: записи стейджа штамповались потребностью на момент ввода
  (`neededAt = neededStamp(needed)`), устаревший факт игнорировался всеми потребителями —
  поведение отменено из-за потери пользовательского ввода при смене числа людей.

### 2. Префил «Взяли» ожидаемым количеством (п.22)
- `checkUnits.neededAsActual(neededBase, baseUnit)` → `{amount, unit}`: KG <1 → г, иначе кг;
  L <1 → мл, иначе л; PCS → шт; PACK → уп; округление до 3 знаков.
- Уровень отображения (чеклист: `buyAmount` — целые упаковки вверх; чек: `totalAmount`):
  поле показывает ожидаемое значение, пока пользователь не ввёл своё. ПРЕФИЛ НЕ ХРАНИТСЯ —
  фактом (и «Взяли» в отчёте) становится только реальный ввод.

### 3. Нормализация id в клиентских расчётах (п.19)
- `calculateShoppingList`/`calculateDayShopping` приводят `ingredientId` к строке
  (ключ агрегата и поле ShoppingItem.ingredientId — `String(id)`), цены сопоставляются
  по `String(price.ingredientId)`. Причина: в real-режиме серверные правки состава
  (EXTRA/SUBST) приносят string-id, а снепшот-строки рецепта и trip-цены — number-id;
  строгое === оставляло добавленные в походе продукты «без цены» во всех отчётах.

### 4. Цена из чека делает позицию «с ценой» (п.28)
- «Закупка на поход»: `hasPrice = planned || есть свежий факт чека`; стоимость — факт.
  Список «⚠ нет цен» (KPI/шапка вкладки) — только позиции без плановой цены И без чека.

### 5. Дропдауны в портале (п.12/14)
- `utils/dropdownPos.ts`: `computeDropdownPosition(anchorRect, viewport, opts)` — чистый
  расчёт fixed-позиции (вниз/вверх, maxHeight по месту, minWidth = ширина триггера,
  maxWidth ≤ 360 и ≤ вьюпорт).
- `CustomSelect.usePortalDropdown(open)` — общий хук: список рендерится в
  `document.body` (position:fixed, zIndex 110 > --z-modal 90), репозиция на scroll(capture)/
  resize. Тот же паттерн — подсказки «Категория» в RecipeEditorModal. Модалка больше не
  скроллится от открытого дропдауна; ширина списка — по контенту (без горизонтального скролла).

### 6. Блокировка скролла фона под модалкой (п.1)
- `Modal` (общий портал всех оверлеев, включая ConfirmDialog): `lockBodyScroll()` на mount /
  `unlockBodyScroll()` на unmount; счётчик вложенных оверлеев; `body.overflow=hidden` +
  компенсация ширины скроллбара (paddingRight), чтобы контент не прыгал.

### 7. Каркас страницы и «наверх» (п.9/10)
- `Layout main > .app-shell`: max-width 1200px, центрирование; контент не растянут на весь
  экран. Мобильные (≤767px): отступы main 12px, `.mob-scroll` — горизонтальный скролл
  широких таблиц внутри карточек (`table { min-width: 560px }`).
- `ScrollTopButton` (в Layout, вне main): fixed правый нижний угол, появляется плавно при
  `window.scrollY > 200` (шапка скрыта), клик — `scrollTo({behavior:'smooth'})`.

### 8. Компактные контролы (п.15/13/23)
- `--h-control`: 40 → 36px. Глобально: text/number/email/password/search/date-инпуты и
  `.cselect-trigger` — min-height 36px, padding-y 6px; в `.modal-overlay` — 32px/5px.
  Составные поля количества (AmountInput/FreeAmountInput) — класс `.compact-input`
  (28px/4px), исключены из общих правил. Внешний контур составного поля скруглён ЦЕЛИКОМ
  (`--r-input` со всех сторон + overflow-hidden), стык «ввод | единицы» — плоский (п.13).
- `.btn { gap: 6px }` — иконка не липнет к тексту (п.23); `Button iconOnly` — квадратная
  иконочная кнопка (создание сущностей — справа в шапках страниц, п.2/5).
