/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * снапшоты строк для trips: latestPerIngredient, snapProductForTrip, snapRecipeForTrip.
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import { products, recipes, prices } from './mockState';

  // Походы
  // V20 (mock-паритет): copy-on-write снепшоты каталога для похода.
  // Идентификаторы копий детерминированные: `${origId}::t${tripId}` — findOrCreate идемпотентен.

export function latestPerIngredientImpl(rows: any[]): any[] {
  const latest = new Map<string, any>();
  for (const pr of rows) {
    const cur = latest.get(pr.ingredientId);
    if (!cur || pr.effectiveFrom >= cur.effectiveFrom) latest.set(pr.ingredientId, pr);
  }
  return [...latest.values()];
}

export function snapProductForTripImpl(tripId: string, p: any): any {
  const id = `${p.id}::t${tripId}`;
  let copy: any = products.find(x => x.id === id);
  if (!copy) {
    copy = { ...p, id, tripId, snapshotOf: p.id, code: null };
    products.push(copy);
    const latest = prices
      .filter(pr => pr.ingredientId === p.id)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
    if (latest) {
      prices.push({ ...latest, id: `pr_${id}`, ingredientId: id });
    }
  }
  return copy;
}

export function snapRecipeForTripImpl(srv: any, tripId: string, r: any): any {
  const id = `${r.id}::t${tripId}`;
  let copy: any = recipes.find(x => x.id === id);
  if (!copy) {
    copy = {
      ...r,
      id,
      tripId,
      snapshotOf: r.id,
      ingredients: (r.ingredients || []).map((ri: any) => {
        const gp = products.find(p => p.id === ri.ingredientId);
        const sp = gp ? srv.snapProductForTrip(tripId, gp) : null;
        return { ingredientId: sp ? sp.id : ri.ingredientId, amount: ri.amount };
      }),
    };
    recipes.push(copy);
  }
  return copy;
}
