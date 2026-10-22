// P0-2: Русская плюрализация счётных слов.
// forms = [для 1 ("порция"), для 2-4 ("порции"), для 5+ ("порций")]
// Правила: count%10===1 && count%100!==11 -> forms[0];
//          count%10>=2 && count%10<=4 && (count%100<10 || count%100>=20) -> forms[1];
//          иначе -> forms[2].
export function pluralize(count: number, forms: [string, string, string]): string {
  const n = Math.abs(Math.round(count));
  if (n % 10 === 1 && n % 100 !== 11) return forms[0];
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return forms[1];
  return forms[2];
}

// Удобные обёртки для часто используемых слов
export const servingsWord = (count: number): string => pluralize(count, ['порция', 'порции', 'порций']);
export const recipesWord = (count: number): string => pluralize(count, ['рецепт', 'рецепта', 'рецептов']);
export const ingredientsWord = (count: number): string => pluralize(count, ['ингредиент', 'ингредиента', 'ингредиентов']);

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
