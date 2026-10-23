import { UnitOfMeasure } from '../types';

/**
 * CR-1: Расчёт калорийности по формуле ядра
 * grams = amount × (KG|L → 1000; PCS|PACK → piece_weight_g)
 * kcal = grams / 100 × kcal_per_100g
 */
export function calculateKcal(
  amount: number,
  unit: UnitOfMeasure,
  kcalPer100g: number | null | undefined,
  pieceWeightG: number | null | undefined
): number | null {
  if (kcalPer100g == null) return null;
  
  let grams: number;
  
  if (unit === 'KG' || unit === 'L') {
    // FIX (2026-10-24, T0 «вернуть main зелёным»): каноническая формула ядра —
    // grams = amount × 1000 (amount в базовых единицах кг/л). Согласовано с:
    //   - бэкендом KcalCalculator.java (amount.multiply(1000));
    //   - seed-фикстурами src/data/mockData.ts (Овсянка: 0.08 кг → 344 ккал);
    //   - контрактом CR-1 (src/test/contract.test.ts) и calc.test.ts KCAL-01..04.
    // Вариант «grams = amount» из кросс-мерджа PR #32/#33 ломал эти 5 проверок.
    grams = amount * 1000;
  } else if (unit === 'PCS' || unit === 'PACK') {
    // шт/уп → граммы: умножаем на piece_weight_g
    if (pieceWeightG == null) return null;
    grams = amount * pieceWeightG;
  } else {
    return null;
  }
  
  // kcal = grams / 100 × kcal_per_100g
  return (grams / 100) * kcalPer100g;
}

/**
 * CR-1: Расчёт калорийности порции рецепта
 */
export function calculateRecipeKcal(
  ingredients: Array<{
    amount: number;
    unit: UnitOfMeasure;
    kcalPer100g?: number | null;
    pieceWeightG?: number | null;
    name: string;
  }>,
  baseServings: number
): { caloriesPerServing: number | null; missingKcalIngredients: string[] } {
  let totalKcal = 0;
  const missingKcalIngredients: string[] = [];
  
  for (const ing of ingredients) {
    const kcal = calculateKcal(ing.amount, ing.unit, ing.kcalPer100g, ing.pieceWeightG);
    if (kcal == null) {
      if (ing.kcalPer100g == null) {
        missingKcalIngredients.push(ing.name);
      }
      continue;
    }
    totalKcal += kcal;
  }
  
  const caloriesPerServing = missingKcalIngredients.length > 0 
    ? null 
    : totalKcal / baseServings;
  
  return { caloriesPerServing, missingKcalIngredients };
}

/**
 * CR-2: Humanize количества
 * 0.8 KG → "800 г", 0.25 L → "250 мл", 2 PCS → "2 шт", 3 PACK → "3 уп"
 */
export function humanize(amount: number | null | undefined, unit: UnitOfMeasure): string {
  if (amount == null) return '—';
  
  switch (unit) {
    case 'KG':
      if (amount < 1) {
        return `${Math.round(amount * 1000)} г`;
      }
      return `${amount.toFixed(2)} кг`;
    case 'L':
      if (amount < 1) {
        return `${Math.round(amount * 1000)} мл`;
      }
      return `${amount.toFixed(2)} л`;
    case 'PCS':
      return `${Math.round(amount)} шт`;
    case 'PACK':
      return `${Math.round(amount)} уп`;
    default:
      return `${amount}`;
  }
}

/**
 * CR-2: Получить лейбл единицы на русском
 */
export function getUnitLabel(unit: UnitOfMeasure): string {
  const labels: Record<UnitOfMeasure, string> = {
    KG: 'кг',
    L: 'л',
    PCS: 'шт',
    PACK: 'уп'
  };
  return labels[unit] || unit;
}
