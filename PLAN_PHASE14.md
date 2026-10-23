# Фаза 14 — Состав блюд: каталог (админ) + правки в рамках похода + бэкенд-агрегация

## Новые вводные пользователя (2026-10-24)
- N1: в каталоге блюд админ может **создавать новые блюда** — всё сохраняется в БД.
- N2: админ может **добавлять ингредиенты в блюда каталога** — сохраняется в БД (админская привилегия).
- N3: **в рамках похода** можно добавить/убрать продукт в блюде, не трогая исходное блюдо (изоляция правок).

## Статус задач
| # | Задача | Статус |
|---|--------|--------|
| 1 | Backend Java: применить TripIngredientSubstitution в SummaryService.getShoppingList/getShoppingByDays (from→to × ratio, substitutedFrom вместо null), ручные добавления и мягкие удаления, учёт shopping-exclusions | ⬜ НЕ СДЕЛАНО |
| 1a | Backend: сущность TripIngredientRemoval (nullable from/to, added-флаг) + миграция V17 (ALTER of from_ingredient_id DROP NOT NULL, ADD added BOOLEAN; новый трип removals/exclusions таблицы или расширение substitutions) | ⬜ |
| 1b | Backend: CRUD эндпоинты /trips/{id}/substitutions (+POST supports add/remove), /trips/{id}/shopping-exclusions PUT/GET/DELETE | ⬜ (substitutions GET/POST/DELETE есть — расширить) |
| 2 | mockServer: роуты + applyTripEditsToRows в агрегации — ПРОВЕРИТЬ прогоном vitest (noUnusedLocals/strict TS) | ⬜ проверка |
| 3 | Frontend TripDetailPage: переключатель режима сохранения состава «только в этом походе» (trip-level POST substitutions-diff) vs «ко всему каталогу» (PUT /admin/recipes/:id + confirm, только ADMIN) | ⬜ |
| 4 | UI мелочи: подпись единицы в колонке «План ₽/ед» (priceUnitSuffix); удалить мёртвый setDraftOverrides; filteredItems+onlyDiff со стейдж-оверрайдами | ⬜ |
| 5 | Гейты: npm run typecheck/build/vitest + mvn -q compile (mvn test если возможно) | ⬜ |
| 6 | PLAN.md: записать Фазу 14 с отметками выполнения | ⬜ |

## Контекст (что уже сделано ранее)
- Поиск по блюдам (RecipeSearchSelect, ?search=) ✅
- RecipeIngredientsEditor в окне «Добавить приём пищи» (замена/добавление/удаление) ✅ UI; сохранение сейчас глобальное через PUT /admin/recipes/:id ⚠️
- formatRub везде, toBaseUnits/costOf фикс единиц (г↔кг) на фронте ✅
- tripStaging (localStorage) для факт-цен и исключений; PriceOverridesTab синхронизирован ✅
- mockServer: MockSubstitution/MockRemoved/shoppingExcluded, applyTripEditsToRows, роуты substitutions/shopping-exclusions/ingredient-removals — код написан (коммиты 65ceed2..0334b99), тесты не гонялись ⚠️
- Backend: entity TripIngredientSubstitution (from/to NOT NULL, ratio), SubstitutionController GET/POST/DELETE, repository findByTripIdWithIngredients — ЕСТЬ. SummaryService их НЕ читает, substitutedFrom=null ❌
- В БД from_ingredient_id/to_ingredient_id NOT NULL → «добавить руками» и «убрать» текущей таблицей не выражаются → нужна миграция (см. 1a).
