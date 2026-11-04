import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

import { db } from './indexedDb';

describe('indexedDb (ProvisionDB)', () => {
  it('has all required tables', () => {
    expect(db.products).toBeDefined();
    expect(db.recipes).toBeDefined();
    expect(db.trips).toBeDefined();
    expect(db.syncQueue).toBeDefined();
    expect(db.auth).toBeDefined();
  });

  it('db name is ProvisionDB', () => {
    expect(db.name).toBe('ProvisionDB');
  });
});