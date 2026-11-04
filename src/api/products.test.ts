import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import * as products from './products';

afterEach(() => {
  api.setMode('real');
});

describe('api/products (mock parity)', () => {
  it('getProducts returns array', async () => {
    api.setMode('mock');
    const res = await products.getProducts();
    expect(Array.isArray(res)).toBe(true);
  });

  it('getCategories returns array', async () => {
    api.setMode('mock');
    const res = await products.getCategories();
    expect(Array.isArray(res)).toBe(true);
  });

  it('checkProductName returns duplicate flag', async () => {
    api.setMode('mock');
    const res = await products.checkProductName('Гречка', 'KG');
    expect(res).toHaveProperty('duplicate');
  });

  it('createProduct + deleteProduct roundtrip', async () => {
    api.setMode('mock');
    const cats = await products.getCategories();
    const catId = cats[0]?.id ?? 1;
    const created = await products.createProduct({
      name: 'Тестовый продукт',
      categoryId: catId,
      unit: 'KG',
      packSize: null,
      roundToPacks: false,
      kcalPer100g: null,
      pieceWeightG: null,
      emisCode: null,
    });
    expect(created).toHaveProperty('id');
    await products.deleteProduct(created.id!);
  });
});