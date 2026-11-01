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
 *
 * BL-10 (01.11.2026): действует правило «плотность ≈ 1» — г↔мл и кг↔л
 * сопоставимы (так же считает бэкенд, `UnitOfMeasure.gramsPerOne`/`EmisUnit`).
 */

export interface ActualAmount {
  amount: number;
  /** человеческая единица ввода: 'г' | 'кг' | 'мл' | 'л' | 'шт' | 'уп' */
  unit: string;
}

/** Доступные единицы ввода для продукта (учётная единица + вес штуки, если есть). */
export function unitOptions(baseUnit: string | null | undefined, pieceWeightG?: number | null): string[] {
  // BL-10: правило «плотность ≈ 1» на фронте (как `UnitOfMeasure.gramsPerOne`
  // и `EmisUnit.factor` на бэкенде: 1 л ≈ 1 кг). Поэтому весовым продуктам
  // доступен и объём, а объёмным — и вес: «купил 1 л молока» для продукта
  // в кг, «взял 900 г» для продукта в литрах. Штучные/фасовочные получают
  // объём через `piece_weight_g` (читается как мл у одной штуки/упаковки).
  const pw = pieceWeightG != null && Number(pieceWeightG) > 0;
  switch (String(baseUnit ?? '').toUpperCase()) {
    case 'KG': return ['г', 'кг', 'мл', 'л'];
    case 'L': return ['мл', 'л', 'г', 'кг'];
    case 'PCS': return pw ? ['шт', 'г', 'кг', 'мл', 'л'] : ['шт'];
    case 'PACK': return pw ? ['уп', 'г', 'кг', 'мл', 'л'] : ['уп'];
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
  // BL-10: плотность ≈ 1 — граммы↔миллилитры, килограммы↔литры сопоставимы
  // (бэкенд считает так же: `MealCompositionService.weightOfGrams` — KG|L ×1000 г).
  switch (actual.unit) {
    case 'г':
      if (base === 'KG') return a / 1000;
      if (base === 'L') return a / 1000;                                    // 1 г ≈ 1 мл
      if (pw != null && (base === 'PCS' || base === 'PACK')) return a / pw; // граммы → штуки
      return null;
    case 'кг':
      if (base === 'KG') return a;
      if (base === 'L') return a;                                           // 1 кг ≈ 1 л
      if (pw != null && (base === 'PCS' || base === 'PACK')) return (a * 1000) / pw; // кг → штуки
      return null;
    case 'мл':
      if (base === 'L') return a / 1000;
      if (base === 'KG') return a / 1000;                                   // 1 мл ≈ 1 г
      if (pw != null && (base === 'PCS' || base === 'PACK')) return a / pw; // мл → штуки
      return null;
    case 'л':
      if (base === 'L') return a;
      if (base === 'KG') return a;                                          // 1 л ≈ 1 кг
      if (pw != null && (base === 'PCS' || base === 'PACK')) return (a * 1000) / pw;
      return null;
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

/**
 * Fix-7 (п.22): ожидаемое значение «Взяли» из расчётного количества —
 * чеклист не пустой, а предзаполнен тем, что нужно купить (в человеческих
 * единицах ввода). Для фасованных позиций передаётся buyAmount (целые
 * упаковки вверх). Мелкие весовые (<1 кг/л) — в г/мл, иначе — кг/л;
 * штучные — в шт/уп. Значение НЕ хранится: фактом становится только
 * реальный ввод пользователя.
 */
export function neededAsActual(
  neededBase: number | null | undefined,
  baseUnit: string | null | undefined,
): ActualAmount | null {
  const n = Number(neededBase);
  if (!Number.isFinite(n) || n <= 0) return null;
  const round3 = (x: number) => Math.round(x * 1000) / 1000;
  switch (String(baseUnit ?? '').toUpperCase()) {
    case 'KG':
      return n < 1 ? { amount: round3(n * 1000), unit: 'г' } : { amount: round3(n), unit: 'кг' };
    case 'L':
      return n < 1 ? { amount: round3(n * 1000), unit: 'мл' } : { amount: round3(n), unit: 'л' };
    case 'PACK':
      return { amount: round3(n), unit: 'уп' };
    case 'PCS':
      return { amount: round3(n), unit: 'шт' };
    default:
      return { amount: round3(n), unit: defaultUnit(baseUnit) };
  }
}
