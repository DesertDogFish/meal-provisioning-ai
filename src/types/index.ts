export type UserRole = 'USER' | 'ADMIN';
export type UnitOfMeasure = 'KG' | 'L' | 'PCS' | 'PACK';

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  KG: 'кг',
  L: 'л',
  PCS: 'шт',
  PACK: 'уп'
};
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
// Источник рецепта/цены — как enum RecipeSource бэкенда (V28: значение 'OFF'
// удалено вместе с провайдером Open Food Facts, legacy-строки переведены в MANUAL).
export type RecipeSource = 'MANUAL' | 'ROSSTAT' | 'API' | 'AI';
export type StagingStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Статус синхронизации цены продукта (ProductResponse.priceSyncStatus, V26):
 * NOT_LINKED — источник цены не выбран, цену ведёт человек;
 * NO_DATA — привязан к позиции ЕМИСС, но в локальной копии нет её цен;
 * SYNCED — привязан, действующая цена получена из локальной копии ЕМИСС.
 */
export type PriceSyncStatus = 'NOT_LINKED' | 'NO_DATA' | 'SYNCED';

/** Позиция локального справочника ЕМИСС (EmisProductDto) — результат поиска при привязке. */
export interface EmisProduct {
  code: string;
  name: string;
  /** Суффикс единицы наблюдения («кг», «25 пакетиков», «100 мл»); null — единица не распознана. */
  unitLabel: string | null;
  /** Самая свежая цена позиции по региону приложения; null — цен в копии нет. */
  latestPrice: number | null;
  /** Первый день месяца самой свежей цены (yyyy-MM-dd); null — цен нет. */
  latestPriceDate: string | null;
  /**
   * KB-5: {@code latestPrice}, пересчитанная на единицу продукта (бэкенд, EmisUnit.pricePerUnit).
   * Заполняется, только если поиск шёл с контекстом продукта (unit/pieceWeightG/price);
   * null — пересчёт невозможен, синхронизация такую точку отбросит.
   */
  pricePerUnit?: number | null;
  /**
   * KB-5: предупреждение о сомнительной паре (единицы не приводятся, масштаб не сопоставим,
   * цена уехала на порядок). Привязку НЕ блокирует — решение за админом.
   */
  warning?: string | null;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface Ingredient {
  id: string;
  /** V20: trip-scoped копия продукта; undefined/null = глобальный справочник */
  tripId?: string | null;
  snapshotOf?: string | null;
  name: string;
  unit: UnitOfMeasure;
  unitLabel?: string;
  category: string;
  categoryId?: string;
  code?: string;
  packSize?: number;
  roundToPacks?: boolean;
  kcalPer100g?: number;
  pieceWeightG?: number;
  /** FIX: отключённые продукты (enabled=false) исключаются из меню/закупки/чеков. undefined = включён. */
  enabled?: boolean;
  /**
   * V26: софт-привязка к позиции локального справочника ЕМИСС — декларативный
   * «источник цены». null/undefined = цену ведёт человек.
   */
  emisCode?: string | null;
  /** Название привязанной позиции ЕМИСС (из локальной копии). */
  emisName?: string | null;
  /** Синхронизирована ли цена из ЕМИСС (см. PriceSyncStatus). */
  priceSyncStatus?: PriceSyncStatus;
  createdAt: string;
}

export interface IngredientPrice {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
  /** MANUAL — ввёл человек; ROSSTAT — применила синхронизация ЕМИСС; API — машинный источник. */
  source?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  ingredient?: Ingredient;
  amount: number;
  /** CONTRACT-P1 (PLAN.md, Backlog P1 п.1): id замещаемого продукта (SubstitutionModal) */
  substitutedFrom?: string;
}

export interface Recipe {
  id: string;
  name: string;
  /** V20: trip-scoped снепшот (копия для похода); undefined/null = глобальный справочник */
  tripId?: string | null;
  snapshotOf?: string | null;
  mealType: MealType;
  category?: string;
  cookMinutes?: number;
  baseServings: number;
  caloriesPerServing?: number;
  source: RecipeSource;
  ingredients: RecipeIngredient[];
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  createdAt: string;
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
  recipe?: Recipe;
  peopleOverride?: number;
  sortOrder: number;
}

export interface StagingRecipe {
  id: string;
  source: RecipeSource;
  rawPayload: Record<string, unknown>;
  status: StagingStatus;
  suggestedName?: string;
  suggestedMealType?: MealType;
  suggestedIngredients?: StagingIngredient[];
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface StagingIngredient {
  externalName: string;
  amount: number;
  unit: UnitOfMeasure;
  mappedIngredientId?: string;
}

export interface IngredientMapping {
  id: string;
  externalName: string;
  source: RecipeSource;
  internalIngredientId: string;
}

export interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  totalAmount: number;
  estimatedCost?: number;
  hasPrice: boolean;
}

export interface DayShopping {
  dayDate: string;
  items: ShoppingItem[];
  dayCost: number;
  hasMissingPrices: boolean;
}

export interface MenuDay {
  dayDate: string;
  effectivePeople: number;
  meals: {
    mealType: MealType;
    recipeName: string;
    servings: number;
    /** U30: id блюда приёма — для сопоставления серверных правок состава */
    recipeId?: string;
    ingredients: {
      name: string;
      amount: number;
      unit: UnitOfMeasure;
      ingredientId?: string;
      /** U30: позиция добавлена пользователем в походе (EXTRA-правка) */
      added?: boolean;
      /** U30: позиция — получатель замены (имя исходного продукта) */
      substitutedFrom?: string;
    }[];
  }[];
}

export interface PersonSummary {
  ingredientName: string;
  unit: UnitOfMeasure;
  amountPerDefaultPerson: number;
  amountPerPersonMeal: number;
  costPerDefaultPerson?: number;
  costPerPersonMeal?: number;
}

export interface TripSummary {
  totalCost: number;
  hasMissingPrices: boolean;
  missingIngredients: string[];
  totalPersonMeals: number;
  costPerDefaultPerson: number;
  costPerPersonMeal: number;
  caloriesPerPersonMeal?: number;
}
