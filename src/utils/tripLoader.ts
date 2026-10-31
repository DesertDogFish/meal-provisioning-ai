/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.6): ЕДИНЫЙ загрузчик
 * данных похода. Раньше свой Promise.all из 6–7 запросов был у страницы похода
 * (useTripDetail), у отчёта (TripReportPage), у печати (TripPrintPage) и у
 * этапа ④ (PriceOverridesTab) — четыре параллельных пайплайна с расходящимися
 * деталями (печать считала сырыми калькуляторами, отчёт не знал серверных
 * оверрайдов). Теперь один модуль, три потребителя:
 *
 *   loadTripBundle(tripId, { withProducts }) — сырой набор (запросы);
 *   loadTripView(tripId, opts)               — набор + deriveTripView
 *                                              (стейдж фактов/исключений/отметок
 *                                              поверх серверных оверрайдов).
 *
 * Расхождения print-расчётов и deriveTripView устранены в пользу deriveTripView
 * (критерий п.6; печать больше не считает сырыми calculateMenuByDays/…).
 */
import { api, getRecipes, getTripRecipes } from '../api/client';
import { getManualItems, type TripManualItem } from '../api/tripManualItems';
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits';
import { getServerExclusions } from '../api/shoppingExclusions';
import { loadActualPrices, loadExcluded, loadBought, type ActualPriceDraft } from './tripStaging';
import { categoryName } from './format';
import { deriveTripView, type TripView, type TripViewInput } from './tripDerived';
import type { Trip, Recipe, Price } from '../types/tripDetail';

export interface TripBundle {
  trip: Trip;
  recipes: Recipe[];
  /** V20: trip-scoped копии блюд (снепшоты) */
  tripRecipes: Recipe[];
  /** V20: цены конкретного похода (замороженный план) */
  prices: Price[];
  /** U30: серверные правки состава */
  tripEdits: TripIngredientEdit[];
  /** U40: ручные позиции (к дню и к походу) */
  manualItems: TripManualItem[];
  /** U38/U40: справочник продуктов (фасовка/категории); пусто без withProducts */
  products: any[];
  /** серверные факт-цены (чек, введённый в другой сессии) — фолбэк стейджа */
  serverOverrides: Record<string, ActualPriceDraft>;
}

export interface LoadTripOptions {
  /** нужен ли справочник /admin/products (фасовка/категории чеклиста).
   * Страница похода и печать — да; in-app отчёт — нет (не-админ не имеет доступа). */
  withProducts?: boolean;
}

/** Все запросы данных похода — одним пакетом (best effort для опциональных). */
export async function loadTripBundle(tripId: string, opts: LoadTripOptions = {}): Promise<TripBundle> {
  const [trip, recipes, prices, tripRecipes, tripEdits, manualItems, productsData, serverOvs] = await Promise.all([
    api.get<Trip>(`/trips/${tripId}`),
    getRecipes(),
    // V20: цены КОНКРЕТНОГО похода (trip-scoped копии продуктов)
    api.get<Price[]>(`/trips/${tripId}/prices`),
    // V20 + Release-1.0: копии блюд через getTripRecipes (нормализация плоских DTO)
    getTripRecipes(String(tripId)).catch(() => [] as Recipe[]),
    getTripEdits(String(tripId)).catch(() => [] as TripIngredientEdit[]),
    getManualItems(String(tripId)).catch(() => [] as TripManualItem[]),
    opts.withProducts
      ? api.get<any>('/admin/products', { params: { size: '1000' } }).catch(() => null)
      : Promise.resolve(null),
    // cleanup-п.5/п.6: серверные оверрайды факт-цен — часть единого пайплайна
    api.get<Array<{ ingredientId: string; actualPrice: number }>>(`/trips/${tripId}/price-overrides`)
      .catch(() => [] as Array<{ ingredientId: string; actualPrice: number }>),
  ]);

  const prodList = Array.isArray(productsData) ? productsData : ((productsData as any)?.content ?? []);
  const products = (prodList as any[]).map((p: any) => ({ ...p, category: categoryName(p) }));
  const serverOverrides: Record<string, ActualPriceDraft> = Object.fromEntries(
    (serverOvs || []).map(o => [String(o.ingredientId), { price: o.actualPrice, total: 0 } as ActualPriceDraft]),
  );

  return { trip, recipes, tripRecipes, prices, tripEdits, manualItems, products, serverOverrides };
}

/** Вход deriveTripView из бандла + клиентский стейдж (факты/исключения/отметки). */
export async function bundleToViewInput(b: TripBundle, tripId: string): Promise<TripViewInput> {
  const key = String(tripId);
  const recipesMap = new Map<string, Recipe>(
    [...b.recipes, ...b.tripRecipes].map(r => [String(r.id), r]),
  );
  // Исключения: локальный стейдж + серверный набор (union — как на странице похода,
  // Fix-3/R2: сервер — источник истины для глобальных ключей).
  const excluded = new Set<string>(loadExcluded(key));
  try {
    for (const k of await getServerExclusions(key)) excluded.add(k);
  } catch { /* best effort: локальный стейдж остаётся источником */ }
  // Факт-цены: локальные черновики поверх серверных оверрайдов (единый источник ②/④/отчёт).
  const draftOverrides = { ...b.serverOverrides, ...loadActualPrices(key) };
  return {
    trip: b.trip,
    recipes: b.recipes,
    tripRecipes: b.tripRecipes,
    recipesMap,
    tripEdits: b.tripEdits,
    prices: b.prices,
    manualItems: b.manualItems,
    products: b.products,
    draftOverrides,
    shoppingExcluded: excluded,
    checklistBought: loadBought(key),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
  };
}

/** Бандл + готовая view-модель — для отчёта и печати (одинаковые суммы с ②/④). */
export async function loadTripView(
  tripId: string,
  opts: LoadTripOptions = {},
): Promise<{ trip: Trip; view: TripView }> {
  const bundle = await loadTripBundle(tripId, opts);
  const input = await bundleToViewInput(bundle, tripId);
  return { trip: bundle.trip, view: deriveTripView(input) };
}
