/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.6): единый загрузчик
 * данных похода. Проверяем склейку источников (R3 mock-parity): серверные
 * оверрайды факт-цен, union локальных и серверных исключений, локальные
 * черновики ПОВЕРХ серверных оверрайдов, фасовка/категории из /admin/products.
 */

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async (url: string) => {
      if (url === '/trips/t1') return tripFixture;
      if (url === '/trips/t1/prices') return pricesFixture;
      if (url === '/admin/products') return { content: [
        { id: 'i1', name: 'Гречка', unit: 'KG', packSize: 0.9, roundToPacks: true, categoryName: 'Крупы' },
      ] };
      if (url === '/trips/t1/price-overrides') return [
        { ingredientId: 'i1', actualPrice: 90 },
        { ingredientId: 'i2', actualPrice: 55 },
      ];
      throw new Error(`unexpected url ${url}`);
    }),
  },
  getRecipes: vi.fn(async () => recipesFixture),
  getTripRecipes: vi.fn(async () => []),
}));
vi.mock('../api/tripEdits', () => ({ getTripEdits: vi.fn(async () => []) }));
vi.mock('../api/tripManualItems', () => ({ getManualItems: vi.fn(async () => []) }));
vi.mock('../api/shoppingExclusions', () => ({ getServerExclusions: vi.fn(async () => ['i2']) }));
vi.mock('./tripStaging', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./tripStaging')>();
  return {
    ...orig,
    loadExcluded: vi.fn(() => new Set<string>(['i3'])),
    loadActualPrices: vi.fn(() => ({ i1: { price: 120, total: 0 } })),
    loadBought: vi.fn(() => new Set<string>(['i1@1000'])),
  };
});

import { loadTripBundle, bundleToViewInput, loadTripView } from './tripLoader';

const tripFixture = {
  id: 't1', userId: 'u1', name: 'Тестовый поход',
  startDate: '2026-07-01', endDate: '2026-07-02', defaultPeople: 2,
  days: [
    { id: 'd1', tripId: 't1', dayDate: '2026-07-01', meals: [
      { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r1', sortOrder: 1 },
    ] },
    { id: 'd2', tripId: 't1', dayDate: '2026-07-02', meals: [
      { id: 'm2', tripDayId: 'd2', mealType: 'DINNER', recipeId: 'r2', sortOrder: 1 },
    ] },
  ],
} as never;

const recipesFixture = [
  { id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
    { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG' } },
  ] },
  { id: 'r2', name: 'Тушёнка', mealType: 'DINNER', baseServings: 2, ingredients: [
    { ingredientId: 'i2', amount: 1, ingredient: { id: 'i2', name: 'Тушёнка', unit: 'PCS' } },
  ] },
] as never;

const pricesFixture = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
  { id: 'p2', ingredientId: 'i2', pricePerUnit: 50, currency: 'RUB', effectiveFrom: '2026-06-01' },
] as never;

beforeEach(() => { vi.clearAllMocks(); });

describe('loadTripBundle', () => {
  it('серверные оверрайды факт-цен — в бандле; продукты с категорией; без withProducts продуктов нет', async () => {
    const b = await loadTripBundle('t1', { withProducts: true });
    expect(b.trip).toBe(tripFixture);
    expect(b.serverOverrides).toEqual({
      i1: { price: 90, total: 0 },
      i2: { price: 55, total: 0 },
    });
    expect(b.products).toHaveLength(1);
    expect(b.products[0]).toMatchObject({ id: 'i1', category: 'Крупы', packSize: 0.9 });

    const b2 = await loadTripBundle('t1');
    expect(b2.products).toEqual([]);
  });

  it('опциональные источники падают best-effort (сбой price-overrides не рвёт загрузку)', async () => {
    const { api } = await import('../api/client');
    const getMock = api.get as ReturnType<typeof vi.fn>;
    const original = getMock.getMockImplementation();
    getMock.mockImplementation(async (url: string) => {
      if (url === '/trips/t1') return tripFixture;
      if (url === '/trips/t1/prices') return pricesFixture;
      throw new Error('503'); // остальное недоступно
    });
    try {
      const b = await loadTripBundle('t1', { withProducts: true });
      expect(b.serverOverrides).toEqual({});
      expect(b.products).toEqual([]);
      expect(b.tripEdits).toEqual([]);
      expect(b.manualItems).toEqual([]);
    } finally {
      getMock.mockImplementation(original!);
    }
  });
});

describe('bundleToViewInput', () => {
  it('исключения — union локального стейджа и сервера; черновики факт-цен поверх серверных', async () => {
    const b = await loadTripBundle('t1', { withProducts: true });
    const input = await bundleToViewInput(b, 't1');
    expect([...input.shoppingExcluded].sort()).toEqual(['i2', 'i3']); // сервер i2 + локальный i3
    // локальный черновик i1=120 ПОКРЫВАЕТ серверный override i1=90; серверный i2=55 сохраняется
    expect(input.draftOverrides).toEqual({
      i1: { price: 120, total: 0 },
      i2: { price: 55, total: 0 },
    });
    expect([...input.checklistBought]).toEqual(['i1@1000']);
    expect(input.recipesMap.get('r1')).toBe(recipesFixture[0]);
  });
});

describe('loadTripView', () => {
  it('view считается из склеенных источников: локальный чек 120 побеждает серверный 90', async () => {
    const { trip, view } = await loadTripView('t1');
    expect(trip).toBe(tripFixture);
    // Гречка: локальный черновик 120 ₽/кг × 1 кг; Тушёнка исключена (сервер)
    expect(view.shoppingTotalFinal).toBe(120);
    const buckwheat = view.visibleShopping.find(r => r.ingredientName === 'Гречка')!;
    expect(buckwheat.actualUnitPrice).toBe(120);
    const stew = view.visibleShopping.find(r => r.ingredientName === 'Тушёнка')!;
    expect(stew.excluded).toBe(true);
  });
});
