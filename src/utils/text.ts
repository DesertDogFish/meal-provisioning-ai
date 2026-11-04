import type { MealType } from '../types';

import { pluralize } from './pluralize';

// cleanup-п.9: ЕДИНАЯ копия лейблов приёмов пищи (раньше три дубля:
// TripMealCard, RecipesPage, CatalogImportTab).
export const mealTypeLabels: Record<MealType, string> = {
  BREAKFAST: 'Завтрак',
  LUNCH: 'Обед',
  DINNER: 'Ужин',
  SNACK: 'Перекус',
};

// Удобные обёртки для часто используемых слов
export const servingsWord = (count: number): string => pluralize(count, ['порция', 'порции', 'порций']);
export const recipesWord = (count: number): string => pluralize(count, ['рецепт', 'рецепта', 'рецептов']);
export const ingredientsWord = (count: number): string => pluralize(count, ['ингредиент', 'ингредиента', 'ингредиентов']);
export const mealsWord = (count: number): string => pluralize(count, ['приём', 'приёма', 'приёмов']);
export const daysWord = (count: number): string => pluralize(count, ['день', 'дня', 'дней']);
// Release-1.0 (UI-consistency): «1 продукт / 2 продукта / 5 продуктов» — для чипов и подсказок
export const productsWord = (count: number): string => pluralize(count, ['продукт', 'продукта', 'продуктов']);
export const categoriesWord = (count: number): string => pluralize(count, ['категория', 'категории', 'категорий']);
// bugs-recipes-catalog п.1: подзаголовок витрины блюд — «N блюд · M категорий»
// («блюдо», а не «рецепт» — словарь владельца; recipesWord остаётся для рецептурных контекстов)
export const dishesWord = (count: number): string => pluralize(count, ['блюдо', 'блюда', 'блюд']);

/**
 * UX-осмотр 31.10 (подзадача 1): подпись-счётчик «N приёмов пищи».
 *
 * Раньше в `TripDaysList`/`TripPrintPage`/`TripsPage` форма слова была хардкодом
 * («приёмов»), и день с двумя приёмами подписывался «2 приёмов пищи». Единственный
 * источник формы — `mealsWord`, поэтому все экраны согласованы по построению.
 *
 * @param count число приёмов
 * @param opts.short — короткая форма без «пищи» («2 приёма») для плотных строк печати
 */
export const mealsCountLabel = (count: number, opts?: { short?: boolean }): string =>
  `${count} ${mealsWord(count)}${opts?.short ? '' : ' пищи'}`;

/**
 * Подзадача 1 (sweep): подпись-счётчик дней — «1 день / 2 дня / 5 дней»,
 * короткая форма «2 дн.» для списков и печати.
 */
export const daysCountLabel = (count: number, opts?: { short?: boolean }): string =>
  opts?.short ? `${count} дн.` : `${count} ${daysWord(count)}`;

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
