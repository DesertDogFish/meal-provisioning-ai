/**
 * Патч «UX-список 26.10» (U30): overlay серверных правок состава
 * (`GET /trips/{id}/substitutions`, тип TripIngredientEdit из api/tripEdits)
 * на ингредиенты приёма из клиентского меню.
 *
 * Зачем: меню строится из снепшота рецепта (calculateMenuByDays), а правки
 * «добавил/исключил/заменил/изменил количество» живут на сервере — без overlay
 * карточка приёма выглядела так, будто правки не сохранились.
 *
 * Семантика — паритет с mock `classifyMealEdits` / backend `MealCompositionService`:
 *  - added=true или from=null       → EXTRA: позиция добавлена (абсолют на приём;
 *                                     legacy amountPerServing масштабируется людьми);
 *  - removed=true или to=null       → EXCLUDE: позиция убрана из расчёта;
 *  - from === to                    → SCALE: количество × ratio;
 *  - иначе                          → SUBST: количество from переносится на to × ratio.
 *
 * Id-пространства: правки могут ссылаться на каталожные id ('ing5'), а меню похода —
 * на trip-scoped снепшоты ('ing5::ttrip1' в mock; числовые id-копии в real).
 * Сопоставление — по базовому id (stripSuffix), дополнительно учитывается
 * snapshotOf у trip-рецептов (карта передаётся снаружи).
 */

export interface OverlayIngredient {
  name: string;
  amount: number;
  unit: string;
  ingredientId?: string;
  /** EXTRA-позиция, добавленная пользователем в походе (бейдж «+ добавлено») */
  added?: boolean;
  /** SUBST-получатель: имя исходного продукта (бейдж «замена ← X») */
  substitutedFrom?: string;
}

export interface OverlayEdit {
  id?: string;
  recipeId?: string | null;
  fromIngredientId?: string | null;
  toIngredientId?: string | null;
  amountPerServing?: number | null;
  /** §3: EXTRA — абсолют на приём (хранится напрямую) */
  absoluteAmount?: number | null;
  ratio?: number | null;
  added?: boolean;
  removed?: boolean;
  scale?: boolean;
  fromIngredientName?: string | null;
  toIngredientName?: string | null;
  fromUnit?: string | null;
  toUnit?: string | null;
}

/** Базовый id из trip-scoped формы: 'ing5::ttrip1' → 'ing5'; '42' → '42'. */
export function stripSnapshotSuffix(id: string | null | undefined): string {
  const s = String(id ?? '');
  return s.includes('::t') ? s.split('::t')[0] : s;
}

/**
 * Подходит ли правка рецепту приёма. Учитывает:
 *  - прямое совпадение id;
 *  - совпадение базовых id (mock-снепшоты 'rec1::ttrip1');
 *  - snapshotOf trip-копии (real-режим: числовой id копии → id оригинала).
 */
export function editMatchesRecipe(
  edit: OverlayEdit,
  recipeId: string,
  snapshotOf?: Map<string, string>,
): boolean {
  const er = stripSnapshotSuffix(edit.recipeId);
  if (!er) return false;
  if (er === stripSnapshotSuffix(recipeId)) return true;
  const base = snapshotOf?.get(String(recipeId));
  return base != null && er === stripSnapshotSuffix(base);
}

type Classified = ReturnType<typeof classifyEdits>;

/** Классификация правок (паритет с classifyMealEdits): EXTRA/EXCLUDE/SCALE/SUBST. */
export function classifyEdits(edits: OverlayEdit[]) {
  const extras: Array<{ to: string; amount: number | null; perServing: boolean; name: string; unit: string }> = [];
  const excluded = new Set<string>();
  const scaleRatios = new Map<string, number>();
  const substitutions: Array<{ from: string; to: string; ratio: number; toName: string; toUnit?: string }> = [];
  for (const e of edits) {
    const from = e.fromIngredientId == null ? null : stripSnapshotSuffix(e.fromIngredientId);
    const to = e.toIngredientId == null ? null : stripSnapshotSuffix(e.toIngredientId);
    if (e.added || from == null) {
      if (to == null) continue;
      // §3: absoluteAmount — абсолют на приём; amountPerServing — legacy (× people)
      const amount = e.absoluteAmount != null
        ? Number(e.absoluteAmount)
        : e.amountPerServing != null ? Number(e.amountPerServing) : null;
      extras.push({ to, amount, perServing: e.absoluteAmount == null && e.amountPerServing != null, name: e.toIngredientName || to, unit: e.toUnit || 'PCS' });
    } else if (e.removed || to == null) {
      excluded.add(from);
    } else if (from === to) {
      scaleRatios.set(from, Number(e.ratio ?? 1) || 1);
    } else {
      substitutions.push({ from, to, ratio: Number(e.ratio ?? 1) || 1, toName: e.toIngredientName || to, toUnit: e.toUnit || undefined });
    }
  }
  return { extras, excluded, scaleRatios, substitutions };
}

/**
 * Применить правки к ингредиентам одного приёма.
 * @param ingredients позиции меню (количества уже масштабированы на людей)
 * @param edits       правки ЭТОГО рецепта (отфильтрованные снаружи)
 * @param people      эффективное число людей приёма (для legacy EXTRA per-serving)
 */
export function overlayEditsOnIngredients(
  ingredients: OverlayIngredient[],
  edits: OverlayEdit[],
  people: number,
): OverlayIngredient[] {
  if (!edits.length) return ingredients;
  const { extras, excluded, scaleRatios, substitutions } = classifyEdits(edits) as Classified;

  const keyOf = (i: OverlayIngredient) => stripSnapshotSuffix(i.ingredientId);
  const out: OverlayIngredient[] = ingredients
    .filter(i => !i.ingredientId || !excluded.has(keyOf(i)))
    .map(i => {
      const k = i.ingredientId ? keyOf(i) : null;
      const ratio = k != null ? scaleRatios.get(k) : undefined;
      return ratio != null ? { ...i, amount: i.amount * ratio } : { ...i };
    });

  // SUBST: количество from переносится на to × ratio; from исчезает
  for (const s of substitutions) {
    const srcIdx = out.findIndex(i => keyOf(i) === s.from);
    if (srcIdx < 0) continue;
    const src = out[srcIdx];
    const moved = src.amount * s.ratio;
    out.splice(srcIdx, 1);
    const dstIdx = out.findIndex(i => keyOf(i) === s.to);
    if (dstIdx >= 0) {
      out[dstIdx] = { ...out[dstIdx], amount: out[dstIdx].amount + moved, substitutedFrom: src.name };
    } else {
      out.push({
        name: s.toName,
        amount: moved,
        unit: s.toUnit || src.unit,
        ingredientId: s.to,
        substitutedFrom: src.name,
      });
    }
  }

  // EXTRA: добавленные позиции (абсолют на приём; legacy per-serving × people)
  for (const x of extras) {
    if (out.some(i => keyOf(i) === x.to)) continue; // уже в составе (merge) — не дублируем
    const base = x.amount != null ? x.amount : 0;
    out.push({
      name: x.name,
      amount: x.perServing ? base * people : base,
      unit: x.unit,
      ingredientId: x.to,
      added: true,
    });
  }

  return out;
}
