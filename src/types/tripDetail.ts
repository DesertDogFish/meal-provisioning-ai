/**
 * Подзадача 26 аудита (2026-10-29): типы страницы похода, вынесенные из
 * `TripDetailPage.tsx` (R8/R9) — их используют страница, хук `useTripDetail`
 * и компоненты `TripActions`/`TripSummaryPanel`/`TripDaysList`/`TripMealCard`/
 * `TripShoppingTab`/`TripDayShoppingTab`/`TripPersonTab`.
 *
 * Формы сущностей — СТРУКТУРНЫЕ (страница исторически читает их через
 * `api.get<Trip>` и передаёт в калькуляторы через `as any`): глобальные
 * `types/index.ts` строже (createdAt и т.п.), поэтому здесь сохранён прежний
 * локальный контракт страницы без изменений.
 */
import type { MealType } from './index';

export interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  days?: TripDay[];
}

export interface TripDay {
  id: string;
  tripId: string;
  dayDate: string;
  peopleOverride?: number;
  meals?: TripMeal[];
}

export interface TripMeal {
  id: string;
  tripDayId: string;
  mealType: MealType;
  recipeId: string;
  recipe?: any;
  peopleOverride?: number;
  sortOrder: number;
}

export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  baseServings: number;
  caloriesPerServing?: number;
  ingredients: any[];
}

export interface Price {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
}

/** Вкладки страницы похода. */
/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 2): 6 равноправных
 * вкладок заменены 4 этапами воркфлоу «Меню → Закупка → Магазин → Чеки и итог».
 * Прежние «Закупка по дням» и «На человека» — виды списка внутри этапа
 * «Закупка» (`ShoppingView`), «Чеклист» стал этапом «Магазин» (store),
 * «Закупка и чеки» — этапом «Чеки» (checks). Старые значения в URL
 * (?stage=dayShopping и т.п.) разбирает `parseStage` в StageTabBar.
 */
export type TabType = 'menu' | 'shopping' | 'store' | 'checks';

/** Виды списка закупки внутри этапа ② (подзадача 3): состояние локальное. */
export type ShoppingView = 'total' | 'days' | 'person';

/** U26: поле сортировки таблицы «Закупка на поход». */
export type ShoppingSortField = 'ingredientName' | 'totalAmount' | 'effectiveCost';
