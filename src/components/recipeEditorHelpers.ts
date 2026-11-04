import type { MealType, UnitOfMeasure } from '../types';

export interface EditorProduct {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  kcalPer100g?: number | null;
  pieceWeightG?: number | null;
}

export interface EditableRecipe {
  id: string;
  name: string;
  mealType: MealType;
  category?: string;
  cookMinutes?: number;
  baseServings: number;
  ingredients: Array<{
    ingredientId: string | number;
    amount: number;
    ingredient?: { name?: string; unit?: string } | null;
  }>;
}

export interface Row {
  key: number;
  ingredientId: string | number | null;
  query: string;
  amount: string;
}

export const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: 'BREAKFAST', label: 'Завтрак' },
  { value: 'LUNCH', label: 'Обед' },
  { value: 'DINNER', label: 'Ужин' },
  { value: 'SNACK', label: 'Перекус' },
];

export const rowAmountValue = (raw: string): number | null => {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && String(raw).trim() !== '' ? n : null;
};

export function parseAmount(raw: string): number | null {
  const n = Number(raw.replace(',', '.').trim());
  if (!raw.trim() || Number.isNaN(n) || n <= 0) return null;
  return n;
}

export let rowSeq = 1;
