/**
 * Патч «UX-список 26.10» (U26–U28, U41): единые компараторы сортировки строк
 * таблиц закупки/чека/чекалиста.
 *
 * Правила:
 *  - текстовые поля — localeCompare('ru') с нормализацией регистра (ёлка/Ёлка рядом);
 *  - числовые поля — по возрастанию/убыванию, null/undefined/NaN всегда в конце
 *    (независимо от направления), чтобы «нет цены» не прыгало в середину;
 *  - sortRows не мутирует входной массив (возвращает копию) — таблицы строятся в useMemo.
 */

export type SortDir = 'asc' | 'desc';

/** Русская локаль, регистронезависимо: «арбуз» < «Банан» < «вата». */
export function compareRu(a: string | null | undefined, b: string | null | undefined): number {
  return String(a ?? '').localeCompare(String(b ?? ''), 'ru', { sensitivity: 'base' });
}

/** Числовой компаратор: нечисловые значения (null/undefined/NaN) — всегда в конец. */
export function compareNumAsc(a: number | null | undefined, b: number | null | undefined): number {
  const an = typeof a === 'number' && Number.isFinite(a);
  const bn = typeof b === 'number' && Number.isFinite(b);
  if (!an && !bn) return 0;
  if (!an) return 1;
  if (!bn) return -1;
  return (a as number) - (b as number);
}

export interface SortSpec<T> {
  field: keyof T & string;
  dir: SortDir;
  /** 'text' — compareRu, 'num' — compareNumAsc. По умолчанию определяется по типу значения. */
  kind?: 'text' | 'num';
}

/** Универсальная сортировка копии массива по одному полю. */
export function sortRows<T>(rows: readonly T[], spec: SortSpec<T> | null): T[] {
  const copy = [...rows];
  if (!spec) return copy;
  const { field, dir } = spec;
  const mul = dir === 'desc' ? -1 : 1;
  copy.sort((x, y) => {
    const a = x[field];
    const b = y[field];
    const kind = spec.kind ?? (typeof a === 'number' || a == null ? 'num' : 'text');
    if (kind === 'num') {
      // null/NaN всегда в конце независимо от направления
      const an = typeof a === 'number' && Number.isFinite(a as number);
      const bn = typeof b === 'number' && Number.isFinite(b as number);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return mul * ((a as number) - (b as number));
    }
    return mul * compareRu(a as string, b as string);
  });
  return copy;
}

/** Следующее направление при клике по заголовку: asc → desc → asc (цикл из двух). */
export function nextDir(current: SortDir | undefined): SortDir {
  return current === 'asc' ? 'desc' : 'asc';
}
