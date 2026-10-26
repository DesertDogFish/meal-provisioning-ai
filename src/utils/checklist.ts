/**
 * Патч «UX-список 26.10» (U38): чеклист закупки в упаковках.
 *
 * «Я не могу купить полпачки и грамм соли» — позиции округляются ВВЕРХ до целых
 * упаковок (паритет с backend SummaryService.calculatePacks):
 *   packSize > 0 && roundToPacks → packsToBuy = ceil(needed / packSize),
 *                                  buyAmount = packsToBuy × packSize,
 *                                  leftover = buyAmount − needed.
 * Без фасовки (roundToPacks=false / packSize пуст) — «берём по потребности».
 *
 * Группировка — по категориям (алфавит), внутри категории — алфавит.
 * Категория «Прочее» (позиции без категории) — всегда последняя.
 */
import { compareRu } from './rowSort';

export interface ChecklistSourceRow {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
}

export interface ChecklistProductInfo {
  packSize?: number | null;
  roundToPacks?: boolean | null;
  category?: string | null;
}

export interface ChecklistRow {
  ingredientId: string;
  name: string;
  unit: string;
  /** сколько нужно по расчёту (базовые единицы) */
  needed: number;
  packSize: number | null;
  /** целые упаковки к покупке; null = без фасовки */
  packsToBuy: number | null;
  /** сколько реально будет куплено (базовые единицы) */
  buyAmount: number;
  /** излишек после округления */
  leftover: number;
  category: string;
}

export interface ChecklistGroup {
  category: string;
  rows: ChecklistRow[];
}

export const OTHER_CATEGORY = 'Прочее';

/** Одна позиция чеклиста: расчёт упаковок (эталон — SummaryService.calculatePacks). */
export function toChecklistRow(
  row: ChecklistSourceRow,
  info?: ChecklistProductInfo | null,
): ChecklistRow {
  const packSize = info?.packSize != null && Number(info.packSize) > 0 ? Number(info.packSize) : null;
  const round = !!info?.roundToPacks && packSize != null;
  const packsToBuy = round ? Math.ceil(row.totalAmount / (packSize as number)) : null;
  const buyAmount = round ? (packsToBuy as number) * (packSize as number) : row.totalAmount;
  return {
    ingredientId: String(row.ingredientId),
    name: row.ingredientName,
    unit: row.unit,
    needed: row.totalAmount,
    packSize: round ? packSize : null,
    packsToBuy,
    buyAmount,
    leftover: round ? buyAmount - row.totalAmount : 0,
    category: (info?.category || '').trim() || OTHER_CATEGORY,
  };
}

/** Собрать чеклист: строки → группы по категориям (алфавит, «Прочее» в конце). */
export function buildChecklist(
  rows: ChecklistSourceRow[],
  infoById: Map<string, ChecklistProductInfo>,
): ChecklistGroup[] {
  const byCat = new Map<string, ChecklistRow[]>();
  for (const r of rows) {
    // id в расчёте может быть trip-scoped ('ing5::ttrip1') — информация о фасовке
    // ищется и по полному id, и по базовому
    const base = String(r.ingredientId).includes('::t')
      ? String(r.ingredientId).split('::t')[0]
      : String(r.ingredientId);
    const info = infoById.get(String(r.ingredientId)) ?? infoById.get(base) ?? null;
    const row = toChecklistRow(r, info);
    const list = byCat.get(row.category) ?? [];
    list.push(row);
    byCat.set(row.category, list);
  }
  const cats = [...byCat.keys()].sort((a, b) => {
    if (a === OTHER_CATEGORY) return 1;
    if (b === OTHER_CATEGORY) return -1;
    return compareRu(a, b);
  });
  return cats.map(category => ({
    category,
    rows: byCat.get(category)!.sort((x, y) => compareRu(x.name, y.name)),
  }));
}
