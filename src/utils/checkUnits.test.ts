import { describe, it, expect } from 'vitest';
import { unitOptions, defaultUnit, convertToBase, isActualLessThanNeeded } from './checkUnits';

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
