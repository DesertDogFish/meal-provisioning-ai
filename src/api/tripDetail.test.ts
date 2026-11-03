import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import * as tripDetail from './tripDetail';

afterEach(() => {
  api.setMode('real');
});

describe('api/tripDetail (mock parity)', () => {
  it('module exports functions', () => {
    expect(typeof tripDetail.deleteMeal).toBe('function');
    expect(typeof tripDetail.updateDay).toBe('function');
    expect(typeof tripDetail.updatePriceOverride).toBe('function');
  });
});