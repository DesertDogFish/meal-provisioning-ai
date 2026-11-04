import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import * as recipeEditor from './recipeEditor';

afterEach(() => {
  api.setMode('real');
});

describe('api/recipeEditor (mock parity)', () => {
  it('module exports functions', () => {
    expect(typeof recipeEditor.updateRecipe).toBe('function');
    expect(typeof recipeEditor.createRecipe).toBe('function');
  });
});