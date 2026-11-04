/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * снапшоты строк для trips: latestPerIngredient, snapProductForTrip, snapRecipeForTrip.
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import type { Ingredient, Recipe, IngredientPrice } from '../types';

import { products, recipes, prices } from './mockState';

  // Походы
  // V20 (mock-паритет): copy-on-write снепшоты каталога для похода.
  // Идентификаторы копий детерминированные: `${origId}::t${tripId}` — findOrCreate идемпотентен.

export function latestPerIngredientImpl(rows: IngredientPrice[]): IngredientPrice[] {
  const latest = new Map<string, IngredientPrice>();
  for (const pr of rows) {
    const cur = latest.get(pr.ingredientId);
    if (!cur || pr.effectiveFrom >= cur.effectiveFrom) latest.set(pr.ingredientId, pr);
  }
  return [...latest.values()];
}

export function snapProductForTripImpl(tripId: string, p: Ingredient): Ingredient {
  const id = `${p.id}::t${tripId}`;
  let copy: Ingredient | undefined = products.find(x => x.id === id);
  if (!copy) {
    copy = { ...p, id, tripId, snapshotOf: p.id, code: undefined };
    products.push(copy as Ingredient);
    const latest = prices
      .filter(pr => pr.ingredientId === p.id)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    if (latest) {
      prices.push({ ...latest, id: `pr_${id}`, ingredientId: id });
    }
  }
  return copy as Ingredient;
}

export function snapRecipeForTripImpl(srv: { snapProductForTrip: (tripId: string, p: Ingredient) => Ingredient }, tripId: string, r: Recipe): Recipe {
  const id = `${r.id}::t${tripId}`;
  let copy: Recipe | undefined = recipes.find(x => x.id === id);
  if (!copy) {
    copy = {
      ...r,
      id,
      tripId,
      snapshotOf: r.id,
      ingredients: (r.ingredients || []).map((ri: Recipe['ingredients'][number]) => {
        const gp = products.find(p => p.id === ri.ingredientId);
        const sp = gp ? srv.snapProductForTrip(tripId, gp) : null;
        return { ingredientId: sp ? sp.id : ri.ingredientId, amount: ri.amount };
      }),
    };
    recipes.push(copy as Recipe);
  }
  return copy as Recipe;
}
