import { describe, it, expect } from 'vitest';
import { compareRu, compareNumAsc, sortRows, nextDir } from './rowSort';

describe('rowSort (U26–U28, U41) — компараторы и сортировка строк', () => {
  it('compareRu: алфавитный порядок по-русски, регистронезависимо', () => {
    expect(compareRu('арбуз', 'Банан')).toBeLessThan(0);
    expect(compareRu('Банан', 'арбуз')).toBeGreaterThan(0);
    expect(compareRu('Соль', 'соль')).toBe(0);
    expect(compareRu('Гречка', 'Гречка')).toBe(0);
    // «ё» и «е» — sensitivity base: Ёлка рядом с Елка, порядок стабильный
    expect(compareRu('Ёлка', 'Елка')).toBe(0);
  });

  it('compareNumAsc: нечисла всегда в конце', () => {
    expect(compareNumAsc(1, 2)).toBeLessThan(0);
    expect(compareNumAsc(null, 5)).toBeGreaterThan(0);
    expect(compareNumAsc(5, null)).toBeLessThan(0);
    expect(compareNumAsc(undefined, NaN)).toBe(0);
  });

  it('sortRows: текстовое поле по алфавиту (asc/desc), входной массив не мутируется', () => {
    const rows = [
      { ingredientName: 'Тушёнка', totalAmount: 3 },
      { ingredientName: 'Гречка', totalAmount: 1.8 },
      { ingredientName: 'Соль', totalAmount: 0.045 },
    ];
    const asc = sortRows(rows, { field: 'ingredientName', dir: 'asc' });
    expect(asc.map(r => r.ingredientName)).toEqual(['Гречка', 'Соль', 'Тушёнка']);
    const desc = sortRows(rows, { field: 'ingredientName', dir: 'desc' });
    expect(desc.map(r => r.ingredientName)).toEqual(['Тушёнка', 'Соль', 'Гречка']);
    // оригинал не тронут
    expect(rows.map(r => r.ingredientName)).toEqual(['Тушёнка', 'Гречка', 'Соль']);
  });

  it('sortRows: числовое поле, null/NaN — в конце при любом направлении', () => {
    const rows = [
      { ingredientName: 'A', cost: null },
      { ingredientName: 'B', cost: 300 },
      { ingredientName: 'C', cost: 40 },
      { ingredientName: 'D', cost: NaN },
    ];
    const asc = sortRows(rows, { field: 'cost', dir: 'asc', kind: 'num' });
    expect(asc.slice(0, 2).map(r => r.cost)).toEqual([40, 300]);
    expect([asc[2].cost == null || Number.isNaN(asc[2].cost), asc[3].cost == null || Number.isNaN(asc[3].cost)]).toEqual([true, true]);
    const desc = sortRows(rows, { field: 'cost', dir: 'desc', kind: 'num' });
    expect(desc.slice(0, 2).map(r => r.cost)).toEqual([300, 40]);
  });

  it('sortRows: spec=null возвращает копию без сортировки', () => {
    const rows = [{ ingredientName: 'B' }, { ingredientName: 'A' }];
    const out = sortRows(rows, null);
    expect(out.map(r => r.ingredientName)).toEqual(['B', 'A']);
    expect(out).not.toBe(rows);
  });

  it('nextDir: asc ↔ desc', () => {
    expect(nextDir(undefined)).toBe('asc');
    expect(nextDir('asc')).toBe('desc');
    expect(nextDir('desc')).toBe('asc');
  });
});
