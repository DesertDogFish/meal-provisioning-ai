import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import * as trips from './trips';

afterEach(() => {
  api.setMode('real');
});

describe('api/trips (mock parity)', () => {
  it('loadTrips returns array', async () => {
    api.setMode('mock');
    const res = await trips.loadTrips();
    expect(Array.isArray(res)).toBe(true);
  });
});