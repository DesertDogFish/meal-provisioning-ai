# Plan

Живой статус проекта. Формулы и контракты — `ARCHITECTURE.md`, правила агентов — `AGENTS.md`, дизайн — `DESIGN_MIGRATION.md`/`provisions/design-pack` (ведётся владельцем отдельно, агентами не трогается). Факт = коммит + зелёный гейт; записей «в рабочем дереве» не бывает.

**Обновлено:** 2026-10-25 · master `2ce3a86` · ожидающий патч `functional-breakthrough-kickoff` (tsc/lint-остаток, диагностика docker-stack, MD-обновление, этот PLAN).

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

## Статус CI (2026-10-26, main `f05c360d` + патч `ci-green-release1.patch`)

| Workflow | Статус | Причина / задача |
|---|---|---|
| CI → Backend Tests (main `d9683ede`) | 🔴 → 🟢 (патч) | старый `EconomicConsistencyTest` на main бил в несуществующий `POST /api/v1/recipes` (500, 8/8 red). Ветка `fixing-economic-consistency-tests-47f0b` не спасала: raw-SQL с выдуманными колонками (`protein_per_100g`…) → BadSqlGrammar 8/8 + «фиксы» SummaryService под собственный SQL-хак. **Ветку закрыть без merge.** Патч econ-guardian: тест переписан с нуля (10 сценариев, числа на бумаге, integrity-блок), продукт починен (B1–B10, V21). Локально: backend **91/91** (econ 10/10) |
| CI → Frontend Tests | 🟢 (патч) | tsc/eslint чисто, **253/253** (251 + 2 новых free-text flow), coverage-гейт включённых файлов пройден (client.ts 80.94, calculations.ts 99.32) |
| Docker Stack Smoke | 🔴 → 🟢 (патч) | **CI-2 закрыт**: причина — порядок шагов в `docker-stack.yml`. «Tear down stack» (`if: always()`) стоял ВЫШЕ «Smoke — frontend index» и «register/login roundtrip»: гасил стек, и шаги 12–13 курили мёртвый `:3000` (шаги 1–11 зелёные, run 40249907291). Фикс: teardown перенесён последним шагом. Доказательство — следующий push-ран |
| E2E nightly | 🔴 → 🟢 (патч) | **CI-3 закрыт**: run 40298200774 (26.10, schedule) — устаревшие селекторы после дизайн-пака: E2E-03 ждал `/Продукт/` (кнопка получила aria-label «Добавить продукт», `a273d7e7`), E2E-04/05 скопились на `.fixed` (класс уехал из модалки TripForm в `af41bc3c`, теперь портал `.modal-overlay`). Фикс: селекторы сняты с фактического UI; локально **8 passed / 1 skipped** (skip = REAL-01, нужен compose-стек). Доказательство — следующий nightly |
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
| ci-green (Release-1.0) | CI-2: `docker-stack.yml` — teardown (`if: always()`) перенесён в конец (гасил стек до «frontend index» и «register/login» смоуков). CI-3: `e2e/main-flow.spec.ts` — селекторы E2E-03/04/05 сняты с фактического UI (aria-label «Добавить продукт»; скоуп `.modal-overlay` вместо удалённого `.fixed`). Локально: playwright **8 passed / 1 skipped** | 🟡 патч `ci-green-release1.patch` (base `f05c360d`); доказательство — следующий push/nightly ран |
| DESIGN_MIGRATION rev | пункты 0–8 закрыты владельцем, хвосты пункта 9 — отдельно | 🟡 вне аудита |

## Правила ведения

- Закрыто = коммит в main + зелёный гейт + строка в архиве.
- Устаревшее удаляется сразу; Known Bugs живёт только в реестре рассинхронов и CI-таблице.
- Новые MD-файлы запрещены (AGENTS §1); статус и инструкции — только здесь.
