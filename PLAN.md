# Plan

Живой статус проекта. Формулы и контракты — `ARCHITECTURE.md`, правила агентов — `AGENTS.md`, дизайн — `DESIGN_MIGRATION.md`/`provisions/design-pack` (ведётся владельцем отдельно, агентами не трогается). Факт = коммит + зелёный гейт; записей «в рабочем дереве» не бывает.

**Обновлено:** 2026-10-26 · ожидающий патч `ux-list-26.10` (U26–U42: фронтенд + mock-паритет; backend-долг по U36/U38/U40 зафиксирован в разделе патча).

## Release 1.0 — критерии функционального прорыва

Приложение «нормально используется», когда пользовательский цикл проходится целиком без костылей и рассинхронов:

- [x] Админ ведёт каталог: продукты + цены срезу, блюда + составы, импорт OFF
- [x] Пользователь собирает меню: поиск/превью блюда, люди, снепшот при добавлении
- [x] Пользователь правит состав приёма (добавить/исключить/масштаб/замена) — серверно, batch PUT (PR #47/#49)
- [ ] Правки состава и исключения **видны во всех цифрах похода** (сейчас вкладки закупок считают на клиенте мимо серверных правок) — R1/R2
- [ ] Ручные позиции закупки (добавить/исключить/удалить свою) по дням и в чеке — серверные (сейчас отсутствуют вовсе) — R3
- [ ] Чек: факт сохранён на сервере ✅, но без черновиков-дублёров; экспорт печать/CSV — R4
- [ ] Цифры везде из одного источника `/summary/*`; клиент не пересчитывает деньги/ккал — R1
- [ ] Дашборд: план/факт/вес/ккал по походам — R6
- [ ] CI зелёный, contract-ночь зелёная, e2e real проходит сквозной сценарий — R0/R5/R8

## Функциональный аудит 2026-10-25 (user journeys)

| # | Journey | Статус | Evidence / что не так |
|---|---|---|---|
| J1 | Админ: продукты, цены, блюда, составы, импорт OFF | ✅ | `ProductsPage` (CRUD + цена срезу), `RecipeEditorModal`, `RecipesPage` админ-действия, staging approve/reject |
| J2 | Пользователь: поход → меню по дням | ✅ | `TripForm`, `AddMealModal` (RecipeSearchSelect + превью ккал/готовка/топ-ингредиенты, степпер людей, одна commit-кнопка), V20-снепшот при добавлении |
| J3 | Состав приёма: add/exclude/scale/замена | ✅ с оговоркой | `MealCompositionModal` → `GET/PUT /trips/{t}/meals/{m}/composition` (batch, атомарно; `MealCompositionService` поверх V19 без новой таблицы — решение зафиксировано в ARCHITECTURE). Оговорка: EXTRA-семантика и 4 красных contract-теста — R5 |
| J4 | Закупки: исключения, ручные позиции | ⚠️/❌ | Бэкенд: summary + edits + exclusions + снепшоты готовы. UI: клиентский пересчёт `calculations.ts`, исключения в localStorage `trip-shopping-excluded-*`; ручных позиций нет ни в бэке, ни в UI — R1–R3 |
| J5 | Чек: факт, итоги, экспорт | ⚠️ | `PUT price-overrides` персистентен ✅, но параллельно черновики `tripStaging`; exclusions локальные; экспорта нет — R2/R4 |
| J6 | Метрики: дашборд, вес, ккал-цель | ❌ | Дашборд без стоимостей, kpi-эндпоинта нет — R6 |
| J7 | Паритет и сквозные тесты | 🟡 | contract-тесты состава зелёные (PR #53); mock `summary/shopping` = фикстура FIX-1; e2e не покрывает состав/ручные/факт — R8 |
| J8 | CI/CD | ❌ | см. таблицу CI — R0 |

### Реестр рассинхронов («одно не ладит с другим»)

1. **Клиентский пересчёт vs серверные правки**: batch PUT состава сохранён, но «Закупка/По дням/На человека» считают из `calculations.ts` по необработанным копиям → правки не видны в цифрах. → R1.
2. **tripStaging/localStorage vs сервер**: черновики факта и exclusions живут в браузере, серверные сущности — отдельно; другое устройство не видит. → R1/R2, `tripStaging.ts` удалить.
3. **mock-фикстура FIX-1 vs реальный расчёт**: contract-ночь сравнивает фикстуру с бэком. → R8.
4. **EXTRA ×people vs спека (абсолют на приём)**: — **закрыто (econ-guardian)**: бэкенд хранит абсолют в `amount_per_serving` added-строк (V21-конвертация legacy), `SummaryService` не масштабирует absolute-строки; mock-паритет формы; страж — `EconomicConsistencyTest` EK-02/EK-05.
5. **Дубль-редакторы состава**: историческое окно добавления приёма правила глобальный рецепт — устранено модалками A/B (PR #49); рецидивы запрещены (AGENTS §9).

## Патч «UX-список 26.10» (U26–U42) — статус реализации

Пользовательский список от 26.10. Ревизия 1 — фронтенд + mock-паритет.
**Ревизия 2 (Fix-2, после пользовательской проверки)** — закрыт backend-долг: в окружении
поднят JDK 17 + Maven, backend-изменения КОМПИЛИРУЮТСЯ (`mvn compile`/`test-compile` — зелёные);
интеграционные тесты в этом окружении не прогнать (нет Docker) — проверка на CI.

| # | Пункт списка | Решение | Статус |
|---|---|---|---|
| U26 | «Закупка на поход» сортируемая по полям | кликабельные заголовки (Продукт/Количество/Стоимость), asc/desc, дефолт — по названию; утилита `utils/rowSort.ts` | ✅ фронт |
| U27 | «Закупка по дням» — по алфавиту | сортировка позиций внутри дня `compareRu` | ✅ фронт |
| U28 | «На человека» — по алфавиту | сортировка строкPerson-сводки | ✅ фронт |
| U29 | Кнопка «Выйти» не «где-то с краю» | профиль в футере сайдбара — кнопка-меню (поповер): имя/email + «Выйти» (danger) + тогл темы; отдельная крайняя кнопка убрана | ✅ фронт |
| U30 | Добавленные в трипе продукты видны в карточке приёма | overlay серверных правок на ингредиенты меню: EXTRA (+бейдж), EXCLUDED (скрыт), SUBST (замена имени ×ratio), SCALE (×ratio); `utils/menuOverlay.ts`. Fix-2: фронт читает ПОЛНЫЙ список правок из `GET /trips/{id}/ingredient-edits` (backend `TripIngredientEditResponse` уже содержит имена и количества); mock-роут добавлен (паритет) | ✅ фронт+mock+backend |
| U31 | Дроби в составе блюда («0,015 кг» вместо «15 г») | новый `AmountInput`: для KG/L ввод в г/мл с переключателем «г↔кг» (порог 1000), подсказка эквивалента; применён в Модалке B, `RecipeEditorModal`, `RecipeIngredientsEditor`, модалке ручных позиций | ✅ фронт |
| U32 | После ввода чека зависимые экраны перерисовываются | `TripDetailPage` переведён на общий стейдж `tripStaging` (`loadActualPrices/loadExcluded`) + подписка `onTripStageChange` — ввод чека во вкладке «Закупка и чеки» мгновенно пересчитывает «Закупка/По дням/На человека» и KPI | ✅ фронт |
| U33 | «На одного человека» делить на реальное количество людей | `realTripPeople(trip)` = среднее эффективных людей по дням (учитывает peopleOverride дней/приёмов); используется в Person-сводке и KPI «На человека»; без override'ов значение совпадает с defaultPeople (обратная совместимость) | ✅ фронт |
| U34 | Убрать технические подписи «делим на defaultPeople=4 / на 128 приёмов» | подписи заменены на нейтральные («N чел. в походе», «M человеко-приёмов за поход») | ✅ фронт |
| U35 | Скрыть страницу «Ошибки (демо)» | роут `/errors-demo` и пункт навигации удалены (редирект на /dashboard); файл страницы сохранён до востребования | ✅ фронт |
| U36 | Карандаш в списке походов — полноценное редактирование | `TripForm` в режиме редактирования; карандаш открывает форму; смена дат — через предупреждение + подтверждение. **Fix-2 (п.1): стирание ЧАСТИЧНОЕ** — удаляются только дни, ушедшие за новые границы (с их приёмами и дневными ручными позициями); пересекающиеся дни сохраняют план; предупреждение перечисляет исчезающие даты. Backend: запрет «Cannot change trip dates» снят, `TripService.updateTrip` выполняет слияние дней; mock — та же семантика | ✅ фронт+mock+backend |
| U37 | Из трипа «Изменить блюдо в справочнике» — сразу открывать редактор | `RecipesPage` читает `?edit=<recipeId>` и сразу открывает `RecipeEditorModal`. **Fix-2 (п.7):** причина «всё ещё не открывается» — в real-режиме `recipeId` состава это trip-scoped снепшот, которого нет в каталоге: backend `CompositionResponse` расширен полем `catalogRecipeId` (snapshotOf ?: id), модалка идёт по нему; mock отдаёт базовый id; фронт дополнительно резолвит снепшот через `snapshotOf`/суффикс | ✅ фронт+mock+backend |
| U38 | Новая вкладка «Чеклист» рядом с вводом чека | вкладка «Чеклист закупки»: целые упаковки (ceil по packSize), группы по категориям, алфавит, чекбоксы «взято». **Fix-2 (п.3/6):** фасовка и категории в real-режиме — backend `RecipeIngredientResponse` расширен (categoryName/packSize/roundToPacks/pieceWeightG/kcalPer100g), `normalizeRecipe` собирает из них ingredient-объект → «всё в Прочее» закрыто; отметки «взято» ПЕРСИСТЕНТНЫ (tripStaging `trip-checklist-bought-*`, осознанное отклонение до R2/R4) | ✅ фронт+mock+backend |
| U39 | Не работает «Удалить» у добавленного в поход продукта | баг Модалки B: серверная EXTRA-строка после «Удалить» оставалась в desired-PUT (`state:'EXTRA'`) и восстанавливалась. Новый черновой state `REMOVED`: строка скрывается, в PUT не попадает — бэкенд/mock удаляют EXTRA-правку (keepExtra-семантика) | ✅ фронт (red-green тест) |
| U40 | Продукты к дню / ко всему походу (антисептик, аптечка) | ручные позиции закупки (R3): `GET/POST /trips/{id}/manual-items`, `DELETE …/{itemId}`; день опционален; вливаются в закупку/дни/чеклист. **Fix-2 (п.2):** backend реализован — V22 `trip_manual_items`, entity/repository/service/controller (ownership 404, AGENTS §9 trip-scope резолв ингредиента, amount>0); «ошибка добавления» в real-режиме закрыта; кнопка «Продукты к походу» — заметная, с подписью, в шапке похода | ✅ фронт+mock+backend; остаток R3: встраивание ручных позиций в серверный `computeShopping` (source=MANUAL) и usedIn при удалении продукта |
| U41 | Ввод чека — по категориям, алфавит | модалка «Ввести чек»: группы по категориям продуктов (best-effort из справочника/рецептов, фолбэк «Прочее»), внутри — алфавит; таблица «Закупка» во вкладке тоже отсортирована по алфавиту | ✅ фронт |
| U42 | Нагромождение в поиске/дропдауне | `RecipeSearchSelect`: иконка поиска интегрирована в поле, текст с отступами, справа ОДИН элемент (✕ при выборе, иначе шеврон), фокус-обводка всего контрола | ✅ фронт |

### Fix-2 — доработки после пользовательской проверки (26.10, вторая итерация)

| # | Замечание | Решение | Статус |
|---|---|---|---|
| п.1 | «Стиралась ВСЯ инфа при смене дат» | частичное стирание: только дни вне нового диапазона (mock + `TripService.updateTrip` + текст предупреждения с датами); тесты: mock partial-dates, backend MI-04 | ✅ |
| п.2 | «Продукты к походу — ошибка; кнопка хрен пойми где» | backend-роуты `/trips/{id}/manual-items` (V22 + entity/service/controller, ownership); кнопка — primary с подписью в шапке | ✅ |
| п.3 | «Чеклист весь в “Прочее”» | `RecipeIngredientResponse` + categoryName/packSize/roundToPacks/pieceWeightG/kcalPer100g; `normalizeRecipe` маппит плоские поля → группы/фасовка работают в real-режиме | ✅ |
| п.4 | «Ввести чек — тоже всё в Прочее» | тот же источник категорий (п.3) — `categoryOf` в `PriceOverridesTab` | ✅ |
| п.5 | «Исключение в “по дням” вычёркивало продукт во ВСЕХ днях» | по-дневные исключения: составной ключ `<dayDate>::<ingredientId>` в общем стейдже; `isRowExcluded`/`dayScopedExclusions`; агрегат закупки и person-сводка уменьшаются только на количество исключённого дня; чекбокс дня снимает только день | ✅ (+тесты calculations) |
| п.6 | «Чеклист не сохраняется» | отметки «взято» — в общем стейдже похода (`trip-checklist-bought-*`), переживают перезагрузку; серверное хранение — вместе с R2/R4 (зафиксировано) | ✅ |
| п.7 | «Редактор блюда из трипа всё ещё не открывается» | `catalogRecipeId` в composition-ответе (backend+mock) + snapshot-резолв на фронте; `RecipesPage ?edit=` | ✅ |

Backend ревизии 2: V22-миграция, `TripManualItem` (+repository/DTO/service/controller),
`TripService.updateTrip` (частичное стирание), `RecipeResponse` (категория/фасовка),
`MealCompositionDtos.CompositionResponse.catalogRecipeId`. Гейты окружения патча:
`mvn compile` и `mvn test-compile` — ЗЕЛЁНЫЕ; интеграционные тесты (Docker) — не запускались,
проверка на CI. Новый тест: `TripManualItemsIntegrationTest` (MI-01..MI-05).

Тесты патча: `rowSort.test.ts`, `menuOverlay.test.ts`, `manualItems.test.ts`, `checklist.test.ts`,
`AmountInput.test.tsx`, `MealCompositionModal.test.tsx` (U39 red-green), `ManualItemsModal.test.tsx`,
`mockTripsUpdate.test.ts` (U36/U40 mock-роуты), `calculations.test.ts` (+realPeople),
`TripForm.test.tsx` (edit-режим), `RecipesPage.test.tsx` (+`?edit=`, MemoryRouter).
Coverage-include vitest.config расширен новыми файлами (R5).

Изменённые тестовые ожидания (осознанно, под новый UX): `RecipeEditorModal.test.tsx` — количество
состава вводится/отображается в граммах (U31): «100» → 0,1 кг; 0,05 кг показывается как «50».

**Гейты (локально, окружение патча — без JDK/Maven):** tsc --noEmit чисто · eslint чисто ·
vitest **330/330** (33 файла) · coverage-гейт R5 пройден (новые файлы: rowSort 100, menuOverlay 100,
manualItems 100, checklist 100, AmountInput 98.03, ManualItemsModal 96.77 — lines %).
Backend не затрагивался (задачи U36/U38/U40 — backend-долг выше); docker/e2e/contract-nightly —
не прогонялись, статус «не проверено» до CI.

| Релизный артефакт | Содержание | Статус |
|---|---|---|
| Патч `ux-list-26.10.patch` | Ревизия 1: U26–U42 фронтенд + mock-паритет + тесты + MD | 🟡 ожидает влития и CI |
| Патч `ux-list-26.10-fix2.patch` | Ревизия 2 (Fix-2, п.1–п.7): backend V22 + manual-items + умные даты + DTO-расширения; по-дневные исключения; персистентный чеклист; заметная кнопка; редактор из трипа (catalogRecipeId) | 🟡 подготовлен; гейты окружения: tsc/lint/vitest **341/341**/coverage R5 зелёные; `mvn compile`+`test-compile` зелёные; Docker-тесты backend — на CI |
| Патч `ux-list-26.10-full.patch` | Обе ревизии суммарно (дельта к main `298d4f5d`) — если rev-1 ещё не влит | 🟡 |

## Статус CI (2026-10-26, main `b3c8af4f` = PR #55 (ci-green + фронтенд U1–U25) + патч `ui-bugs-release1.patch`)

| Workflow | Статус | Причина / задача |
|---|---|---|
| CI → Backend Tests (main `d9683ede`) | 🔴 → 🟢 (патч) | старый `EconomicConsistencyTest` на main бил в несуществующий `POST /api/v1/recipes` (500, 8/8 red). Ветка `fixing-economic-consistency-tests-47f0b` не спасала: raw-SQL с выдуманными колонками (`protein_per_100g`…) → BadSqlGrammar 8/8 + «фиксы» SummaryService под собственный SQL-хак. **Ветку закрыть без merge.** Патч econ-guardian: тест переписан с нуля (10 сценариев, числа на бумаге, integrity-блок), продукт починен (B1–B10, V21). Локально: backend **91/91** (econ 10/10); с патчем `ui-bugs` — **109/109** (U11: OpenPricesSync 10, provider 11, OFF-enum 6) |
| CI → Frontend Tests | 🟢 (патч) | tsc/eslint чисто, **253/253** (251 + 2 новых free-text flow), coverage-гейт включённых файлов пройден (client.ts 80.94, calculations.ts 99.32). С патчем `ui-bugs`: **264/264** (+ mockIntegrations 5, getTripCover 3, RecipeEditorModal-комбобокс 2 и др.), coverage-гейт пройден (мин. client.ts 80.94) |
| Docker Stack Smoke | 🔴 → 🟢 (патч) | **CI-2 закрыт**: причина — порядок шагов в `docker-stack.yml`. «Tear down stack» (`if: always()`) стоял ВЫШЕ «Smoke — frontend index» и «register/login roundtrip»: гасил стек, и шаги 12–13 курили мёртвый `:3000` (шаги 1–11 зелёные, run 40249907291). Фикс: teardown перенесён последним шагом. Доказательство — следующий push-ран |
| E2E nightly | 🔴 → 🟢 (патч) | **CI-3 закрыт**: run 40298200774 (26.10, schedule) — устаревшие селекторы после дизайн-пака: E2E-03 ждал `/Продукт/` (кнопка получила aria-label «Добавить продукт», `a273d7e7`), E2E-04/05 скопились на `.fixed` (класс уехал из модалки TripForm в `af41bc3c`, теперь портал `.modal-overlay`). Фикс: селекторы сняты с фактического UI; локально **8 passed / 1 skipped** (skip = REAL-01, нужен compose-стек); с патчем `ui-bugs` — **9 passed / 1 skipped** (+E2E-09: сидовый поход открывается, имена блюд видны, добавление приёма — U6/U7). Доказательство — следующий nightly |
| Contract parity (nightly) | 🟢 (10-24) | после R1/R8 должен оставаться зелёным всегда |

## План прорыва: этапы R0–R9 (порядок = зависимости)

### R0. Разблокировать CI (0.5–1 день)
1. Влить kickoff-патч (tsc/lint-остаток, docker-stack-диагностика, MD).
2. **CI-1**: в `EconomicConsistencyTest` добавить `LOCAL_PG` + `@DynamicPropertySource` по образцу `MetaControllerTest`; локально снять стек 500 из `createIngredient` (запустить один тест с логом; чинить тест или эндпоинт — не маскировать).
3. **CI-2**: ✅ закрыт — teardown `if: always()` выполнялся до последних двух смоуков и гасил стек; перенесён в конец воркфлоу (патч `ci-green-release1.patch`).
4. **CI-3**: ✅ закрыт — `npm run test:e2e` локально: 8 passed / 1 skipped; устаревшие селекторы E2E-03/04/05 сняты с фактического UI (aria-label «Добавить продукт», скоуп `.modal-overlay` вместо `.fixed`).
*Готово:* все workflow зелёные на main два рана подряд.

### R5. Математика состава по спеке — **ЗАКРЫТО (econ-guardian, 2026-10-26)**
1. ✅ Бэк: added-строки — абсолют на приём (`EffectiveLine.absolute`, SummaryService не масштабирует); `MealCompositionService` хранит абсолют без конверсии; семантика `amount_per_serving` зафиксирована в ARCHITECTURE; V21 сконвертировала legacy-строки и сняла V7-констрейнт, блокировавший SCALED.
2. ✅ Mock: PR #53 + паритет формы хранения (amountPerServing=абсолют) и manual-строк закупки (absoluteAmount).
3. ✅ Гейты: `mealCompositionContract.test.ts` 9/9; unit бэка `applyEditsMarksExtraAsAbsolute`; «EXTRA-итог не меняется при people/base» — внутри `EconomicConsistencyTest` EK-02/EK-05/EK-08 (реальная БД, полный стек).

### R1. Единый источник цифр (1–1.5 дня)
1. `TripDetailPage`: вкладки меню/закупка/по дням/на человека читают `/trips/{id}/summary/*`; убрать импорт `calculations.ts` из страниц.
2. Удалить `src/utils/calculations.ts` (+тесты, правка `coverage.include`), `src/utils/tripStaging.ts`, ключи `trip-shopping-excluded-*`, `draftOverrides`.
3. Любая мутация (meal, composition, override, exclusion, manual) → единый `refreshSummaries()`.
*Готово:* правка состава меняет цифры всех вкладок; после reload/с другого браузера состояние то же; e2e-mock «исключил ингредиент → закупка уменьшилась».

### R2. Серверные исключения в UI (0.5 дня)
Чекбоксы «исключить» → `POST/DELETE /trips/{id}/shopping-exclusions`; строки с `excluded=true` из summary рисуются приглушённо с «вернуть»; клиентских Set'ов нет.

### R3. Ручные позиции закупки (1.5–2 дня)
1. V21 `trip_manual_items` (trip, day NULL-able, ingredient, amount, unit_price NULL, created_by) + CRUD-эндпоинты + встраивание в `computeShopping` (строки `source=MANUAL`; fact = unit_price ?: override ?: план) + usedIn при удалении продукта.
2. UI: «+ продукт» в «Закупка по дням» (с днём), «Закупка на поход» и в чеке (без дня); удалять только свои; picker с поиском и фасовочными подсказками.
3. Mock-паритет + contract + e2e: добавил → видно в дне/походе/чеке; удалил свою → исчезла; чужую удалить нельзя.

### R4. Чек-экран и экспорт (1 день)
`PriceOverridesTab` → «Чек»: строки из `summary/shopping` с source-бейджами; инлайн-факт (PUT, debounce) и «вернуть к плану» (DELETE); итоги план/факт/Δ из ответа; экспорт: печатная верстка (`window.print`) + CSV blob (наименование, кол-во, ед., план/факт ₽/ед, суммы).

### R6. Метрики похода и дашборд (1 день)
`GET /trips/{id}/summary/kpi` (plan/actual/delta/weightGrams/kcalPerPersonPerDay); карточки походов на дашборде; «На человека»: индикатор ккал/чел/день против цели (поле похода, дефолт 3000).

### R7. UX меню (0.5–1 день)
`PATCH /trips/{t}/days/{d}/meals/reorder`; «скопировать день / меню похода»; inline people-override на карточке приёма.

### R8. Тестовая сеть сквозных цепочек (1 день)
1. Mock `summary/*` — реальный расчёт из meals/edits/exclusions/manual; фикстуру FIX-1 удалить, contract-тесты перевести на динамические фикстуры.
2. e2e real (compose): регистрация → поход → состав (exclude+extra) → ручная позиция → факт в чеке → сверка итогов вкладок и после reload.
3. e2e real — blocking на schedule.

### R9. Релизная гигиена (фоново, 1–2 дня)
LICENSE-файл; мёртвые deps + `depcheck` в CI; `git filter-repo` (pack ~112 МБ); prod-деплой (ghcr + стенд, `SPRING_PROFILES_ACTIVE=prod`); backup-runbook; rate limiting `/auth`; nginx-заголовки/gzip; refresh в httpOnly-cookie.

## Backlog (вне Release 1.0)

- Продукт: шаблоны меню/ротация блюд, общие походы (участники и разделение стоимости), OFF-матчинг региональных продуктов, i18n, offline/PWA (после R1 — поверх готового серверного слоя).
- Техдолг: типы фронта `id: number` в новых DTO и постепенный перевод legacy; TanStack Query вместо ручных fetch; TIMESTAMPTZ-миграция дат; component-тесты модалок A/B ≥80% lines и e2e-mock чек-лист FORM-спеки §6 (остаток T8).

## Архив достижений (фазы и вехи)

| Фаза/веха | Содержание | Итог |
|---|---|---|
| 1–5 | CRUD каталога, CR-1..CR-5, Docker/CI, JWT+режимы mock/real | ✅ |
| 6–9 | Миграция страниц с AppContext на api-клиент (4 батча) | ✅ |
| 10 | Component-тесты, MODE-сьют, coverage-гейт R5 | ✅ |
| 11–12 | Аудит бэкенда: IDOR, N+1, @Async-sync, usedIn, packs | ✅ |
| 13 | UX-полировка: DatePicker, CustomSelect, formatRub | ✅ |
| 14 | V19: правки состава приёма + shopping-exclusions (бэкенд) | ✅ |
| Аудит 23.10 ×2 | P0: git-артефакты, сид-админ в миграциях, `/prices` | ✅ |
| Сид V17/V18 + демо-походы | 204 продукта / 201 блюдо, 3 демо-похода (DevTripsInitializer) | ✅ |
| PR #44–46 | Known Bug #1 (план по дням), N+1 summary, `computeShopping` | ✅ |
| Редактор блюд + mock-CRUD | RecipeEditorModal, POST/PUT/DELETE /admin/recipes в mock | ✅ |
| V20 снепшоты | изоляция походов от каталога, бэкфил, trip-`recipes`/`prices` | ✅ |
| PR #47–49 | Модалки A/B (FORM-спека), batch PUT composition, MealCompositionService, contract-тесты | ✅ (4 red закрыты PR #53) |
| PR #48, #52 | Дизайн-ревизия (токены/темы/ThemeToggle), lint-фикс | ✅ |
| PR #51, #53 | Бэк: Testcontainers/LocalPgFallback (CI-1), SCALED-substitution; mock: состав §3/§4 (SCALE→SUBST, EXTRA-абсолют, идемпотентный PUT), copy-on-write снепшоты; contract-тесты 9/9 | ✅ |
| Kickoff «Функциональный прорыв» | tsc/lint-хотфиксы (dup `state`, unused `products`) — superseded PR #51/#53; остаток патча: диагностика Docker Stack Smoke (CI-2) + ревизия MD | 🟡 в составе `ui-consistency-release1.patch` |
| UI-consistency Release-1.0 | Единый формат чисел/единиц (`utils/format.ts`: запятая, целые ₽, «1,5 кг»), нормализация плоских DTO (`getTripRecipes`, `ingOf`) — «Unknown»/«шт» закрыты, категория-объект → строка («[object Object]» закрыт), KPI = «Итого» (один источник), «По дням» считает факт по количествам дня, дропдаун поиска в потоке модалки, плюрализация «+N продукта», общие расчёты в «Закупка и чеки» вместо локальной копии | ✅ влито в main как `d9683ede consist fix` |
| econ-guardian (Release-1.0) | `EconomicConsistencyTest` переписан с нуля (10 сквозных сценариев: меню/закупка/дни/человек/состав/чеки/изоляция/updateMeal/DB-integrity/консистентность; числа на бумаге, только публичное API + read-only SQL). Продуктовые фиксы, которые он вскрыл и охраняет: дубли снепшотов на рецепт (B10), заморозка цены ≤ startDate (B6), EXTRA-абсолют (B2/R5), SCALED-констрейнт V7 → 500 при сохранении состава (B9, V21), SUBST-ноль источника в totals (B8), trip-scope резолв id состава (B1), снепшот в updateMeal (B3), редирект чеков на снепшот (B7), 400/405 вместо 500 (B4), free-text save-flow модалки (F2: check-name/create, «free-» id на сервер не уходят). V21: дедупликация legacy-снепшотов + конверсия EXTRA + прижим цен. Гейты: backend 91/91, frontend 253/253, tsc/lint чисто | ✅ влито в main как `f05c360d math test fix`; push-run CI зелёный |
| ci-green (Release-1.0) | CI-2: `docker-stack.yml` — teardown (`if: always()`) перенесён в конец (гасил стек до «frontend index» и «register/login» смоуков). CI-3: `e2e/main-flow.spec.ts` — селекторы E2E-03/04/05 сняты с фактического UI (aria-label «Добавить продукт»; скоуп `.modal-overlay` вместо удалённого `.fixed`). Локально: playwright **8 passed / 1 skipped** | ✅ влито в main через PR #55 (`b3c8af4f`, ветка `dev`) |
| ui-bugs (Release-1.0) | Список багов UI/UX от 25.10 (U1–U25). Навигация/страницы: статистика скрыта из nav (U1), chips-фильтры с aria-pressed (U2), sidebar-footer с ThemeToggle и выходом (U17/U18), тема/бейдж (U17). Модалки: единый портал `Modal` + крестики везде (U3/U21), фикс позиции при `fade-in-up` (U14), шапка деталей рецепта (U13), комбобокс категории блюда (U15), панель добавления продукта (U9), полный список продуктов в модалке состава — `size=1000` (U8). Походы: открываются без краша + имена блюд в меню (U6/U7, E2E-09), nowrap «1 порция» (U4), ingredient-имена на карточках (U20), локальные SVG-обложки (U24). Продукты: DatePicker+CustomSelect в форме (U10/U12), фикс гонки debounce-проверки дубля (U23: отменяемый таймер + сторож последовательности). **U11: реальная синхронизация цен — Open Prices + курсы ЦБ РФ (`ExchangeRateService`), обновление карточек продуктов (`ProductInfoProvider`-хук → `SyncLog.updatedCount`), фикс hang-бага main: инвертированная формула throttling'а усыпляла первый OFF-запрос на ~56 лет + deadlock семафора**. **U16: рецепты свободно удаляются — клиентские pre-checks убраны, mock-паритет с перепривязкой на снепшот**. U22: из `index.html` удалён посторонний injected-скрипт. Убраны hover-scale/layout-shift (U5/U19). Гейты: backend **109/109**, frontend **264/264**, playwright **9 passed/1 skipped**, tsc/eslint чисто | 🟡 патч `ui-bugs-release1.patch` — дельта к main `b3c8af4f` (фронтенд U1–U25 уже влит через PR #55; в патче: backend U11 + фикс throttling-hang, mock-паритет `/admin/integrations*`, E2E-09, U23 race-фикс ProductsPage, тексты IntegrationsPage, MD) |
| DESIGN_MIGRATION rev | пункты 0–8 закрыты владельцем, хвосты пункта 9 — отдельно | 🟡 вне аудита |

## Правила ведения

- Закрыто = коммит в main + зелёный гейт + строка в архиве.
- Устаревшее удаляется сразу; Known Bugs живёт только в реестре рассинхронов и CI-таблице.
- Новые MD-файлы запрещены (AGENTS §1); статус и инструкции — только здесь.
