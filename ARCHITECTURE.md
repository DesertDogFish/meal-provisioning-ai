# Architecture

## Overview

Provision — SPA + REST-бэкенд + PostgreSQL. Домен: каталог продуктов и блюд (глобальный, ведёт админ), походы пользователей (меню по дням/приёмам), расчёт закупок/стоимости/калорийности, интеграция Росстат/ЕМИСС (средние потребительские цены).

Ключевой инвариант (V20): **поход не ссылается на глобальный справочник** — приёмы пищи указывают на trip-scoped копии блюд и продуктов; справочник и цены свободно живут своей жизнью, план похода заморожен на момент планирования.

## Data Flow

### Режимы работы

| Режим | Источник данных | Когда |
|---|---|---|
| `real` | REST API бэкенда (`VITE_API_URL`, в Docker — same-origin через nginx `/api`) | продакшн-сборка, compose |
| `mock` | `src/api/mockServer.ts` (фасад) + модули `mock*` (in-memory + localStorage) | офлайн-демо, component/e2e-тесты |
| `auto` | пинг `GET /api/v1/meta` (700 мс), фолбэк в mock + watchdog-возврат | дефолт dev-сборки |

**Прод = только real (решение владельца 31.10.2026, transparency-п.4, вариант A).**
Mock-режим (демо-данные, бейдж `ApiModeBadge`, переключатель, mock-фолбэк auto-пинга)
доступен только в dev-сборке или в прод-сборке с явным build-флагом
`VITE_ENABLE_MOCK=true` (демо-стенд Vercel — `vercel.json → build.env`). В прод-сборке
без флага: `apiMode=mock` в localStorage и `VITE_API_MODE=mock` игнорируются,
`resolveMode` всегда даёт `real`, чанк `mockServer` в артефакт не попадает
(статически мёртвая ветка dynamic import), а при недоступном бэкенде страницы
показывают человеческую ошибку с кнопкой «Повторить» вместо тихого ухода на
демо-данные. Приоритет (dev/демо-стенд): переключатель UI (localStorage `apiMode`) → `VITE_API_MODE` → auto. Контракт mock↔real фиксируют contract-тесты (`npm run test:contract`, nightly parity). **Известное отклонение:** mock-`summary/shopping` пока отдаёт фикстуру FIX-1, а не расчёт из meals (PLAN P2) — новые эндпоинты так не делать.

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
Количество ингредиента на приём = `recipe_amount / base_servings × effectivePeople` (scale 3, HALF_UP), с применением правок состава V19/V21: `removed` исключает строку, `added` (EXTRA) добавляет `amount_per_serving` КАК АБСОЛЮТ на приём — без масштабирования людьми/baseServings (`EffectiveLine.absolute`, спека §3; legacy `× effectivePeople` — историческая девиация, устранена V21), substitution переносит количество `from → to × ratio`. Конвертация единиц (граммы/ккал) — единый источник `UnitOfMeasure.gramsPerOne/toGrams` (KG/L → ×1000; PCS/PACK → ×piece_weight_g, без него конвертация неизвестна).

### Закупки и упаковки

Агрегат по ингредиенту: сумма по приёмам дня (by-days) и по дням (shopping). Упаковки: при `round_to_packs` и `pack_size`: `packsToBuy = ceil(total/pack_size)`, `buyAmount = packs×pack_size`, `leftover = buyAmount − total`.

### Патч «UX-список 26.10» (U26–U42) — клиентские контракты

- **Чеклист закупки (вкладка «Чеклист»)** — та же упаковочная формула (`utils/checklist.ts`, паритет `SummaryService.calculatePacks`), но считается из клиентской закупки (единый источник вкладок) + информации о фасовке/категориях из справочника продуктов (best effort) и trip-рецептов. Группы — по категориям (алфавит, «Прочее» последняя), внутри — алфавит. Отметки «взято» — сессионные (не данные похода).
- **«На человека» (U33)** — делитель `realPeople = Σ effectivePeople(дни) / число дней` (min 1); без peopleOverride совпадает с `defaultPeople` (обратная совместимость фикстур). Формула в `utils/calculations.ts: realTripPeople`.
- **Overlay меню (U30)** — карточка приёма показывает серверные правки состава (`GET /trips/{id}/substitutions`): EXTRA (+бейдж), EXCLUDED (скрыт), SUBST (`from → to × ratio`), SCALE (`× ratio`). Id-сопоставление — по базовому id (mock-суффикс `::t…` снимается) и `snapshotOf` trip-копий. Semantics — паритет `classifyEdits` c mock `classifyMealEdits`/backend `MealCompositionService`. EXTRA: `absoluteAmount` (абсолют на приём, §3) либо legacy `amountPerServing × people`.
- **Ручные позиции (U40, R3)** — `GET/POST /trips/{id}/manual-items`, `DELETE /trips/{id}/manual-items/{itemId}`; DTO `TripManualItem {id, tripId, dayId|null, ingredientId, ingredientName, unit, amount, note?}`; amount — абсолют (не на порцию). Вливаются в «Закупка на поход» (все), «По дням» (dayId), «Чеклист» (все). Backend: V22 `trip_manual_items` (day_id ON DELETE CASCADE, ingredient RESTRICT, amount>0 CHECK), `TripManualItemService` (ownership 404, trip-scope резолв ингредиента по AGENTS §9). Остаток R3: встраивание в серверный `computeShopping` (source=MANUAL) и usedIn при удалении продукта.
- **PUT /trips/{id} (U36 + Fix-2 п.1)** — имя/заметки/defaultPeople всегда; смена дат — ЧАСТИЧНОЕ стирание: дни вне нового диапазона удаляются (приёмы — orphanRemoval, дневные ручные позиции — FK CASCADE), пересекающиеся дни сохраняют план (те же id), недостающие даты добавляются. Семантика идентична в `TripService.updateTrip` и mock; UI предупреждает confirm'ом с перечнем исчезающих дат.
- **По-дневные исключения (Fix-2 п.5 + Fix-5/R2-шаг2)** — одно множество ключей двух форматов: `<ingredientId>` (весь поход) и `<dayDate>::<ingredientId>` (только день). Дневное исключение уменьшает количество дня и агрегат закупки/person-сводки, но не вычёркивает позицию в другие дни (`isRowExcluded`, `dayScopedExclusions` в `utils/calculations.ts`). Серверное хранение (V23): `trip_shopping_exclusions.day_date` NULL = глобальное; уникальность — два partial-индекса; контракт `PUT/GET /trips/{id}/shopping-exclusions` — `{items:[{ingredientId, dayDate|null}]}` (legacy `ingredientIds` принимается), GET отдаёт объекты; `getExcludedIngredientIds` = только глобальные строки.
- **Прогресс карточек в списке (cleanup-п.8, вариант A)** — `GET /api/v1/trips` отдаёт в каждом элементе поле `progress` (`TripProgressResponse`): `{stage: menu|shopping|checks, meals, checklistTotal, facts, factsTotal, totalCost, costPerPerson}` — клиент открывает список ОДНИМ запросом (без N+1 per-trip загрузок и локального deriveTripView). Сервер считает на своей стороне (backend `TripProgressService` поверх канонического `ShoppingListCalculator` + исключения V23: глобальные вычёркивают позицию, по-дневные уменьшают количество пересбором из byDays; mock — `mockTripProgress.buildTripProgress` через тот же клиентский `deriveTripView`, паритет-тест `tripListProgress.test.ts`). Отметки «взято» живут в localStorage — сервер их не знает, поэтому серверный `stage` ∈ {menu, shopping, checks}, а клиент (TripsPage) уточняет shopping → store по локальным отметкам и считает `ready` через общую `utils/readiness`. `progress` заполняется ТОЛЬКО в списке; в одиночном `GET /trips/{id}` — null. Сбой расчёта прогресса одного похода не роняет список (best effort: `progress=null`).
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
- `deltaPercent = (actual−planned)/planned×100` (scale 2; planned=0 → 0). Итоги = сумма округлённых строк.

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
- **все ссылки похода — только trip-scoped**: `updateMeal` снепшотит рецепт как `addMeal`; `MealCompositionService.putComposition` резолвит каждый входящий id модулем `TripScopedIdResolver` (строка рецепта → её снепшот по `snapshot_of` → продукт своего похода → снепшот-копия глобального продукта; чужой trip-scope/несуществующий → 404), поэтому EXTRA/SUBST-цели из справочника привязываются к походу с замороженной ценой; `TripPriceOverrideService` редиректит чек, введённый на глобальный id, на снепшот похода (иначе оверрайд молча не применялся);
- миграция V21 дополнительно дедуплицировала legacy-снепшоты (канон — MIN(id) на (trip_id, snapshot_of), перепривязка recipe_ingredients/substitutions/overrides).

Бэкфил: миграция V20 перевела существовавшие походы на снепшоты (temp-таблицы соответствий, перепривязка overrides/exclusions/substitutions). Повторный прогон миграций безопасен (IF NOT EXISTS + DROP temp-таблиц в начале).

## Цены: локальная копия ЕМИСС (Росстат)

Единственный провайдер — `RosstatEmisProvider` (code `ROSSTAT`): официальные средние
потребительские цены Росстата через ЕМИСС (fedstat.ru) — «средняя цена по больнице»
в рублях, ежемесячно, по 885 позициям классификатора. Портал — **только транспорт**:
приложение больше не ходит в сеть за ценой при расчёте чека.

Контракт провайдера сужен до `PriceProvider` (`code`, `testConnection`) + `EmisDataSource`
(`downloadSnapshot`, `parseSnapshot`): `searchProducts`/`fetchPrices` удалены вместе с
ручной привязкой товара к внешней карточке.

### Локальная копия (V26) и сид (V27)

- `emis_products` — справочник позиций: `code` (PK, код классификатора, например `2307`),
  `name` («Крупа гречневая-ядрица, кг»), распознанная единица наблюдения
  (`unit_kind` MASS/VOLUME/COUNT/OTHER, `unit_amount`, `unit_scale` KG/G/L/ML/PCS,
  `unit_label`), `loaded_at`.
- `emis_prices` — точки цен: `(emis_code, region_code, period_year, period_month)` unique,
  `price numeric(14,2)`, `loaded_at`. Индекс `idx_emis_prices_lookup` — под «последняя цена».
- Регион — только `643004.АГ` («Российская Федерация без учета новых субъектов
  (с 01.01.2023)»); глубина — `period-years: 2` (точки вне окна отбрасываются при записи,
  устаревшие удаляются из таблицы).
- Внешних ключей между `emis_*` и `ingredients` нет намеренно: привязка «софт», продукт не
  должен ломаться, пока справочник не загружен.
- `V27` — сид из реальной выгрузки владельца (`data (2).xml`, 28.10.2026): 885 позиций
  справочника и 2260 ценовых точек, чтобы приложение работало, даже если прод-синк
  с порталом не пройдёт. `V28` переклассифицирует позиции вида «упаковка N шт.» и приводит
  семь названий продуктов к формулировкам ЕМИСС.

### Единица наблюдения (`EmisUnit`)

Название позиции ЕМИСС определяет, **к чему относится цена ряда**:

- «Яйца куриные, 10 шт.» / «Чай …, 25 пакетиков» — число штук в единице наблюдения
  (`COUNT`, `unit_amount=10`/`25`): цена указана ЗА ДЕСЯТОК / ЗА ПАЧКУ пакетиков;
- «Бумага офисная, упаковка 500 листов», «Салфетки …, упаковка 100 шт.» — слово-упаковка
  впереди числа: цена указана ЗА УПАКОВКУ ЦЕЛИКОМ (`COUNT`, `unit_amount=1`). Проверено
  реальными ценами (апрель 2026): пачка бумаги 500 листов = 423,07 ₽ — за лист так не бывает;
- «…, кг» / «…, л» / «…, 100 мл» — MASS/VOLUME с масштабом.

`EmisPriceApplier` + `EmisUnit.pricePerUnit` приводят цену ряда к единице продукта
(`piece_weight_g` для штучных): KG→KG = P; KG→PCS = P·pw/1000; G(n)→KG = P·1000/n;
G(n)→PCS = P·pw/n; L→L = P; ML(n)→L = P·1000/n; COUNT(n)→PCS = P/n.

**Плотность ≈ 1 (решение владельца 29.10.2026).** Масса и объём пересчитываются один
к одному, поэтому добавлены пары KG→L = P, ML(n)→L = P·1000/n, L→KG = P, ML(n)→KG =
P·1000/n, а `piece_weight_g` штучного продукта при цене ряда ЗА ОБЪЁМ читается как
миллилитры: ML(n)→PCS = P·pw/n («Антисептик для рук, 100 мл» → наша штука 100 мл =
цена ряда 198,32 ₽). Правило пригодно для пищевых жидкостей и бытовой химии; для сред
с плотностью далеко от единицы (сжиженный газ, аэрозоли) оно неверно физически — такие
позиции не привязываются вовсе: «Газовый баллон резьбовой 220 г» ≠ «Газ сжиженный в
баллонах, 50 л» (9453), привязки нет и цена для пары не считается.

По-прежнему отбрасываются (точка уходит в `skipped`-счётчик запуска, а не молча искажает
цену) пары, где не хватает данных: COUNT→KG/L (нужен вес штуки, которого в классификаторе
нет: «Яйца куриные, 10 шт.» против яичного порошка в кг) и OTHER (услуга либо
нераспознанный суффикс). Никаких эвристик «молоко → литр» больше нет: единица берётся из
названия позиции, а не из догадки.

**Предупреждение о сомнительной паре (KB-5, решение владельца 29.10.2026: «нужно
предупреждение, остальное на откуп админа»).** `EmisUnit.convertsTo(unit, pieceWeightG)`
отвечает, приводится ли цена позиции к единице продукта в принципе (то же правило, что и
`pricePerUnit`, но БЕЗ требования иметь цену — у позиции 9453 цен в копии нет, а привязывать
к ней баллон всё равно нельзя), а `EmisUnit.linkWarning(emisPrice, unit, pieceWeightG,
currentPrice)` собирает текст предупреждения по трём признакам:

1. пересчёт невозможен (OTHER/услуга, COUNT против кг/л, у штучного продукта не задан
   `piece_weight_g`) — синхронизация такую точку отбросит, цена останется ручной;
2. **масштаб не сопоставим**: единица наблюдения позиции крупнее штуки продукта в ≥ 100 раз
   («Газ сжиженный в баллонах, 50 л» против баллона 220 г = 227 раз) — правило «плотность ≈ 1»
   на такой паре физически неверно, цена была бы занижена на порядки;
3. **цена уехала**: после пересчёта цена отличается от текущей цены продукта в ≥ 10 раз.

Пороги выбраны по фактическим данным каталога: принятые владельцем привязки «цена категории»
(×0,18–4,7: кофе «3 в 1», сублиматы, сушёные овощи) предупреждений не дают. Привязка
**не блокируется** ни в UI, ни в `ProductService` — предупреждение только информирует.

**Фасовка продукта приводится к номенклатуре ЕМИСС** там, где единица наблюдения не
совпадала (V29): «Туалетная бумага, 4 рулона» → «Бумага туалетная, рулон» (6502),
«Влажные салфетки, упаковка 100 шт» → «Салфетки влажные, упаковка 20 шт.» (6505),
«Спички влагозащищённые (20 шт)» → «Спички, коробок» (5701). Вместе с именем и
`piece_weight_g` миграция делит историю `ingredient_prices` на коэффициент фасовки
(÷4, ÷5, ÷20) — иначе в ряду осталась бы цена прежней упаковки.

### Пайплайн синхронизации

`POST /admin/integrations/ROSSTAT/sync/prices` → 202 `{logId}` →
`IntegrationService.executePriceSync` (`@Async`-граница) → `PriceSyncService.runSync`:

1. **download** — одна попытка, без транзакции и без БД-сессии (`open-in-view: false`);
2. **`EmisMirrorService.store`** (`REQUIRES_NEW`) — upsert справочника и цен, обрезка окна
   `period-years`; счётчики (`products`, `prices`, `deleted`) уходят в `SyncLog.details.mirror`
   вместе с `snapshotSource` («портал rosstat» / «файл <имя>»);
3. **`EmisPriceApplier.apply`** на каждый привязанный продукт (`REQUIRES_NEW`) —
   пересчёт единицы, upsert `ingredient_prices` (`source=ROSSTAT`) по датам точек;
4. **`finalizeSyncLog`** — статус ВЫВОДИТСЯ из счётчиков: `errors==0 → SUCCESS`,
   `errors>0 && работа выполнена → PARTIAL`, `errors>0 && ничего не сделано → FAILED`.

**Ручные цены не защищены (решение владельца, запуск №17).** У привязанного к ЕМИСС
продукта синхронизация перезаписывает действующую цену любого источника, а оставшиеся
ручные срезы удаляет (`IngredientPriceRepository.deleteManualByIngredientId`) — иначе
стоимость меню считалась бы по вчерашней ручной цифре. В деталях запуска это видно как
`перезаписано N, удалено M`. Значение `SKIPPED_MANUAL` из `details` ушло; действия —
`CREATED/UPDATED/SKIPPED/ERROR`.

Правила Fix-16 для фонового кода остаются в силе: **никаких JPA-сущностей между
транзакциями** (между шагами передаются plain-record `LinkedProduct`/`LocalPrice`),
**короткие `REQUIRES_NEW`-транзакции только через self-прокси** (`ObjectProvider<…>`:
вызов через `this.` обходит прокси Spring и аннотация молча игнорируется), внутри
транзакции сущность перезагружается по id.

### Ручная загрузка выгрузки (multipart)

ЕМИСС блокирует зарубежные дата-центры и отдаёт `302`/`503` на узкие наборы фильтров,
поэтому владелец может скачать выгрузку сам и положить её в приложение:

- `POST /admin/integrations/{provider}/upload`, multipart-поле `file` → 202 `{logId}`;
- `IntegrationService.uploadSnapshot` → `@Async executeUploadSync` → тот же
  `PriceSyncService.runSync`, но с `parseSnapshot(bytes, fileName)` вместо скачивания.
  Подключение провайдера НЕ требуется (портал не задействован);
- защиты: неизвестный провайдер → 404, пустой файл → 400 `EMPTY_FILE`, уже идущий синк →
  409 `SYNC_ALREADY_RUNNING`, ошибка чтения → 400 `FILE_READ_ERROR`, пустой/слишком
  большой/не-SDMX файл → `IntegrationUnavailableException` с причиной;
- лимит: `spring.servlet.multipart.max-file-size`/`max-request-size` =
  `${EMIS_UPLOAD_MAX_FILE_SIZE:96MB}` — согласован с `max-response-bytes` и с
  `client_max_body_size 96m` в `nginx.conf`;
- фронтенд: блок «Загрузить выгрузку ЕМИСС вручную» в разделе «Интеграции»
  (`api.postFile`), дальше тот же поллинг журнала, что и для обычного синка.

### Привязка продукта к позиции ЕМИСС («софт»)

- `ingredients.emis_code` (V26) — единственный след привязки: никаких внешних сущностей;
- `GET /admin/emis/products?query=&limit=[&unit=&pieceWeightG=&price=]` (`EmisController` →
  `EmisCatalogService`) — поиск по локальной копии, `EmisProductDto(code, name, unitLabel,
  latestPrice, latestPriceDate, pricePerUnit, warning)`: цена и период видны сразу, до выбора
  позиции. Необязательные параметры — контекст продукта (`EmisCatalogService.LinkContext`):
  с ним каждая строка результата приходит сразу с ценой, пересчитанной на НАШУ единицу, и
  предупреждением `EmisUnit.linkWarning` о сомнительной паре (KB-5). Пересчёт живёт только
  на сервере: деньги на клиенте не считаются (§12 `AGENTS.md`). Без контекста (и в пакетной
  выдаче `describe()`) оба поля null;
- `ProductRequest.emisCode`: пусто/null = отвязать, неизвестный код =
  `VALIDATION_ERROR` (опечатка не должна молча ломать синхронизацию);
- `ProductResponse`: `emisCode`, `emisName`, `priceSyncStatus` =
  `NOT_LINKED` (источник не выбран) / `NO_DATA` (привязан, но цен в копии нет) /
  `SYNCED` (действующая цена получена из ЕМИСС), `emisSharedCount` — сколько ЕЩЁ глобальных
  продуктов привязано к той же позиции (`IngredientRepository.countByEmisCodes`, KB-8);
  всё считается пакетно, без N+1 (один запрос на страницу списка);
- несколько продуктов на одном коде — законная ситуация (на боевой копии 140 из 204 продуктов
  сидят на 30 общих позициях, рекорд — 2007 «Сухие супы в пакетах, кг» у 17 продуктов), но
  цена синхронизации приходит одна на всех, поэтому в колонке «Цена синхронизирована» стоит
  значок `Share2` с подсказкой;
- фронтенд: `EmisLinkPicker` в модалке продукта (debounce-поиск, цена и период в списке,
  «Отвязать»), колонка «Цена синхронизирована» в `ProductTable`, фильтр «привязаны к ЕМИСС»;
- ручная привязка из раздела «Интеграции» удалена, таблицы `ingredient_mappings` и
  `external_products` дропнуты в V28 (код их не читал, строки были пусты).

### Протокол портала (как качаем)

Порт CRAN-пакета fedstatAPIr (референсная реализация); прямая «ссылка на CSV» у ЕМИСС
отсутствует:

1. `GET {base-url}/indicator/{indicator-id}` — страница показателя (cookie-сессия;
   сессия прогревается GET главной страницы портала — JSESSIONID до целевого запроса);
2. одноразовый Struts CSRF-токен: канонически из `div#downloadTokenHolder`
   (`input[name=struts.token.name]` → имя, `input[name=<имя>]` → значение), fallback —
   пара токенов по всему документу, затем одиночный `input[name=struts.token]`. Имя поля
   **не хардкодится**: на fedstat.ru `struts.token.name = token`. С неверным именем портал
   отвечает `200 text/html` и заглушкой «CSRF блокировка» (127 байт). Если токен не найден,
   ошибка несёт диагностику страницы (title, размер, маркеры протокола, видимый текст) —
   единственный канал отладки, т.к. ЕМИСС блокирует зарубежные дата-центры;
3. словари фильтров из встроенного JS страницы: объект после маркера `filters:`
   (извлечение балансировкой скобок с учётом строк; читается Jackson напрямую —
   ALLOW_SINGLE_QUOTES / ALLOW_UNQUOTED_FIELD_NAMES);
4. `POST {base-url}/indicator/downloadData.do?format=sdmx`, form-urlencoded: `title`,
   `struts.token.name`, `<имя токена>`, `id` (= `indicator-id`; без него — `200 text/html`,
   перерисованная страница показателя), `lineObjectIds*`, `columnObjectIds*`,
   `selectedFilterIds*`, `filterObjectIds`. POST идёт с `Redirect.NEVER`: `302` + `Location`
   означает, что портал **отклонил набор фильтров**;
5. ответ — SDMX **1.0** GenericData: `CodeLists` (словари; всегда полные — 885 товаров и
   450 ОКАТО независимо от выбранных фильтров, поэтому одна выгрузка обновляет весь
   справочник) + `Series/Obs`. Разбор ПОТОКОВЫЙ (StAX, `SdmxStreamParser` — см. ниже),
   namespace-agnostic (localName), DOCTYPE запрещён (XXE).
   Год — в `Obs/generic:Time`, месяц — в атрибуте РЯДА
   `Series/Attributes/Value[@concept="PERIOD"]` русским названием («январь»), регион —
   `s_OKATO`, товар — `s_grtov` (код классификатора, НЕ id значения фильтра со страницы),
   цена — `Obs/ObsValue/@value` с запятой как десятичным разделителем.

**Потоковый разбор SDMX (StAX)** — 29.10.2026, план `plans/done/2026-10-29-sdmx-stax-streaming.md`
(KB-1/BL-17). DOM целиком заменён одним проходом по событиям: `SdmxStreamParser.parse(InputStream,
regionTitle, maxBytes)` захватывает поддерево `CodeList`/`Series` в момент его закрытия, поэтому
в heap живёт ОДИН ряд, а не документ. Память не растёт с объёмом выгрузки: 66,2 МБ
(286 740 ценовых точек, 885 позиций) разбираются за ~4 с при `-Xmx128m`, тогда как DOM на том же
файле требовал 600–700 МБ. Следствия и детали:

- `XMLInputFactory` создаётся с `SUPPORT_DTD=false` и `IS_SUPPORTING_EXTERNAL_ENTITIES=false`:
  DOCTYPE и внешние сущности отклоняются ошибкой, а не разбираются (XXE);
- ряды, пришедшие РАНЬШЕ словаря товаров, буферизуются (в боевом ответе `CodeLists` всегда идут
  до `DataSet`); буфер ограничен 10 000 рядов — превышение прерывает разбор внятной ошибкой
  вместо тихого роста heap;
- `LimitedInputStream` обрывает само ЧТЕНИЕ на `integration.rosstat.max-response-bytes` (96 МБ):
  сообщение называет лимит и способ его поднять, вместо OOM на runaway-ответе;
- транспорт отдаёт тело потоком: `EmisTransport.Session.postFormStream` → `StreamResult(status,
  body: InputStream, contentType, location)`. Дефолтная реализация метода сохраняет совместимость
  с тестовыми фейками (тело строкой), `JdkEmisTransport` переопределяет её настоящим потоком;
- диагностика отказа портала собирается по «голове» ответа (4 КБ, `PushbackInputStream` +
  `EmisTransport.readHead`): HTML-заглушка «CSRF блокировка», `text/html` вместо SDMX, `302`
  и `503` различимы без чтения всего тела (R10);
- ручная загрузка файла админом идёт тем же парсером; `EmisDataSource.parseSnapshot(byte[],
  fileName)` остаётся на `byte[]` — это граница `@Async` в `PriceSyncService`, multipart-поток
  к моменту разбора уже закрыт, а 96 МБ (`EMIS_UPLOAD_MAX_FILE_SIZE` = `client_max_body_size`
  nginx = `max-response-bytes`) — общий потолок объёма.

**Модули интеграции** (`com.provision.integration`, декомпозиция BL-15 — каждый файл ≤ 500 строк,
R8/R9): `RosstatEmisProvider` (355) — протокол выгрузки и сборка слепка; `EmisPortalPage` (272) —
разбор HTML страницы показателя (Struts-токен, словари фильтров, диагностика страницы);
`EmisRequestForm` (172) — тело POST `downloadData.do` и счётчики полей для лога;
`JdkEmisTransport` (163) — транспорт на `java.net.http` (cookie-сессия, `Redirect.NEVER`);
`EmisTransport` (130) — seam `Session`/`Transport`, `PageResult`/`StreamResult`, тексты
диагностики; `EmisValues` (103) — извлечение объекта `filters:` из встроенного JS;
`SdmxStreamParser` (464) — StAX-разбор SDMX 1.0/2.1 в `EmisSnapshot`.

**Выбор фильтров**: регион — один (из конфига); товары, годы и единицы — ВСЕ значения;
ось «Период» — `period-months` последних месяцев (дефолт 0 = все 12, окно хранения режет
`EmisMirrorService`). Один POST на синхронизацию.

Инварианты, подтверждённые живым зондом владельца:

- **все поля с несколькими значениями обязаны присутствовать** в `selectedFilterIds`,
  иначе портал отвечает `302`;
- **ось «Год» сужать НЕЛЬЗЯ**: `302` на любое сужение (проверено на 2026+2025 и 2023+2024),
  тогда как сужение «Периода» (1 месяц → `200`, 5 649 772 байта) и «Товаров»
  (2 товара → `200`, 499 770 байт) принимается;
- **объём больше не ограничивает**: полный ряд (2000…текущий год × 885 товаров × 12 месяцев) —
  927 `selectedFilterIds` и **65 076 787 байт**. До 29.10.2026 это было ~130 МБ `String` и пик
  600–700 МБ heap на DOM, поэтому `max-response-bytes: 32MB` отказывал в разборе полного ряда;
  теперь разбор потоковый (StAX): 66 МБ разбираются в 128 МБ heap. `max-response-bytes: 96MB`
  остался предохранителем от runaway-ответа — при превышении чтение обрывается, а не ждёт
  полной загрузки;
- портал троттлит: после ~12 быстрых POST — `503` от nginx.

**Конфигурация**: `integration.rosstat.{base-url, indicator-id (31448 — «Средние
потребительские цены на товары и услуги», месяц; альтернатива 37426 — недельные), region,
region-code (643004.АГ), user-agent, period-years (2), period-months (0),
max-response-bytes}`; `integration.contact-email` — контакт для UA;
`EMIS_UPLOAD_MAX_FILE_SIZE` — лимит multipart. Кэша нет намеренно: единственная точка
входа — кнопка синхронизации (или загруженный файл), и её смысл — положить в БД свежие
данные, а не отдать вчерашние. Страж биндинга — `RosstatConfigBindingTest`
(реальный yml → `@Value`).

**Версия приложения в User-Agent** (KB-4): единственный источник версии — `backend/pom.xml`
(сейчас `1.0.1`). `app.version: ${APP_VERSION:@project.version@}` в `application.yml` —
фильтрация ресурсов `spring-boot-starter-parent` подставляет версию pom при сборке,
`APP_VERSION` переопределяет её без пересборки; `spring-boot-maven-plugin` (goal `build-info`)
дополнительно кладёт в jar `META-INF/build-info.properties` (`build.version`, `build.time`) —
по нему видно, какая сборка отвечает. UA запросов к порталу: `provision/1.0.1 (dev@provision.app)`.

**Ограничения (честно)**: ЕМИСС блокирует зарубежные дата-центры (403 анти-бот — из
песочницы CI live-проверка невозможна, работает из сети пользователя РФ); портал
нестабилен, поэтому ручная загрузка файла — полноценный, а не аварийный путь; данные —
раз в месяц; позиции общие («Консервы мясные», не «Тушёнка говяжья 325 г»), поэтому часть
продуктов привязана к цене своей категории — приближённо, по решению владельца
(отчёт об отклонениях — в плане задачи).

**История: Open Food Facts (демонтирован полностью, Fix-13 + V28)**. U11/Fix-9/Fix-11
строили OFF-интеграцию (Search-a-licious + фолбэк Open Prices + карточки v2 + курсы ЦБ),
но поисковый хост OFF недостижим из сети пользователя, подключение жевало ~40 с ретраев,
а фолбэк-каталог не давал «средней цены по больнице». Удалены провайдер, конвертер валют,
карточка внешнего товара, `integration.off`/`integration.cbr`, `OFF_*` в compose/.env,
OFF-тесты и бейдж «OFF» в UI. V28 вычистила legacy-данные: `recipes.source='OFF'` →
`MANUAL`, `ingredient_prices.source='OFF'` → `API`, строки `integrations`/`sync_logs`
провайдера OFF удалены, CHECK-ограничения сужены, `RecipeSource.OFF` удалён из enum.

Mock-сервер повторяет контракт (`mockIntegrations.test.ts`): `GET /admin/integrations`
(IntegrationDto), connect/disconnect, `GET …/sync-logs` (SyncLogDto),
`POST …/{provider}/sync/prices` и `POST …/{provider}/upload` → `{logId}` с фоновым
переходом лога в SUCCESS со счётчиками, коды 409 `INTEGRATION_DISCONNECTED` /
`SYNC_ALREADY_RUNNING`, 400 `EMPTY_FILE`, 404 для неизвестного провайдера;
`GET /admin/emis/products` — `EmisProductDto` с реальными позициями справочника
(`unitKind`/`unitAmount`/`unitScale` в моке служебные и наружу не отдаются), включая
контекстные параметры `unit`/`pieceWeightG`/`price` и пересчёт `pricePerUnit`/`warning`
(`emisPricePerUnit`/`emisLinkWarning` — тексты предупреждений один в один с
`EmisUnit.linkWarning`); `/admin/products` — `emisCode`/`emisName`/`priceSyncStatus`/
`emisSharedCount`/`currentPrice` как в `ProductResponse`. Роутов ручной привязки (`products/search`, `ingredients/:id/mapping`)
в моке больше нет — как и в бэкенде.

## Правки состава приёма (V19 + composition API)

Хранение — поверх `trip_ingredient_substitutions`, без новой таблицы (`MealCompositionService`, решение зафиксировано в PR #47–49):

| State UI | Хранилище | Эффект в конвейере |
|---|---|---|
| RECIPE | записи нет | derived = amount/baseServings × people |
| SCALED | from=X, to=X, ratio | derived × ratio |
| EXTRA | added=true, from=null, to=X, amount_per_serving = **абсолют на приём** (V21) | добавка к агрегату БЕЗ масштабирования (`EffectiveLine.absolute`) |
| EXCLUDED | removed=true, to=null | строка рецепта пропускается |
| замена | from=A, to=B, ratio | qty(B) += qty(A)×ratio; qty(A) := 0; SCALE-правки A переносятся на B |

API: `GET/PUT /api/v1/trips/{tripId}/meals/{mealId}/composition` (GET — сервер считает масштабирование и totals; PUT — атомарный batch-диф desired-состояния). Модули (аудит 29.10.2026, SRP-декомпозиция): `MealCompositionService` — оркестратор (валидация, контекст, GET-ответ), `CompositionDiffEngine` — диф-коммит SCALE/EXTRA/EXCLUDE/SUBST, `TripScopedIdResolver` — V20-резолв входящих id, `CompositionCalculator` — чистая математика веса/ккал/стоимости. Порядок в конвейере: SCALE → people → EXCLUDE → EXTRA → substitutions. UI: `MealCompositionModal` (5 статусов-бейджей, действия по состоянию, merge-подтверждение, инлайн-замены, dirty-state, live-итоги; свободный ввод при сохранении резолвится в справочник через check-name/`POST /admin/products` — на сервер уходят только реальные id).

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
- `EmisProductDto`: `code/name/unitLabel/latestPrice/latestPriceDate` + `pricePerUnit`/`warning`
  (заполняются только в поиске с контекстом продукта — KB-5). `ProductResponse.emisSharedCount`
  — сколько ещё продуктов на той же позиции ЕМИСС (KB-8). Поля аддитивные, mock повторяет.

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

- `SummaryService.computeShopping` — единый расчётный конвейер (shopping/by-days/person/kcal), price-series кэш, пакетные загрузки (JOIN FETCH / DISTINCT ON / IN-батчи). Аудит 29.10.2026 (SRP): сервис — оркестратор (загрузка графа/контекста, транзакционные границы), расчёт в модулях `MealPlanCalculator` (люди/количества/округление итогов), `ShoppingListCalculator` (закупка: общий список Σ qty_day×цена дня + по дням + упаковки), `DailySummaryCalculator` (меню по дням), `PerUserSummaryCalculator` («на человека»).
- `TripCatalogSnapshotService` — copy-on-write снепшоты (V20).
- `TripIngredientEditService`, `TripShoppingExclusionService` — правки состава/исключения (V19); `MealCompositionService` + `CompositionDiffEngine`/`TripScopedIdResolver`/`CompositionCalculator` — состав приёма (V19/V21, модалка B).
- `SearchEscape` — единое экранирование LIKE (`%`, `_`, `!` — escape-символ) во всех поисковых Specification/запросах; пагинация каталога клампит page≥0, size 1..200.
- `PriceResolutionService` — actual = override ?: planned.
- `SecurityConfig` + `JwtService`/`JwtAuthenticationFilter` — stateless JWT, CORS из ENV, fail-fast секрета (`JwtProperties.validate`).
- `DevDataInitializer` / `DevTripsInitializer` — демо-пользователи и демо-походы (profile `dev` + `SEED_DEMO_USERS=true`), демо-походы создаются через снепшот-сервис.
- `RosstatEmisProvider` (`PriceProvider` + `EmisDataSource`) — оркестрация протокола ЕМИСС: Struts-токен → POST `downloadData.do?format=sdmx` → потоковый разбор SDMX (`downloadSnapshot` / `parseSnapshot` для загруженного файла); кэша нет — выгрузка сразу уходит в БД. Рядом в `integration/`: `SdmxStreamParser` (StAX вместо DOM — память O(один ряд), KB-1), `EmisPortalPage` (HTML страницы показателя), `EmisRequestForm` (тело POST), `EmisTransport`/`JdkEmisTransport` (транспорт и диагностика ответов), `EmisValues` (словари фильтров из JS).
- `EmisMirrorService` — локальная копия справочника и цен (`emis_products`/`emis_prices`), окно `period-years`; `EmisCatalogService` — поиск позиций для привязки (`GET /admin/emis/products`).
- `PriceSyncService` — оркестрация синка (портал или файл), `EmisPriceApplier` + `EmisUnit` — пересчёт цены ряда в единицу продукта и запись `ingredient_prices`, `SyncDetailsBuilder` — `SyncLog.details`.
- `GlobalExceptionHandler` — коды конфликтов и field-errors.

### Frontend

- `api/client.ts` — режимы, refresh single-flight, `auth:session-lost`, `postFile` (multipart-загрузка выгрузки ЕМИСС); `api/mockServer.ts` — mock-паритет роутов: фасад (роутер `handleRequest` + тонкие обёртки), ресурсы — в модулях `mockState/mockEmis/mockSync/mockPrices/mockSnapshot/mockComposition/mockCatalog/mockTrips/mockAuth` (подзадача 25 аудита).
- `Modal` — единая портальная модалка (U3/U21): оверлей `.modal-overlay`, закрытие крестиком / Esc / кликом по фону; все модальные окна (TripForm, AddMealModal, MealCompositionModal, RecipeEditorModal, ApiModeBadge, детали рецепта/продукта, ввод чека) рендерятся через портал, e2e-селекторы скопятся на `.modal-overlay`.
- `TripDetailPage` (6 вкладок; подзадача 26 аудита: тонкий layout — состояние в хуке `pages/useTripDetail.tsx`, производные в `utils/tripDerived.ts`, презентация в `TripActions`/`TripSummaryPanel`/`TripDaysList`/`TripMealCard`/`TripShoppingTab`/`TripDayShoppingTab`/`TripPersonTab`/`ExclusionCheckbox`) + `PriceOverridesTab` (чеки план/факт); `RecipeEditorModal` (админ-редактор блюда с составом); `ProductsPage` (CRUD + цена срезом + `EmisLinkPicker` — источник цены из ЕМИСС); `ProductTable` (колонка «Цена синхронизирована»); `IntegrationsPage` (подключение, синк, ручная загрузка файла) + `IntegrationSyncLogs`; `CustomSelect/NumberField/DateRange/DatePicker` (контракты CR-3/CR-4).
- Дизайн-система «Провиант»: токены в `src/index.css`, design-pack в `provisions/` (источник правды дизайна; миграция — DESIGN_MIGRATION.md, ведётся отдельно).

## Security

- JWT: access 1 ч / refresh 7 д; refresh в БД — HMAC-SHA256(JWT_SECRET), а не SHA-256 (нельзя проверить по дампу БД без секрета); ротация DELETE-first (предел гонки — 401, повторное использование утекшего токена невозможно); logout удаляет токен; fail-fast при коротком/пустом секрете (<32 байт). Токены: `iss`/`aud` обязательны и проверяются, `typ=JWT`, clock skew 60 c.
- Login: `LoginAttemptService` — 5 неудачных попыток на email в окне 15 мин → блокировка 15 мин (429 + Retry-After), успешный логин сбрасывает счётчик; ответы login/refresh не различают «нет пользователя» и «неверный пароль» (анти-энумерация); демо-пароли сидов — только из env (`ADMIN_PASSWORD`/`DEMO_USER_PASSWORD`), хардкод удалён (аудит 29.10.2026).
- Ownership: все trip-эндпоинты фильтруют `trip.user = principal` (404 на чужое); ADMIN-зона под `@PreAuthorize`.
- Профили: `dev` (DEBUG, Swagger, демо-сид) / `prod` (WARN/INFO, Swagger/springdoc выключены, ошибки без detail, actuator health+info).
- CORS: whitelist из ENV, `allowCredentials=false` (токен в заголовке).
- Открытые задачи (PLAN P1): security-заголовки и gzip в nginx, refresh в httpOnly-cookie (пока localStorage — XSS-риск зафиксирован), fail-fast `POSTGRES_PASSWORD`, backup-процедура. Rate limiting `/auth/*` закрыт аудитом 29.10.2026 (`LoginAttemptService`).

## Database

- PostgreSQL 15, Flyway V1–V31 (V30 — композитный индекс `ingredient_prices(ingredient_id, effective_from DESC)` под DISTINCT ON-срезы «последняя цена», аудит 29.10.2026; V31 — частичный уникальный индекс `uq_sync_logs_running ON sync_logs(provider) WHERE status='RUNNING'`, AU-03 аудита 30.10.2026). Пропуски номеров осознанные: V9 не создавалась, V14/V15 удалены из истории дерева (урок: применённые миграции НЕ удалять и НЕ править; только новые номера; в существующих БД демо-юзеры V14/V15 могли остаться — cleanup-запрос в README).
- **Remedy для удалённых V14/V15 (AU-02, решение зафиксировано 30.10.2026).** Вариант «вернуть файлы заглушками» отклонён: Flyway сверяет checksum применённой миграции с локальным файлом, поэтому заглушка лишь меняет ошибку «not resolved locally: 14» на «checksum mismatch for version 14» — старт по-прежнему невозможен. Восстановить побайтово те самые файлы из истории нельзя надёжно: каждая БД записала checksum той редакции файла, которая была в дереве на момент применения, и `flyway repair` (переписывание checksum'ов) снова требует ручного действия на каждом деплое. Принят вариант конфига: `spring.flyway.ignore-migration-patterns: "*:missing"` (см. комментарий в `application.yml` — почему это безопасно для сида демо-юзеров и почему `*:future`/`*:pending`/checksum намеренно НЕ игнорируются). Альтернатива для оператора — `flyway repair` либо `DELETE FROM flyway_schema_history WHERE version IN ('14','15')`. Гейты: `FlywayUpgradeIntegrationTest` (БД с V14/V15 в истории обязана стартовать) и CI-job `migration-upgrade` (AGENTS R6: миграция на существующей БД).
- Снепшоты: `recipes.trip_id/snapshot_of`, `ingredients.trip_id/snapshot_of`; partial unique `(name_norm, unit) WHERE trip_id IS NULL`; копии создаются с `code = NULL`.
- История цен: `ingredient_prices` UNIQUE(ingredient_id, effective_from), `source` ∈ MANUAL/ROSSTAT/API (V28 сузил CHECK, значение OFF вычищено); сид V13/V17 генерирует 24 мес. сезонного дрейфа детерминированно.
- Локальная копия ЕМИСС (V26): `emis_products` (PK `code`, единица наблюдения) и `emis_prices` (unique `(emis_code, region_code, period_year, period_month)`, индекс под «последнюю цену»); `ingredients.emis_code` — софт-привязка без FK. V27 — сид (885 позиций, 2260 точек из реальной выгрузки), V28 — привязки (187 продуктов), переименования под номенклатуру ЕМИСС и демонтаж legacy (`ingredient_mappings`, `external_products`, source `OFF`), V29 — решения владельца 29.10.2026: три продукта переведены на фасовку ЕМИСС (рулон, упаковка 20 шт., коробок) с пересчётом `piece_weight_g` и истории цен, четыре новые привязки (антисептик 8016, крем для лица 5311, бумага 6502, салфетки 6505) — всего 191 привязка из 204 продуктов, 13 осознанно без привязки.
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

**Аудит 29.10.2026 (план `plans/done/2026-10-29-full-audit.md`)** добавлены: `ProductSearchInjectionTest` (INJ-01..04 — SQLi-попытки в поиске/пагинации), `ProductPageQueryCountTest` (число запросов страницы каталога не зависит от размера страницы), `EmisPriceApplierTest` (8) и `EmisMirrorServiceTest` (6) — закрытие BL-2/BL-3, `UnitOfMeasureTest` (3), `TripScopedIdResolverTest` (8), `CompositionDiffEngineTest` (8), `DailySummaryCalculatorTest` (2), `PerUserSummaryCalculatorTest` (2), `JwtServiceTest`/`AuthServiceTest`-кейсы ротации и анти-энумерации. `EconomicConsistencyTest` прогоняется в песочнице по классу отдельно (`MAVEN_OPTS -Xmx512m`, `-DforkCount=0`, LocalPgFallback) — 10/10 (KB-10, поправка 2).

**ЕМИСС-зона (29.10.2026: BL-23 + план `plans/done/2026-10-29-sdmx-stax-streaming.md`)**:
`SdmxStreamParserTest` (16 — golden-фикстура боевого ответа `src/test/resources/emis/data-31448-real.xml`,
формы SDMX 1.0/2.1, фильтр региона и вида показателя, мусорные точки, обрыв по `maxBytes`,
XXE/DTD, буфер рядов до словарей и его потолок, большой документ 1200 позиций × 2 региона × 12 месяцев),
`RosstatEmisProviderTest` (34 — протокол и диагностика отказов на фейковом транспорте),
`RosstatConfigBindingTest` (3 — реальный `application.yml` → `@Value`), `EmisUnitTest`
(20 — разбор суффикса единицы, `convertsTo`/`pricePerUnit`/`linkWarning` по всем ветвям),
`EmisCatalogServiceTest` (16 — `LinkContext`, «свежая» цена, лимиты выдачи, форма DTO),
`EmisControllerTest` (5 — срез `@WebMvcTest`: параметры `unit`/`pieceWeightG`/`price`, дробный вес
с запятой, форма `EmisProductDto`), `EmisSharedCountIntegrationTest` (5 — `emisSharedCount` в
`ProductResponse` на реальной БД: общая позиция, отвязка соседа, снимки похода не считаются).
Покрытие пакета `com.provision.integration` (jacoco 0.8.12): 84,7 % инструкций / 70,9 % ветвей,
`SdmxStreamParser` — 91,4 % инструкций; `JdkEmisTransport` — 0 % (живая сеть к порталу, KB-10).
Frontend: `ProductTable.test.tsx` (значок общей привязки со счётчиком) и `src/api/contractEmis.test.ts`
(21 — форма `EmisProductDto`, контекстные параметры, тексты предупреждений, `emisSharedCount`;
входит в `npm run test:contract`).

## Deployment (Docker Compose)

`docker compose up --build`: postgres (healthcheck pg_isready, порт только 127.0.0.1) → backend (healthcheck wget /meta, JWT_SECRET обязателен, profile по умолчанию `dev`) → frontend (nginx: SPA + прокси `/api`). Прод-сценарий: `SPRING_PROFILES_ACTIVE=prod`, `SEED_DEMO_USERS=false`, свой `POSTGRES_PASSWORD`, образы за реестром (задача P1: публикация в ghcr + стенд).

**Память backend (BL-18, 29.10.2026)**: `mem_limit: ${BACKEND_MEM_LIMIT:-1g}` в `docker-compose.yml`
+ `-XX:MaxRAMPercentage=70.0` в `backend/Dockerfile` (без явной настройки JVM взяла бы 25 % лимита —
~256 МБ heap); `JAVA_OPTS` переопределяется без пересборки образа, `HeapDumpOnOutOfMemoryError`
оставлен. Потоковый разбор SDMX укладывается в 128 МБ heap даже на ответе 66 МБ, поэтому 1 ГБ
покрывает и выгрузку, и применение цен в БД с запасом. Объём входа ограничен тремя согласованными
значениями по 96 МБ: `integration.rosstat.max-response-bytes` (100 663 296),
`EMIS_UPLOAD_MAX_FILE_SIZE` (multipart) и `client_max_body_size` в `nginx.conf`.


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
    (tripDerived.ts страницы похода, PriceOverridesTab, TripPrintPage).
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
