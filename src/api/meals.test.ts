import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import * as meals from './meals';

afterEach(() => {
  api.setMode('real');
});

describe('api/meals (mock parity)', () => {
  it('module exports createMeal', () => {
    expect(typeof meals.createMeal).toBe('function');
  });
});