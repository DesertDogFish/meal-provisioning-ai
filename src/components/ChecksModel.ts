/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): чистая view-модель
 * этапа ④ «Чеки и итог». Раньше PriceOverridesTab сам грузил данные и сам
 * считал закупку (дубль пайплайна deriveTripView — суммы ② и ④ могли
 * разъезжаться). Теперь строки чека СТРОЯТСЯ из готовых view-моделей страницы
 * (`view.visibleShopping`, `view.dayShopping`, `view.productInfo`) — одна
 * формула на оба этапа; компонент не делает сетевых запросов вовсе.
 */
import { compareRu } from '../utils/rowSort';
import type { TripView } from '../utils/tripDerived';

/** Строка чека (форма прежнего ShoppingItem из PriceOverridesTab). */
export interface CheckRow {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  plannedUnitPrice?: number;
  /** введённая в чеке цена за единицу (draft/server override); null — не введена */
  enteredUnitPrice: number | null;
  plannedCost?: number;
  /** план/факт-стоимость позиции (факт = effectiveCost из общего пайплайна) */
  actualCost?: number;
  excluded: boolean;
  hasPlannedPrice: boolean;
  manual?: boolean;
}

/** Строки чека из общего view (U41: чек и закупка — по алфавиту). */
export function buildCheckRows(view: TripView): CheckRow[] {
  return view.visibleShopping
    .map((i) => ({
      ingredientId: String(i.ingredientId),
      ingredientName: i.ingredientName,
      unit: i.unit,
      totalAmount: i.totalAmount,
      plannedUnitPrice: i.plannedUnitPrice,
      enteredUnitPrice: i.actualUnitPrice ?? null,
      plannedCost: i.estimatedCost ?? undefined,
      actualCost: i.effectiveCost ?? undefined,
      excluded: i.excluded,
      hasPlannedPrice: i.hasPrice,
      manual: (i as { manual?: boolean }).manual,
    }))
    .sort((a, b) => compareRu(a.ingredientName, b.ingredientName));
}

export interface CheckGroup {
  category: string;
  items: CheckRow[];
}

/** U41 + Fix-6: группы по категориям (категория — из общего productInfo). */
export function groupCheckRows(rows: CheckRow[], view: TripView): CheckGroup[] {
  const groups = new Map<string, CheckRow[]>();
  for (const it of rows) {
    const cat = view.productInfo.get(it.ingredientId)?.category || 'Прочее';
    const list = groups.get(cat) ?? [];
    list.push(it);
    groups.set(cat, list);
  }
  const cats = [...groups.keys()].sort((a, b) => {
    if (a === 'Прочее') return 1;
    if (b === 'Прочее') return -1;
    return compareRu(a, b);
  });
  return cats.map(c => ({ category: c, items: groups.get(c)! }));
}

/** План/факт по дням — из общего dayShopping (dayCost уже с фактами и исключениями). */
export interface DayPlanFact {
  dayDate: string;
  plannedCost: number;
  actualCost: number;
}

export function dayPlanFacts(view: TripView): DayPlanFact[] {
  return view.dayShopping.map(day => ({
    dayDate: day.dayDate,
    plannedCost: day.items
      .filter(i => !i.excluded)
      .reduce((a, i) => a + (i.estimatedCost ?? 0), 0),
    actualCost: day.dayCost,
  }));
}

/** Итоги «Думали/Заплатили» — из тех же строк, что и этапа ② (инвариант сумм). */
export function checkTotals(rows: CheckRow[]): { totalPlanned: number; totalActual: number } {
  let totalPlanned = 0;
  let totalActual = 0;
  for (const r of rows) {
    if (r.excluded) continue;
    totalPlanned += r.plannedCost ?? 0;
    totalActual += r.actualCost ?? 0;
  }
  return { totalPlanned, totalActual };
}

export function calculateDelta(planned?: number | null, actual?: number | null): number {
  if (!planned || !actual || planned === 0) return 0;
  return ((actual - planned) / planned) * 100;
}

export function formatDelta(delta: number): string {
  // «−0,0%» — ноль с минусом после округления; нормализуем в «0%»
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function getDeltaChipClass(delta: number): string {
  if (Math.abs(delta) < 0.001) return 'dim';
  return delta > 0 ? 'fire' : 'ok';
}
