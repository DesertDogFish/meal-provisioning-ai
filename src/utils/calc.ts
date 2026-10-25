import { UnitOfMeasure } from '../types';
import { formatQty } from './format';

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
    // FIX (T0, зелёный main): контракт KG/L — БАЗОВЫЕ единицы (кг/л), как в
    // backend KcalCalculator.java и в фикстурах contract.test.ts (гречка
    // 1.8 KG, соль 0.045 KG) и TripForm-потоке e2e. Предыдущая правка
    // («amount уже в граммах») противоречила этим фикстурам: расчёт падал
    // в 1000 раз (0.08 KG → 0.28 вместо 280 ккал). Восстанавливаем кг→г.
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
 * Release-1.0 (UI-consistency): единая реализация — formatQty (запятая, «1,5 кг»,
 * а не legacy «1.50 кг» через точку). Оставляем обёртку ради существующих импортов.
 */
export function humanize(amount: number | null | undefined, unit: UnitOfMeasure): string {
  return formatQty(amount, unit);
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
