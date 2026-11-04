import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import * as freeProduct from './freeProduct';

afterEach(() => {
  api.setMode('real');
});

describe('api/freeProduct (mock parity)', () => {
  it('createFreeProduct returns id', async () => {
    api.setMode('mock');
    const cats = await (await import('./products')).getCategories();
    const catId = cats[0]?.id ?? 1;
    const res = await freeProduct.createFreeProduct({ name: 'Free продукт', unit: 'KG', categoryId: catId });
    expect(res).toHaveProperty('id');
  });
});