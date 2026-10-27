/**
 * Fix-6 (список 26.10, п.22/25): серверные правки состава ОБЯЗАНЫ попадать в
 * клиентские расчёты закупки/чека/«на человека».
 *
 * Проблема («Имбирь сушёный не попал в чек», «введено 57 из 58»): меню рисовало
 * overlay правок (menuOverlay), а calculateShoppingList считал по НЕобработанному
 * снепшоту рецепта — добавленные/исключённые/замещённые позиции в закупке и чеке
 * не появлялись (рассинхрон R1 из PLAN).
 *
 * Решение: buildEffectiveIngredients применяет правки к ингредиентам рецепта ДО
 * расчёта. Semantics — паритет с backend MealCompositionService и mock
 * classifyMealEdits:
 *  - EXCLUDE (removed / to=null)  → строка удаляется;
 *  - SCALE (from==to)             → amount × ratio (масштабируется людьми вместе с рецептом);
 *  - SUBST (from→to × ratio)      → количество from переносится на to (строка to
 *                                   создаётся/увеличивается, помечается substitutedFrom);
 *  - EXTRA (added / from=null)    → новая строка с АБСОЛЮТОМ на приём
 *                                   (amountPerServing хранит абсолют — V21/§3),
 *                                   флаг absolute=true отключает масштабирование
 *                                   people/baseServings в расчётах.
 */
import { classifyEdits, editMatchesRecipe, stripSnapshotSuffix, type OverlayEdit } from './menuOverlay';

export interface EffectiveIngredientFlags {
  /** EXTRA-позиция: абсолют на приём, НЕ масштабируется людьми */
  absolute?: boolean;
  /** позиция добавлена пользователем в походе (для бейджей меню) */
  added?: boolean;
  /** имя продукта, который был заменён на этот */
  substitutedFrom?: string;
}

/** Строка ингредиента рецепта (формы mock/real — обе поддерживаются). */
export type RecipeIngredientRow = Record<string, any> & EffectiveIngredientFlags;

const rowKey = (ri: RecipeIngredientRow): string =>
  stripSnapshotSuffix(ri.ingredientId ?? ri.ingredient?.id);

/** Создать строку для продукта, которого нет в базовом рецепте (EXTRA/SUBST-цель). */
function mkRow(id: string, amount: number, name: string, unit: string, flags: EffectiveIngredientFlags): RecipeIngredientRow {
  return {
    ingredientId: id,
    ingredientName: name,
    unit,
    amount,
    ...flags,
    ingredient: { id, name, unit, category: '' },
  };
}

/**
 * Применить правки похода к ингредиентам одного рецепта.
 * Возвращает НОВЫЙ массив (исходный не мутируется).
 */
export function buildEffectiveIngredients(
  ingredients: RecipeIngredientRow[],
  edits: OverlayEdit[],
): RecipeIngredientRow[] {
  if (!edits.length) return ingredients;
  const { extras, excluded, scaleRatios, substitutions } = classifyEdits(edits);

  const out: RecipeIngredientRow[] = ingredients
    .filter(ri => !excluded.has(rowKey(ri)))
    .map(ri => {
      const ratio = scaleRatios.get(rowKey(ri));
      return ratio != null ? { ...ri, amount: Number(ri.amount) * ratio } : { ...ri };
    });

  for (const sub of substitutions) {
    const idx = out.findIndex(ri => rowKey(ri) === sub.from);
    if (idx < 0) continue;
    const src = out[idx];
    const moved = Number(src.amount) * sub.ratio;
    const srcName = src.ingredient?.name ?? src.ingredientName ?? '';
    out.splice(idx, 1);
    const dstIdx = out.findIndex(ri => rowKey(ri) === sub.to);
    if (dstIdx >= 0) {
      out[dstIdx] = {
        ...out[dstIdx],
        amount: Number(out[dstIdx].amount) + moved,
        substitutedFrom: srcName || out[dstIdx].substitutedFrom,
      };
    } else {
      out.push(mkRow(sub.to, moved, sub.toName, sub.toUnit || src.unit || 'PCS', { substitutedFrom: srcName }));
    }
  }

  for (const x of extras) {
    if (out.some(ri => rowKey(ri) === x.to)) continue; // merge-случай: позиция уже в составе
    out.push(mkRow(x.to, x.amount ?? 0, x.name, x.unit || 'PCS', { absolute: true, added: true }));
  }

  return out;
}

/**
 * Карта рецептов с применёнными правками похода — подставляется в
 * calculateShoppingList / calculateDayShopping / calculatePersonSummary вместо
 * сырой карты. Рецепт без правок возвращается как есть (тот же объект).
 */
export function buildEffectiveRecipesMap(
  recipesMap: Map<string, any>,
  edits: OverlayEdit[],
  snapshotOf?: Map<string, string>,
): Map<string, any> {
  if (!edits.length) return recipesMap;
  const out = new Map(recipesMap);
  for (const [rid, recipe] of out) {
    const rEdits = edits.filter(e => editMatchesRecipe(e, String(rid), snapshotOf));
    if (rEdits.length && Array.isArray(recipe?.ingredients)) {
      out.set(rid, { ...recipe, ingredients: buildEffectiveIngredients(recipe.ingredients, rEdits) });
    }
  }
  return out;
}
