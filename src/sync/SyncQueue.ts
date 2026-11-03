import { db } from '../db/indexedDb';
import type { SyncQueueItem } from '../db/schema';

export class SyncQueue {
  async enqueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retries'>): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      retries: 0,
    };
    await db.syncQueue.add(queueItem);
  }

  async getAll(): Promise<SyncQueueItem[]> {
    return db.syncQueue.orderBy('timestamp').toArray();
  }

  async remove(id: string): Promise<void> {
    await db.syncQueue.delete(id);
  }

  async incrementRetry(id: string, error: string): Promise<void> {
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, { retries: item.retries + 1, lastError: error });
    }
  }
}

export const syncQueue = new SyncQueue();