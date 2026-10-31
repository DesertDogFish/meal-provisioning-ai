/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.8, вариант A, R3
 * mock-паритет): GET /trips в моке отдаёт ПРОГРЕСС карточки в каждом элементе
 * списка — паритет с backend `TripProgressService` (Java). Цифры прогресса
 * строятся тем же клиентским конвейером `deriveTripView` из серверных данных
 * мока (снепшоты цен/блюд, правки состава, ручные позиции, price-overrides,
 * shopping-exclusions) — юнит-тест паритета сверяет их с deriveTripView напрямую.
 *
 * Чего серверная сторона НЕ знает (и в прогресс не включает): локальный стейдж
 * браузера — отметки «взято» (loadBought), не закоммиченные черновики факт-цен.
 * Клиент (TripsPage) уточняет ими stage (shopping → store) и счётчик «взято».
 *
 * Хелперы tripPricesFor/ingredientEditsFor вынесены сюда из маршрутов mockTrips
 * (GET /trips/:id/prices, GET /trips/:id/ingredient-edits), чтобы прогресс и
 * соответствующие роуты гарантированно отдавали ОДИНАКОВЫЕ данные (без дубля
 * логики, cleanup-п.9).
 */
import { products, recipes, trips, prices, priceOverrides, shoppingExcluded, manualItems, allTripEdits, editRecipeKey, editIngredientKey } from './mockState';
import { deriveTripView } from '../utils/tripDerived';
import type { TripProgressDto } from '../types/tripDetail';

// cleanup-п.9: форма прогресса — общий контракт types/tripDetail (TripProgressDto)
export type MockTripProgress = TripProgressDto;

/**
 * CONTRACT-P1: PUT price-overrides нормализует ключ ('ing1'→'1'), а клиентский
 * пайплайн (deriveTripView) ищет override по ТОЧНОМУ id позиции ('ing1').
 * Денормализуем ключ обратно в id каталога, чтобы серверные чеки в mock-режиме
 * реально матчили позиции (в real-режиме id числовые — helper прозрачен).
 */
export function denormalizeOverrideKey(key: string): string {
  const k = String(key);
  if (products.some(p => p.id === k)) return k;
  const withPrefix = `ing${k}`;
  if (products.some(p => p.id === withPrefix)) return withPrefix;
  return k;
}

/** Trip-scoped срез цен (V20): снепшоты продуктов похода, фолбэк — глобальный срез. */
export function tripPricesFor(tripId: string): any[] {
  const snapIds = new Set(products.filter(p => (p as any).tripId === tripId).map(p => p.id));
  const rows = snapIds.size === 0
    ? prices.filter(pr => products.find(p => p.id === pr.ingredientId && !(p as any).tripId))
    : prices.filter(pr => snapIds.has(pr.ingredientId));
  const latestByIng = new Map<string, any>();
  for (const pr of rows) {
    const cur = latestByIng.get(pr.ingredientId);
    if (!cur || pr.effectiveFrom >= cur.effectiveFrom) latestByIng.set(pr.ingredientId, pr);
  }
  return [...latestByIng.values()];
}

/** Паритет backend TripIngredientEditResponse: правки состава с именами/единицами. */
export function ingredientEditsFor(tripId: string): any[] {
  const nameOf = (id: string | null): { name: string | null; unit: string | null } => {
    if (id == null) return { name: null, unit: null };
    const pr = products.find(x => x.id === String(id))
      ?? products.find(x => x.id === editIngredientKey(id));
    return { name: pr?.name ?? null, unit: pr?.unit ?? null };
  };
  return allTripEdits(tripId).map((sub) => {
    const from = nameOf(sub.fromIngredientId);
    const to = nameOf(sub.toIngredientId);
    const rec = recipes.find(r => editRecipeKey(r.id) === editRecipeKey(sub.recipeId));
    return {
      ...sub,
      recipeName: rec?.name ?? null,
      fromIngredientName: from.name,
      toIngredientName: to.name,
      fromUnit: from.unit,
      toUnit: to.unit,
    };
  });
}

/** Прогресс карточки похода — из серверных данных мока (best effort, как backend). */
export function buildTripProgress(trip: any): MockTripProgress | null {
  try {
    const tripRecipes = recipes.filter((r: any) => (r as any).tripId === trip.id);
    const globalRecipes = recipes.filter((r: any) => !(r as any).tripId);
    const recipesMap = new Map<string, any>(
      [...globalRecipes, ...tripRecipes].map((r: any) => [String(r.id), r]),
    );
    const draftOverrides: Record<string, { price: number; total: number }> = {};
    for (const [ingId, ov] of Object.entries(priceOverrides[trip.id] ?? {})) {
      draftOverrides[denormalizeOverrideKey(String(ingId))] = { price: (ov as any).actualPrice, total: 0 };
    }
    const view = deriveTripView({
      trip: trip as any,
      recipes: globalRecipes as any,
      tripRecipes: tripRecipes as any,
      recipesMap: recipesMap as any,
      tripEdits: ingredientEditsFor(trip.id) as any,
      prices: tripPricesFor(trip.id) as any,
      manualItems: (manualItems[trip.id] ?? []) as any,
      products: [],
      draftOverrides,
      shoppingExcluded: new Set<string>(shoppingExcluded[trip.id] ?? []),
      // «взято» живёт в localStorage клиента — серверная сторона его не видит
      checklistBought: new Set<string>(),
      sortSpec: { field: 'ingredientName', dir: 'asc' },
    });
    const meals = (trip.days ?? []).reduce((a: number, d: any) => a + (d.meals?.length ?? 0), 0);
    const checklistTotal = view.checklistRowIds.length;
    const facts = view.factCount;
    return {
      stage: facts > 0 ? 'checks' : checklistTotal > 0 ? 'shopping' : 'menu',
      meals,
      checklistTotal,
      facts,
      factsTotal: view.factsTotal,
      totalCost: view.tripSummary.totalCost,
      costPerPerson: view.tripSummary.costPerDefaultPerson,
    };
  } catch (e) {
    // best effort: карточка без строки этапа лучше, чем упавший список (паритет backend)
    console.warn('mock trip progress failed:', e);
    return null;
  }
}

/** GET /trips — список с прогрессом (один запрос вместо N+1 на клиенте). */
export function tripsWithProgress(): any[] {
  return trips.map(t => ({ ...t, progress: buildTripProgress(t) }));
}
