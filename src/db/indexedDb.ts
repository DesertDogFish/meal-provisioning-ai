import Dexie, { Table } from 'dexie';

import type { LocalProduct, LocalRecipe, LocalTrip, SyncQueueItem } from './schema';

export class ProvisionDB extends Dexie {
  products!: Table<LocalProduct, string>;
  recipes!: Table<LocalRecipe, string>;
  trips!: Table<LocalTrip, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  auth!: Table<{ key: string; accessToken: string; refreshToken: string; savedAt: number }, string>;

  constructor() {
    super('ProvisionDB');
    this.version(1).stores({
      products: 'id, name, category, syncStatus',
      recipes: 'id, name, mealType, tripId, syncStatus',
      trips: 'id, userId, name, syncStatus',
      syncQueue: 'id, entityType, entityId, timestamp',
      auth: 'key',
    });
  }
}

export const db = new ProvisionDB();