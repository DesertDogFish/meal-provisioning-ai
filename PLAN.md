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
4. **EXTRA ×people vs спека (абсолют на приём)**: ~~конвейер трактует `amount_per_serving` добавленных строк как на порцию~~ — mock закрыт PR #53 (contract-тесты зелёные); сверка бэкенда `SummaryService` — → R5.1.
5. **Дубль-редакторы состава**: историческое окно добавления приёма правила глобальный рецепт — устранено модалками A/B (PR #49); рецидивы запрещены (AGENTS §9).

## Статус CI (2026-10-25, последние completed-раны + локальная верификация)

| Workflow | Статус | Причина / задача |
|---|---|---|
| CI → Backend Tests | 🟡 | **CI-1**: фикс влит (PR #51 — Testcontainers/LocalPgFallback для `EconomicConsistencyTest` + SCALED-substitution в `TripIngredientEditService`); ждём подтверждения ближайшим CI-раном |
| CI → Frontend Tests | 🟡 | PR #52/#53 закрыли unused-vars, dup `state` (MCM), unused `products` (TDP) и 4 red contract-теста (фиксы mock-состава). Локально на базе `5c321995` + ui-consistency-патч: tsc/lint чисто, **251/251 зелёные** |
| Docker Stack Smoke | 🔴 | падает `Up (detached)`, причина без логов раннера неизвестна; kickoff-патч добавляет `compose config -q`, диагностику на failure и teardown `if: always()`. **CI-2** |
| E2E nightly | 🔴 | mock-прогон красной после редизайна (PR #48) и/или composition-контрактов; триаж и починка. **CI-3** |
| Contract parity (nightly) | 🟢 (10-24) | после R5/R8 должен оставаться зелёным всегда |

## План прорыва: этапы R0–R9 (порядок = зависимости)

### R0. Разблокировать CI (0.5–1 день)
1. Влить kickoff-патч (tsc/lint-остаток, docker-stack-диагностика, MD).
2. **CI-1**: в `EconomicConsistencyTest` добавить `LOCAL_PG` + `@DynamicPropertySource` по образцу `MetaControllerTest`; локально снять стек 500 из `createIngredient` (запустить один тест с логом; чинить тест или эндпоинт — не маскировать).
3. **CI-2**: прочитать логи нового рана с диагностикой; починить по факту (compose/воркфлоу/раннер).
4. **CI-3**: `npm run test:e2e` локально; снять падающие селекторы редизайна; flaky-спеки — в skip с TODO (R4-правило AGENTS).
*Готово:* все workflow зелёные на main два рана подряд.

### R5. Математика состава по спеке — mock закрыт, бэк проверяется
1. Бэк: `SummaryService` — строки `added=true` добавляют абсолют на приём (не ×people); `MealCompositionService` — убрать конверсию абсолют↔per-serving с округлением; трактовку `amount_per_serving` для added зафиксировать в ARCHITECTURE. **Открыто**: PR #51 добавил SCALED-substitution в `TripIngredientEditService` — сверить с этим гейт ниже.
2. ~~Mock: `buildCompositionResponse` — derived для SCALED при people≠base, обнуление qty(from) при замене, идемпотентность batch PUT~~ — **закрыто PR #53** (SCALE→SUBST перенос, EXTRA-абсолют, идемпотентный PUT, copy-on-write снепшоты).
3. Гейт: `mealCompositionContract.test.ts` — **9/9 ✅ (локально, база `5c321995`)**; осталось: unit бэка «EXTRA-итог не меняется при people 4→6».

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
| UI-consistency Release-1.0 | Единый формат чисел/единиц (`utils/format.ts`: запятая, целые ₽, «1,5 кг»), нормализация плоских DTO (`getTripRecipes`, `ingOf`) — «Unknown»/«шт» закрыты, категория-объект → строка («[object Object]» закрыт), KPI = «Итого» (один источник), «По дням» считает факт по количествам дня, дропдаун поиска в потоке модалки, плюрализация «+N продукта», общие расчёты в «Закупка и чеки» вместо локальной копии | 🟡 патч `ui-consistency-release1.patch` (ждёт merge; гейты на базе `5c321995`: tsc/lint чисто, **251/251**, format.ts coverage 100%) |
| DESIGN_MIGRATION rev | пункты 0–8 закрыты владельцем, хвосты пункта 9 — отдельно | 🟡 вне аудита |

## Правила ведения

- Закрыто = коммит в main + зелёный гейт + строка в архиве.
- Устаревшее удаляется сразу; Known Bugs живёт только в реестре рассинхронов и CI-таблице.
- Новые MD-файлы запрещены (AGENTS §1); статус и инструкции — только здесь.
