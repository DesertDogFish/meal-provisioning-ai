import { pluralize } from './pluralize';

// Удобные обёртки для часто используемых слов
export const servingsWord = (count: number): string => pluralize(count, ['порция', 'порции', 'порций']);
export const recipesWord = (count: number): string => pluralize(count, ['рецепт', 'рецепта', 'рецептов']);
export const ingredientsWord = (count: number): string => pluralize(count, ['ингредиент', 'ингредиента', 'ингредиентов']);
export const mealsWord = (count: number): string => pluralize(count, ['приём', 'приёма', 'приёмов']);
// Release-1.0 (UI-consistency): «1 продукт / 2 продукта / 5 продуктов» — для чипов и подсказок
export const productsWord = (count: number): string => pluralize(count, ['продукт', 'продукта', 'продуктов']);

// P0-1/P0-3: Человекочитаемые единицы измерения и категории.
const UNIT_HUMAN: Record<string, string> = { KG: 'кг', L: 'л', ML: 'мл', G: 'г', PCS: 'шт', PACK: 'уп' };

export function humanizeUnit(unit: string | null | undefined): string {
  if (!unit) return '';
  return UNIT_HUMAN[unit.toUpperCase()] ?? unit;
}

// P0-3: "ВЫПЕЧКА" -> "Выпечка" (аккуратный бейдж в обычном регистре)
export function humanizeCategory(cat: string | null | undefined): string {
  if (!cat) return '';
  const isUpper = cat === cat.toUpperCase() && /[А-ЯA-Z]/.test(cat);
  if (!isUpper) return cat;
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}
