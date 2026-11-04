import { db } from '../db/indexedDb';
import type { LocalProduct } from '../db/schema';

import type { IRepository } from './IRepository';

export class OfflineProductRepository implements IRepository<LocalProduct> {
  async getAll(): Promise<LocalProduct[]> {
    return db.products.toArray();
  }
  async getById(id: string): Promise<LocalProduct | undefined> {
    return db.products.get(id);
  }
  async save(item: LocalProduct): Promise<void> {
    await db.products.put(item);
  }
  async delete(id: string): Promise<void> {
    await db.products.delete(id);
  }
  async sync(): Promise<void> {
    // будет реализовано в SyncManager
  }
}