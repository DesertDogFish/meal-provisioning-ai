import { db } from '../db/indexedDb';
import type { LocalRecipe } from '../db/schema';

import type { IRepository } from './IRepository';

export class OfflineRecipeRepository implements IRepository<LocalRecipe> {
  async getAll(): Promise<LocalRecipe[]> { return db.recipes.toArray(); }
  async getById(id: string): Promise<LocalRecipe | undefined> { return db.recipes.get(id); }
  async save(item: LocalRecipe): Promise<void> { await db.recipes.put(item); }
  async delete(id: string): Promise<void> { await db.recipes.delete(id); }
  async sync(): Promise<void> {}
}