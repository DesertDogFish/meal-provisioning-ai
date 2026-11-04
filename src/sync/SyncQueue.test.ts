import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import { db } from '../db/indexedDb';
import { SyncQueue } from '../sync/SyncQueue';

describe('SyncQueue', () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
  });

  it('enqueues and retrieves items', async () => {
    const q = new SyncQueue();
    await q.enqueue({ entityType: 'product', entityId: '1', action: 'create', payload: { name: 'A' } });
    const items = await q.getAll();
    expect(items).toHaveLength(1);
    expect(items[0].entityType).toBe('product');
  });

  it('removes an item', async () => {
    const q = new SyncQueue();
    await q.enqueue({ entityType: 'product', entityId: '1', action: 'create', payload: {} });
    const items = await q.getAll();
    await q.remove(items[0].id);
    const remaining = await q.getAll();
    expect(remaining).toHaveLength(0);
  });
});