/**
 * Fix-3 (список 26.10, п.5 «!!!»): ввод чека — СУММОЙ за позицию, а не ценой
 * за единицу. Хранилище и все сводки остаются в ценах за единицу (контракт
 * price-overrides не меняется) — перевод делается здесь, в чистых функциях.
 *
 * «Я ввожу то, что заплатил по чеку за количество, которое купил, — и это
 * распределяется на всех». Факт ₽/ед = Факт ₽ / количество позиции.
 */

/** Сумма по чеку за позицию → цена за единицу (для хранения/расчётов). */
export function unitFromTotal(total: number | null | undefined, amount: number | null | undefined): number | null {
  if (total == null || !Number.isFinite(total)) return null;
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return null; // делить на ноль нельзя — позиция без количества
  return total / a;
}

/** Цена за единицу → сумма за позицию (для отображения/инпута). */
export function totalFromUnit(unit: number | null | undefined, amount: number | null | undefined): number | null {
  if (unit == null || !Number.isFinite(unit)) return null;
  const a = Number(amount);
  if (!Number.isFinite(a)) return null;
  return unit * a;
}

/**
 * Fix-4 (п.10): деньги показываем с точностью до копеек — никаких
 * «165,50240000000002» в поле ввода чека (float-артефакты unit×amount).
 */
export function roundMoney(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Fix-10 (п.1): «Заплатили» по умолчанию ПУСТО — в поле ввода чека показывается
 * ТОЛЬКО введённый пользователем факт (цена за единицу из стейджа × текущее
 * «нужно»). Плановая цена сюда НЕ фолбэчится: план виден в плейсхолдере
 * («думали X ₽»), а пустое поле честно означает «чек ещё не введён».
 * Итоги/отклонения продолжают использовать плановый фолбэк (см. consumers).
 */
export function enteredCheckTotal(
  enteredUnitPrice: number | null | undefined,
  amount: number | null | undefined,
): number | null {
  return roundMoney(totalFromUnit(enteredUnitPrice ?? null, amount));
}
