/**
 * Фаза 13 (UX): все ИТОГОВЫЕ суммы пользователю выводятся округлёнными до целого рубля.
 * Внутренние расчёты остаются с полной точностью — округляем только на этапе вывода.
 */

/** «1 234 ₽» (без копеек). null/undefined → '—'. */
export function formatRub(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  const val = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(val)) return '—';
  // Math.round(-0) даёт -0 → toLocaleString печатает «-0 ₽»; нормализуем.
  const rounded = Math.round(val) || 0;
  return `${rounded.toLocaleString('ru-RU')} ₽`;
}
