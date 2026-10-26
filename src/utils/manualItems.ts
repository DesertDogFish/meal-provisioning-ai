/**
 * Патч «UX-список 26.10» (U40) / PLAN R3 (mock+UI-часть): ручные позиции закупки —
 * продукты, добавленные к дню или ко всему походу ВНЕ блюд (антисептик, аптечка,
 * топливо и т.п.). Чистые функции слияния с расчётной закупкой; API — в
 * `src/api/tripManualItems.ts`, хранение — сервер (mock-паритет: in-memory).
 */
import type { TripManualItem } from '../api/tripManualItems';
import { stripSnapshotSuffix } from './menuOverlay';

export interface ShoppingRowLike {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  estimatedCost?: number;
  hasPrice: boolean;
  /** позиция добавлена вручную (не из блюд) — для бейджей в UI */
  manual?: boolean;
}

/**
 * Влить ручные позиции в строки закупки.
 * Совпадение продукта — по базовому id (stripSnapshotSuffix): та же строка,
 * количество суммируется. Иначе — новая строка (manual=true, без цены:
 * у ручной позиции плановая цена появляется только после ввода чека).
 * Входной массив не мутируется.
 */
export function mergeManualIntoShopping<T extends ShoppingRowLike>(
  rows: readonly T[],
  manual: readonly TripManualItem[],
): Array<T & { manual?: boolean }> {
  const out: Array<T & { manual?: boolean }> = rows.map(r => ({ ...r }));
  const idxByBase = new Map<string, number>();
  out.forEach((r, i) => idxByBase.set(stripSnapshotSuffix(r.ingredientId), i));

  for (const m of manual) {
    if (!(Number(m.amount) > 0)) continue;
    const base = stripSnapshotSuffix(m.ingredientId);
    const hit = idxByBase.get(base);
    if (hit != null) {
      out[hit] = { ...out[hit], totalAmount: out[hit].totalAmount + Number(m.amount) };
      idxByBase.set(base, hit);
    } else {
      out.push({
        ingredientId: String(m.ingredientId),
        ingredientName: m.ingredientName || base,
        unit: m.unit,
        totalAmount: Number(m.amount),
        hasPrice: false,
        manual: true,
      } as T & { manual?: boolean });
      idxByBase.set(base, out.length - 1);
    }
  }
  return out;
}

/** Ручные позиции конкретного дня (dayId совпал) — для «Закупка по дням». */
export function manualForDay(items: readonly TripManualItem[], dayId: string): TripManualItem[] {
  return items.filter(i => String(i.dayId ?? '') === String(dayId));
}

/** Ручные позиции без дня («на весь поход») — для шапки/чекалиста. */
export function manualForTrip(items: readonly TripManualItem[]): TripManualItem[] {
  return items.filter(i => i.dayId == null || i.dayId === '');
}
