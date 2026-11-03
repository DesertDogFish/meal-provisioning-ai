import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import * as recipes from './recipes';

afterEach(() => {
  api.setMode('real');
});

describe('api/recipes (mock parity)', () => {
  it('loadMenuTrips returns array', async () => {
    api.setMode('mock');
    const res = await recipes.loadMenuTrips();
    expect(Array.isArray(res)).toBe(true);
  });
});