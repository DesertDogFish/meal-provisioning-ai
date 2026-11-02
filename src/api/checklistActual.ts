/**
 * BL-27: ФАКТИЧЕСКОЕ количество чеклиста похода («сколько реально берём/взяли»)
 * — серверный источник истины, localStorage остаётся кэшем и буфером офлайн-записи.
 *
 * Контракт паритетен backend ChecklistActualQty (V37):
 *   GET /trips/{id}/checklist-actual-qty → [{ingredientId, amount, unit}]
 *   PUT тот же путь, body {items:[...]}  → тот же массив (идемпотентная ПОЛНАЯ замена)
 *
 * Отметки «взято» (api/checklist.ts) привязаны к ШТАМПУ потребности, факт — только к
 * позиции: при изменении числа людей количество пересчитывается, а введённый факт
 * переживает пересчёт (Fix-8 п.6).
 *
 * Как и у «взято»:
 *  - GET при ошибке/недоступности отдаёт null (пустой набор ≠ недоступность), чтобы
 *    офлайн-факты не были затёрты пустотой;
 *  - нечисловые id в mock-режиме допустимы ('ing7'), числовые уходят числом (Long);
 *  - невалидные пары (amount ≤ 0, пустая единица) на сервер не отправляются — иначе
 *    один мусорный элемент валит весь PUT (400) и dirty-флаг становится вечным.
 */
import { api } from './client';

export interface ServerActualQtyItem {
  /** backend — Long, mock-каталог — 'ingN'; поддерживаем оба. */
  ingredientId: number | string;
  /** количество в человеческой единице (unit), всегда > 0 */
  amount: number;
  /** 'г' | 'кг' | 'мл' | 'л' | 'шт' | 'уп' */
  unit: string;
}

/** Клиентский факт (совпадает с ChecklistActual из utils/tripStaging). */
export interface ActualQtyValue {
  amount: number;
  unit: string;
}

/**
 * Ключ локальной карты → серверный id: срезаем trip-scoped суффикс ('ing5::ttrip1' →
 * 'ing5'), числовые id отправляем числом. Пустое значение → null (не отправляем).
 */
export function toServerIngredientId(rawKey: string): number | string | null {
  const base = String(rawKey).includes('::t') ? String(rawKey).split('::t')[0] : String(rawKey);
  const trimmed = base.trim();
  if (trimmed === '') return null;
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/** Базовый id локального ключа — для сопоставления серверных и локальных фактов. */
export function baseIngredientKey(key: string): string {
  const s = String(key);
  return s.includes('::t') ? s.split('::t')[0] : s;
}

/** Можно ли отправить пару на сервер (единственный критерий отправляемости). */
function isSendableValue(value: ActualQtyValue | null | undefined): boolean {
  return !!value
    && Number.isFinite(Number(value.amount))
    && Number(value.amount) > 0
    && typeof value.unit === 'string'
    && value.unit.trim() !== ''
    && value.unit.trim().length <= 16;
}

/**
 * Прочитать серверный набор фактов. null = сервер недоступен/ошибка/формат не тот —
 * вызывающий НЕ должен перезаписывать локальный кэш.
 */
export async function getServerActualQty(tripId: string): Promise<ServerActualQtyItem[] | null> {
  try {
    const data = await api.get<Array<ServerActualQtyItem | null>>(`/trips/${tripId}/checklist-actual-qty`);
    if (!Array.isArray(data)) return null;
    const items: ServerActualQtyItem[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const { ingredientId, amount, unit } = item as ServerActualQtyItem;
      if (ingredientId == null) continue;
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (typeof unit !== 'string' || unit.trim() === '') continue;
      items.push({ ingredientId, amount: value, unit: unit.trim() });
    }
    return items;
  } catch {
    return null;
  }
}

/** Итог отправки набора фактов: что уехало и что отброшено как неотправляемое. */
export interface SyncActualQtyResult {
  /** PUT принят сервером (true) / не выполнен либо отвергнут (false). */
  ok: boolean;
  /** Сколько пар реально ушло в payload. */
  sent: number;
  /** Локальные ключи, которые невозможно отправить (amount ≤ 0, пустая единица, пустой id). */
  rejected: string[];
}

/**
 * Идемпотентно заменить серверный набор фактов (полная замена).
 * Ошибка → `{ ok: false }` (не бросаем): локальный кэш уже сохранён, офлайн-сценарий
 * продолжает работать, набор досылается при появлении сети / следующей загрузке.
 */
export async function syncServerActualQty(
  tripId: string,
  map: Record<string, ActualQtyValue>,
): Promise<SyncActualQtyResult> {
  const items: ServerActualQtyItem[] = [];
  const rejected: string[] = [];
  let sawEntry = false;
  for (const [key, value] of Object.entries(map ?? {})) {
    sawEntry = true;
    const ingredientId = toServerIngredientId(key);
    if (ingredientId == null || !isSendableValue(value)) {
      rejected.push(String(key));
      continue;
    }
    items.push({ ingredientId, amount: Number(value.amount), unit: value.unit.trim() });
  }
  if (rejected.length > 0) {
    console.warn(
      `[checklist-actual-qty] ${rejected.length} unsendable key(s) skipped for trip ${tripId}:`,
      rejected.slice(0, 10),
    );
  }
  if (sawEntry && items.length === 0) {
    // Полная замена пустым набором стёрла бы ВСЕ серверные факты — такую отправку
    // не делаем: набор остаётся dirty и не затирается серверным снимком.
    console.warn(`[checklist-actual-qty] nothing sendable for trip ${tripId} — PUT skipped`);
    return { ok: false, sent: 0, rejected };
  }
  try {
    await api.put(`/trips/${tripId}/checklist-actual-qty`, { items });
    return { ok: true, sent: items.length, rejected };
  } catch (err) {
    const e = err as { status?: number; detail?: string; message?: string; error?: { status?: number; detail?: string } } | null;
    const status = e?.status ?? e?.error?.status;
    const detail = String(e?.detail ?? e?.error?.detail ?? e?.message ?? err ?? 'unknown');
    console.warn(
      `[checklist-actual-qty] PUT failed for trip ${tripId}: ${items.length} item(s), ` +
      `status=${status ?? 'n/a'}, ${detail}`,
    );
    return { ok: false, sent: 0, rejected };
  }
}
