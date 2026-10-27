/**
 * Release-1.0 (UI-consistency): ЕДИНЫЕ правила вывода чисел и единиц во всём UI.
 * Раньше каждая страница форматировала числа как хотела (KPI — до 3 знаков
 * «123,678 ₽», таблицы — через точку «9.86», итоги — целыми рублями), из-за чего
 * цифры выглядели «вразнобой». Теперь одно место и один контракт:
 *
 *  1. Итоговые суммы (KPI, «Итого», чеки) — целые рубли: formatRub → «1 234 ₽».
 *  2. Цены за единицу (₽/кг, ₽/шт) — ровно 2 знака, запятая: formatPrice → «887,65».
 *  3. Количества — с человеческой единицей и адаптивной точностью: formatQty →
 *     «200 г», «1,25 кг», «8 шт», «2 уп» (KG/L < 1 показываем в г/мл целыми).
 *  4. Разделитель тысяч — неразрывный пробел (ru-RU), десятичный — ЗАПЯТАЯ. Всегда.
 *
 * Округляем только на этапе вывода; внутренние расчёты живут с полной точностью.
 */
import { humanizeUnit } from './text';
import type { UnitOfMeasure } from '../types';

/** «1 234 ₽» (без копеек). null/undefined/NaN → '—'. */
export function formatRub(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  const val = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(val)) return '—';
  // Math.round(-0) даёт -0 → toLocaleString печатает «-0 ₽»; нормализуем.
  const rounded = Math.round(val) || 0;
  // Fix-7 (п.24): перед ₽ — неразрывный пробел: «10 851 ₽» не переносится
  // на следующую строку в узких KPI-карточках шапки.
  return `${rounded.toLocaleString('ru-RU')}\u00A0₽`;
}

/** Цена за единицу: ровно 2 знака, запятая, без валюты («887,65»). null/NaN → '—'. */
export function formatPrice(value: number | string | null | undefined): string {
  if (value == null) return '—';
  const val = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(val)) return '—';
  return val.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Короткая человеческая единица: KG→кг, PCS→шт, PACK→уп… пусто → 'ед.' */
export function unitShortLabel(unit: string | null | undefined): string {
  return humanizeUnit(unit) || 'ед.';
}

/**
 * Количество с единицей измерения: «200 г», «1,25 кг», «3 мл», «2 л», «8 шт», «2 уп».
 * KG/L: <1 базовой единицы — целые г/мл; ≥1 — до 2 знаков (запятая).
 * PCS/PACK — целые штуки/упаковки. G/ML — целые граммы/миллилитры.
 */
export function formatQty(amount: number | null | undefined, unit: UnitOfMeasure | string | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  switch (unit) {
    case 'KG':
      return amount < 1 ? `${Math.round(amount * 1000)} г` : `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кг`;
    case 'L':
      return amount < 1 ? `${Math.round(amount * 1000)} мл` : `${amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} л`;
    case 'G':
      return `${Math.round(amount)} г`;
    case 'ML':
      return `${Math.round(amount)} мл`;
    case 'PCS':
      return `${Math.round(amount)} шт`;
    case 'PACK':
      return `${Math.round(amount)} уп`;
    default: {
      // Неизвестная/legacy-единица (TLSP и т.п.): число через запятую + сама единица.
      const num = amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
      return unit ? `${num} ${unit}` : num;
    }
  }
}

/**
 * Категория продукта может приходить с бэкенда объектом (ProductCategoryDto:
 * {id, name, slug, sortOrder}) или строкой (mock/legacy). Приводим к строке,
 * иначе в UI протекает «[object Object]».
 */
export function categoryName(p: { category?: unknown; categoryName?: unknown } | null | undefined): string {
  if (!p) return '';
  const raw = (p as { categoryName?: unknown }).categoryName ?? (p as { category?: unknown }).category;
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') {
    const name = (raw as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return String(raw);
}
