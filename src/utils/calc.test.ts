import { describe, it, expect } from 'vitest';
import { calculateKcal, calculateRecipeKcal, humanize, getUnitLabel } from './calc';

describe('calculateKcal', () => {
  it('KCAL-01: овсянка 350 ккал/100г, 0.08 KG → 280 ккал', () => {
    const result = calculateKcal(0.08, 'KG', 350, null);
    expect(result).toBe(280);
  });

  it('KCAL-02: тушёнка PCS, piece_weight 325, 250 ккал/100г, 1 шт → 812.5 ккал', () => {
    const result = calculateKcal(1, 'PCS', 250, 325);
    expect(result).toBe(812.5);
  });

  it('KCAL-03: молоко 60 ккал/100мл, 0.25 L → 150 ккал', () => {
    const result = calculateKcal(0.25, 'L', 60, null);
    expect(result).toBe(150);
  });

  it('возвращает null если kcalPer100g отсутствует', () => {
    const result = calculateKcal(1, 'KG', null, null);
    expect(result).toBeNull();
  });

  it('KCAL-05: возвращает null для PCS без pieceWeightG', () => {
    const result = calculateKcal(1, 'PCS', 250, null);
    expect(result).toBeNull();
  });

  it('PACK с pieceWeightG работает как PCS', () => {
    const result = calculateKcal(1, 'PACK', 300, 600);
    expect(result).toBe(1800); // 600г * 300ккал/100г = 1800
  });
});

describe('calculateRecipeKcal', () => {
  it('KCAL-04: рассчитывает ккал порции из продуктов', () => {
    const ingredients = [
      { amount: 0.08, unit: 'KG' as const, kcalPer100g: 350, pieceWeightG: null, name: 'Овсянка' },
      { amount: 0.25, unit: 'L' as const, kcalPer100g: 60, pieceWeightG: null, name: 'Молоко' },
    ];
    const result = calculateRecipeKcal(ingredients, 1);
    expect(result.caloriesPerServing).toBe(430); // 280 + 150
    expect(result.missingKcalIngredients).toHaveLength(0);
  });

  it('KCAL-06: рецепт с продуктом без ккал → calories=null + чип', () => {
    const ingredients = [
      { amount: 0.01, unit: 'KG' as const, kcalPer100g: null, pieceWeightG: null, name: 'Соль' },
    ];
    const result = calculateRecipeKcal(ingredients, 1);
    expect(result.caloriesPerServing).toBeNull();
    expect(result.missingKcalIngredients).toContain('Соль');
  });

  it('делит на baseServings', () => {
    const ingredients = [
      { amount: 0.4, unit: 'KG' as const, kcalPer100g: 350, pieceWeightG: null, name: 'Гречка' },
    ];
    const result = calculateRecipeKcal(ingredients, 4);
    // 0.4 KG = 400г * 350/100 = 1400 ккал / 4 порции = 350 ккал/порция
    expect(result.caloriesPerServing).toBe(350);
  });
});

describe('humanize', () => {
  it('0.8 KG → "800 г"', () => {
    expect(humanize(0.8, 'KG')).toBe('800 г');
  });

  it('1.5 KG → "1.50 кг"', () => {
    expect(humanize(1.5, 'KG')).toBe('1.50 кг');
  });

  it('0.25 L → "250 мл"', () => {
    expect(humanize(0.25, 'L')).toBe('250 мл');
  });

  it('UNIT-03: 2 PCS → "2 шт"', () => {
    expect(humanize(2, 'PCS')).toBe('2 шт');
  });

  it('3 PACK → "3 уп"', () => {
    expect(humanize(3, 'PACK')).toBe('3 уп');
  });

  it('null → "—"', () => {
    expect(humanize(null as any, 'KG')).toBe('—');
  });
});

describe('getUnitLabel', () => {
  it('UNIT-01: KG → "кг"', () => {
    expect(getUnitLabel('KG')).toBe('кг');
  });

  it('L → "л"', () => {
    expect(getUnitLabel('L')).toBe('л');
  });

  it('UNIT-02: PCS → "шт" (нет "PCS" в UI)', () => {
    expect(getUnitLabel('PCS')).toBe('шт');
  });

  it('PACK → "уп"', () => {
    expect(getUnitLabel('PACK')).toBe('уп');
  });
});
