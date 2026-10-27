import { describe, it, expect } from 'vitest';
import { unitOptions, defaultUnit, convertToBase, isActualLessThanNeeded, neededAsActual } from './checkUnits';

describe('checkUnits (Fix-6, п.8) — свободные единицы факта', () => {
  it('опции единиц: KG → г/кг; L → мл/л; PCS → шт (+г/кг при известном весе)', () => {
    expect(unitOptions('KG')).toEqual(['г', 'кг']);
    expect(unitOptions('L')).toEqual(['мл', 'л']);
    expect(unitOptions('PCS')).toEqual(['шт']);
    expect(unitOptions('PCS', 25)).toEqual(['шт', 'г', 'кг']);
    expect(unitOptions('PACK', 600)).toEqual(['уп', 'г', 'кг']);
  });

  it('defaultUnit — учётная единица продукта', () => {
    expect(defaultUnit('KG')).toBe('кг');
    expect(defaultUnit('L')).toBe('л');
    expect(defaultUnit('PCS')).toBe('шт');
    expect(defaultUnit('PACK')).toBe('уп');
  });

  it('convertToBase: майонез «2 шт» при учете в PCS → 2; «300 г» для PCS весом 25 г → 12 шт', () => {
    expect(convertToBase({ amount: 2, unit: 'шт' }, 'PCS', 25)).toBe(2);
    expect(convertToBase({ amount: 300, unit: 'г' }, 'PCS', 25)).toBeCloseTo(12);
  });

  it('convertToBase: картошка в кг — «2 кг» → 2, «500 г» → 0.5', () => {
    expect(convertToBase({ amount: 2, unit: 'кг' }, 'KG')).toBe(2);
    expect(convertToBase({ amount: 500, unit: 'г' }, 'KG')).toBeCloseTo(0.5);
  });

  it('convertToBase: несопоставимое (шт без веса для кг) → null', () => {
    expect(convertToBase({ amount: 3, unit: 'шт' }, 'KG', null)).toBeNull();
    expect(convertToBase(null, 'KG')).toBeNull();
  });

  it('isActualLessThanNeeded: подсветка «куплено меньше»', () => {
    expect(isActualLessThanNeeded({ amount: 500, unit: 'г' }, 0.64, 'KG')).toBe(true);
    expect(isActualLessThanNeeded({ amount: 700, unit: 'г' }, 0.64, 'KG')).toBe(false);
    expect(isActualLessThanNeeded({ amount: 3, unit: 'шт' }, 5, 'KG', null)).toBeNull();
  });
});

describe('neededAsActual (Fix-7 п.22) — префил «Взяли» ожидаемым количеством', () => {
  it('KG: <1 → граммы, ≥1 → килограммы', () => {
    expect(neededAsActual(0.072, 'KG')).toEqual({ amount: 72, unit: 'г' });
    expect(neededAsActual(1.5, 'KG')).toEqual({ amount: 1.5, unit: 'кг' });
  });

  it('L: <1 → мл, ≥1 → л; PCS → шт; PACK → уп', () => {
    expect(neededAsActual(0.3, 'L')).toEqual({ amount: 300, unit: 'мл' });
    expect(neededAsActual(2, 'L')).toEqual({ amount: 2, unit: 'л' });
    expect(neededAsActual(8, 'PCS')).toEqual({ amount: 8, unit: 'шт' });
    expect(neededAsActual(3, 'PACK')).toEqual({ amount: 3, unit: 'уп' });
  });

  it('0/null/отрицательные → null (нечем предзаполнять)', () => {
    expect(neededAsActual(0, 'KG')).toBeNull();
    expect(neededAsActual(null, 'KG')).toBeNull();
    expect(neededAsActual(-1, 'KG')).toBeNull();
  });

  it('float-мусор округляется до 3 знаков', () => {
    expect(neededAsActual(0.07200000000001, 'KG')!.amount).toBe(72);
    expect(neededAsActual(165.50240000000002, 'KG')!.amount).toBe(165.502);
  });

  it('префил сопоставим с «нужно» — не подсвечивается как «взяли меньше»', () => {
    const prefill = neededAsActual(0.072, 'KG');
    expect(isActualLessThanNeeded(prefill, 0.072, 'KG')).toBe(false);
  });
});
