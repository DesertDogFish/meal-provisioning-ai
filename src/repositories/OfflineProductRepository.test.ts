import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import { db } from '../db/indexedDb';
import { OfflineProductRepository } from '../repositories/OfflineProductRepository';

describe('OfflineProductRepository', () => {
  beforeEach(async () => {
    await db.products.clear();
  });

  it('saves and retrieves a product', async () => {
    const repo = new OfflineProductRepository();
    const product = {
      id: '1',
      name: 'Гречка',
      unit: 'KG',
      category: 'Крупы',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced' as const,
    };
    await repo.save(product);
    const found = await repo.getById('1');
    expect(found?.name).toBe('Гречка');
  });

  it('returns all products', async () => {
    const repo = new OfflineProductRepository();
    await repo.save({ id: '1', name: 'A', unit: 'KG', category: 'C', createdAt: '', updatedAt: '', syncStatus: 'synced' });
    await repo.save({ id: '2', name: 'B', unit: 'KG', category: 'C', createdAt: '', updatedAt: '', syncStatus: 'synced' });
    const all = await repo.getAll();
    expect(all).toHaveLength(2);
  });

  it('deletes a product', async () => {
    const repo = new OfflineProductRepository();
    await repo.save({ id: '1', name: 'A', unit: 'KG', category: 'C', createdAt: '', updatedAt: '', syncStatus: 'synced' });
    await repo.delete('1');
    const found = await repo.getById('1');
    expect(found).toBeUndefined();
  });
});