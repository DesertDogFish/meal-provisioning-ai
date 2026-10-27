/**
 * Fix-6 (п.8): «Майонез порционный 25 г ×2 шт, а в магазине банка 300 г»,
 * «картошка на развес или в мешках», «в штуках — только то, что не имеет веса
 * (салфетки)». Фактическое количество покупки вводится СВОБОДНО: граммы,
 * килограммы, миллилитры, литры, штуки, упаковки — независимо от учётной
 * единицы продукта.
 *
 * Хранение: {amount, unit} — как ввёл пользователь (для отчёта «взяли 300 г»).
 * Для сравнения с «нужно» (подсветка «куплено меньше, чем нужно») значение
 * приводится к базовой единице продукта, если это возможно (convertToBase);
 * несопоставимые комбинации (штуки ↔ кг без веса штуки) дают null.
 */

export interface ActualAmount {
  amount: number;
  /** человеческая единица ввода: 'г' | 'кг' | 'мл' | 'л' | 'шт' | 'уп' */
  unit: string;
}

/** Доступные единицы ввода для продукта (учётная единица + вес штуки, если есть). */
export function unitOptions(baseUnit: string | null | undefined, pieceWeightG?: number | null): string[] {
  switch (String(baseUnit ?? '').toUpperCase()) {
    case 'KG': return ['г', 'кг'];
    case 'L': return ['мл', 'л'];
    case 'PCS': return pieceWeightG != null && Number(pieceWeightG) > 0 ? ['шт', 'г', 'кг'] : ['шт'];
    case 'PACK': return pieceWeightG != null && Number(pieceWeightG) > 0 ? ['уп', 'г', 'кг'] : ['уп'];
    default: return [baseUnit ? String(baseUnit) : 'шт'];
  }
}

/** Единица по умолчанию при первом вводе (= учётная единица продукта). */
export function defaultUnit(baseUnit: string | null | undefined): string {
  switch (String(baseUnit ?? '').toUpperCase()) {
    case 'KG': return 'кг';
    case 'L': return 'л';
    case 'PACK': return 'уп';
    default: return 'шт';
  }
}

/**
 * Приведение фактического количества к базовой единице продукта (кг/л/шт/уп)
 * для сравнения с расчётным «нужно». null = несопоставимо (например, «3 шт»
 * для продукта в кг без известного веса штуки).
 */
export function convertToBase(
  actual: ActualAmount | null | undefined,
  baseUnit: string | null | undefined,
  pieceWeightG?: number | null,
): number | null {
  if (!actual || !Number.isFinite(actual.amount)) return null;
  const a = actual.amount;
  const base = String(baseUnit ?? '').toUpperCase();
  const pw = Number(pieceWeightG) > 0 ? Number(pieceWeightG) : null;
  switch (actual.unit) {
    case 'г':
      if (base === 'KG') return a / 1000;
      if (pw != null && (base === 'PCS' || base === 'PACK')) return a / pw; // граммы → штуки
      return null;
    case 'кг':
      if (base === 'KG') return a;
      if (pw != null && (base === 'PCS' || base === 'PACK')) return (a * 1000) / pw; // кг → штуки
      return null;
    case 'мл': return base === 'L' ? a / 1000 : null;
    case 'л': return base === 'L' ? a : null;
    case 'шт':
      if (base === 'PCS') return a;
      if (pw != null && (base === 'KG' || base === 'PACK')) return (a * pw) / 1000; // штуки → кг
      return null;
    case 'уп':
      if (base === 'PACK') return a;
      return null;
    default:
      // ввод в самой учётной единице (fallback для экзотики)
      return actual.unit === base || actual.unit.toLowerCase() === base.toLowerCase() ? a : null;
  }
}

/** Куплено МЕНЬШЕ, чем нужно (для подсветки в чеклисте); null = нельзя сравнить. */
export function isActualLessThanNeeded(
  actual: ActualAmount | null | undefined,
  neededBase: number,
  baseUnit: string | null | undefined,
  pieceWeightG?: number | null,
): boolean | null {
  const base = convertToBase(actual, baseUnit, pieceWeightG);
  if (base == null) return null;
  return base < neededBase - 1e-9;
}
