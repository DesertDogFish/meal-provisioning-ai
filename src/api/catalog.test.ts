import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import * as catalog from './catalog';

afterEach(() => {
  api.setMode('real');
});

describe('api/catalog (mock parity)', () => {
  it('getStagingRecipes returns array', async () => {
    api.setMode('mock');
    const res = await catalog.getStagingRecipes();
    expect(Array.isArray(res)).toBe(true);
  });

  it('getEmisProducts returns array', async () => {
    api.setMode('mock');
    const res = await catalog.getEmisProducts();
    expect(Array.isArray(res)).toBe(true);
  });
});