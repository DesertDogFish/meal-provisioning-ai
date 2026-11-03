// Схема локальной БД (IndexedDB через Dexie)
export interface LocalProduct {
  id: string;
  name: string;
  unit: string;
  category: string;
  categoryId?: string;
  packSize?: number;
  roundToPacks?: boolean;
  kcalPer100g?: number;
  pieceWeightG?: number;
  enabled?: boolean;
  emisCode?: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface LocalRecipe {
  id: string;
  name: string;
  mealType: string;
  category?: string;
  baseServings: number;
  caloriesPerServing?: number;
  source: string;
  ingredients: { ingredientId: string; amount: number }[];
  tripId?: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface LocalTrip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface SyncQueueItem {
  id: string;
  entityType: 'product' | 'recipe' | 'trip' | 'meal' | 'shopping' | 'checklist';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  timestamp: number;
  retries: number;
  lastError?: string;
}