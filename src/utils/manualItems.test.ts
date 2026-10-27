import { describe, it, expect } from 'vitest';
import { mergeManualIntoShopping, manualForDay, manualForTrip } from './manualItems';
import type { TripManualItem } from '../api/tripManualItems';

const item = (over: Partial<TripManualItem> = {}): TripManualItem => ({
  id: 'mi1',
  tripId: 't1',
  dayId: null,
  ingredientId: 'ing40',
  ingredientName: 'Антисептик для рук',
  unit: 'PCS',
  amount: 1,
  ...over,
});

const row = (over: Partial<{ ingredientId: string; ingredientName: string; unit: string; totalAmount: number; hasPrice: boolean; estimatedCost?: number }> = {}) => ({
  ingredientId: 'ing1',
  ingredientName: 'Гречка',
  unit: 'KG',
  totalAmount: 1.8,
  hasPrice: true,
  estimatedCost: 360,
  ...over,
});

describe('manualItems (U40) — продукты к дню/походу в закупке', () => {
  it('новая позиция добавляется отдельной строкой (manual=true, без цены)', () => {
    const out = mergeManualIntoShopping([row()], [item()]);
    expect(out).toHaveLength(2);
    const m = out[1];
    expect(m.ingredientName).toBe('Антисептик для рук');
    expect(m.totalAmount).toBe(1);
    expect(m.manual).toBe(true);
    expect(m.hasPrice).toBe(false);
  });

  it('тот же продукт — количество суммируется в существующую строку', () => {
    const out = mergeManualIntoShopping(
      [row({ ingredientId: 'ing40', ingredientName: 'Соль', unit: 'KG', totalAmount: 0.01 })],
      [item({ ingredientId: 'ing40', amount: 0.5, unit: 'KG' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].totalAmount).toBeCloseTo(0.51);
  });

  it('trip-scoped id строки и каталожный id позиции совпадают (снепшоты)', () => {
    const out = mergeManualIntoShopping(
      [row({ ingredientId: 'ing40::ttrip1', totalAmount: 0.2 })],
      [item({ ingredientId: 'ing40', amount: 0.3 })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].totalAmount).toBeCloseTo(0.5);
  });

  it('входной массив не мутируется; amount<=0 игнорируется', () => {
    const rows = [row()];
    const out = mergeManualIntoShopping(rows, [item({ amount: 0 })]);
    expect(out).toHaveLength(1);
    expect(rows[0].totalAmount).toBe(1.8);
  });

  it('несколько позиций одного продукта в разных днях — суммируются', () => {
    const out = mergeManualIntoShopping([] as ReturnType<typeof row>[], [
      item({ id: 'a', dayId: 'd1', amount: 1 }),
      item({ id: 'b', dayId: 'd2', amount: 3 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].totalAmount).toBe(4);
  });

  it('manualForDay / manualForTrip — фильтрация по привязке', () => {
    const items = [
      item({ id: 'a', dayId: 'd1' }),
      item({ id: 'b', dayId: 'd2' }),
      item({ id: 'c', dayId: null }),
    ];
    expect(manualForDay(items, 'd1').map(i => i.id)).toEqual(['a']);
    expect(manualForTrip(items).map(i => i.id)).toEqual(['c']);
  });
});

describe('mergeManualIntoShopping c плановой ценой (Fix-5, п.11)', () => {
  const prices = new Map<string, number>([['ing40', 200]]);
  const priceOf = (id: string) => prices.get(id);

  it('новая ручная позиция получает плановую стоимость', () => {
    const out = mergeManualIntoShopping(
      [] as ReturnType<typeof row>[],
      [item({ ingredientId: 'ing40', amount: 2 })],
      priceOf,
    );
    expect(out[0].hasPrice).toBe(true);
    expect(out[0].estimatedCost).toBeCloseTo(400);
  });

  it('цена без справочника — hasPrice=false (честная строка «нет цены»)', () => {
    const out = mergeManualIntoShopping(
      [] as ReturnType<typeof row>[],
      [item({ ingredientId: 'ing99', amount: 1 })],
      priceOf,
    );
    expect(out[0].hasPrice).toBe(false);
    expect(out[0].estimatedCost).toBeUndefined();
  });

  it('при слиянии в существующую строку стоимость доначисляется', () => {
    const out = mergeManualIntoShopping(
      [row({ ingredientId: 'ing40', ingredientName: 'Продукт', unit: 'KG', totalAmount: 1, hasPrice: true, estimatedCost: 200 })],
      [item({ ingredientId: 'ing40', amount: 0.5 })],
      priceOf,
    );
    expect(out).toHaveLength(1);
    expect(out[0].totalAmount).toBeCloseTo(1.5);
    expect(out[0].estimatedCost).toBeCloseTo(300);
  });
});
