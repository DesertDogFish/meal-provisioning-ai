export type UserRole = 'USER' | 'ADMIN';
export type UnitOfMeasure = 'KG' | 'L' | 'PCS';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type RecipeSource = 'MANUAL' | 'API' | 'AI';
export type StagingStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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

export interface Ingredient {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  category: string;
  caloriesPerUnit?: number;
  createdAt: string;
}

export interface IngredientPrice {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  ingredient?: Ingredient;
  amount: number;
}

export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
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
    ingredients: { name: string; amount: number; unit: UnitOfMeasure }[];
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
