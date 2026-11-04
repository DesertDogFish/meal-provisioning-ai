import { api, normalizeRecipe } from '../api/client';
import type { Recipe } from '../types';
import type { LocalRecipe } from '../db/schema';

import type { IRepository } from './IRepository';

export class OnlineRecipeRepository implements IRepository<LocalRecipe> {
  async getAll(): Promise<LocalRecipe[]> {
    const data = await api.get<Recipe[]>('/recipes');
    const recipes = Array.isArray(data) ? data.map(normalizeRecipe) : [];
    return recipes.map((r) => ({
      id: r.id,
      name: r.name,
      mealType: r.mealType,
      category: r.category,
      baseServings: r.baseServings,
      caloriesPerServing: r.caloriesPerServing,
      source: r.source,
      ingredients: (r.ingredients ?? []).map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount })),
      tripId: r.tripId,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
      syncStatus: 'synced',
    }));
  }
  async getById(id: string): Promise<LocalRecipe | undefined> {
    const data = await api.get<Recipe>(`/recipes/${id}`);
    if (!data) return undefined;
    const r = normalizeRecipe(data);
    return {
      id: r.id,
      name: r.name,
      mealType: r.mealType,
      category: r.category,
      baseServings: r.baseServings,
      caloriesPerServing: r.caloriesPerServing,
      source: r.source,
      ingredients: (r.ingredients ?? []).map((ri) => ({ ingredientId: ri.ingredientId, amount: ri.amount })),
      tripId: r.tripId,
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
      syncStatus: 'synced',
    };
  }
  async save(item: LocalRecipe): Promise<void> {
    await api.put(`/admin/recipes/${item.id}`, item);
  }
  async delete(id: string): Promise<void> {
    await api.del(`/admin/recipes/${id}`);
  }
  async sync(): Promise<void> {}
}