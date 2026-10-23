/**
 * Плюрализация для русского языка.
 *
 * @example pluralize(1, ['порция', 'порции', 'порций']) // → "порция"
 * @example pluralize(3, ['порция', 'порции', 'порций']) // → "порции"
 * @example pluralize(5, ['порция', 'порции', 'порций']) // → "порций"
 * @example pluralize(21, ['порция', 'порции', 'порций']) // → "порция"
 */
export function pluralize(count: number, forms: [string, string, string]): string {
  const n = Math.abs(Math.round(count));
  if (n % 10 === 1 && n % 100 !== 11) return forms[0];
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return forms[1];
  return forms[2];
}
