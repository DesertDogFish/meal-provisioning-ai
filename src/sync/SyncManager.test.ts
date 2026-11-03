import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../db/indexedDb';
import { syncQueue } from '../sync/SyncQueue';
import { syncManager } from '../sync/SyncManager';

// Mock api
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

describe('SyncManager', () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
  });

  it('syncAll does nothing when queue is empty', async () => {
    await expect(syncManager.syncAll()).resolves.toBeUndefined();
  });

  it('syncAll processes queued items', async () => {
    const { api } = await import('../api/client');
    vi.mocked(api.post).mockResolvedValue({} as any);
    await syncQueue.enqueue({ entityType: 'product', entityId: '1', action: 'create', payload: { name: 'A' } });
    await syncManager.syncAll();
    const remaining = await syncQueue.getAll();
    expect(remaining).toHaveLength(0);
  });
});