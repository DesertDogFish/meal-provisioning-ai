import Dexie, { Table } from 'dexie';
import type { LocalProduct, LocalRecipe, LocalTrip, SyncQueueItem } from './schema';

export class ProvisionDB extends Dexie {
  products!: Table<LocalProduct, string>;
  recipes!: Table<LocalRecipe, string>;
  trips!: Table<LocalTrip, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('ProvisionDB');
    this.version(1).stores({
      products: 'id, name, category, syncStatus',
      recipes: 'id, name, mealType, tripId, syncStatus',
      trips: 'id, userId, name, syncStatus',
      syncQueue: 'id, entityType, entityId, timestamp',
    });
  }
}

export const db = new ProvisionDB();