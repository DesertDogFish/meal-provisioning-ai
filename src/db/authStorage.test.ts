import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import { db } from '../db/indexedDb';
import { saveTokens, getTokens, clearTokens } from '../db/authStorage';

describe('authStorage', () => {
  beforeEach(async () => {
    await db.table('auth').clear();
  });

  it('saves and retrieves tokens', async () => {
    await saveTokens('access123', 'refresh456');
    const tokens = await getTokens();
    expect(tokens?.accessToken).toBe('access123');
    expect(tokens?.refreshToken).toBe('refresh456');
  });

  it('returns null when no tokens', async () => {
    const tokens = await getTokens();
    expect(tokens).toBeNull();
  });

  it('clears tokens', async () => {
    await saveTokens('a', 'r');
    await clearTokens();
    const tokens = await getTokens();
    expect(tokens).toBeNull();
  });
});