/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.6): модель печатного
 * документа — ЧИСТЫЙ маппинг общих view-моделей `deriveTripView` в строки
 * печати. Раньше TripPrintPage сам считал сырыми калькуляторами
 * (calculateShoppingList / calculateDayShopping / calculatePersonSummary),
 * игнорируя часть пайплайна (серверные оверрайды, серверные исключения) —
 * суммы печати могли разъезжаться с этапом ② и отчётом. Теперь печать,
 * страница похода, этап ④ и отчёт строятся из ОДНОГО источника; расхождение
 * сумм невозможно по построению (критерий п.6).
 */
import type { TripView } from './tripDerived';
import { buildCheckRows, checkTotals, dayPlanFacts } from '../components/ChecksModel';

export interface PrintShoppingRow {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  plannedCost?: number;
  /** факт-стоимость позиции (effectiveCost общего пайплайна; без чека = план) */
  actualCost?: number;
  excluded: boolean;
  manual?: boolean;
  /** чек по позиции ВВЕДЁН — план в документе больше не нужен (Fix-6 п.5) */
  hasFact?: boolean;
}

export interface PrintDayRow {
  dayDate: string;
  people: number;
  planned: number;
  actual: number;
}

export interface PrintKpi {
  totalPlanned: number;
  totalActual: number;
  perPerson: number;
  perPersonMeal: number;
  personMeals: number;
  realPeople: number;
}

export interface PrintModel {
  menu: TripView['menuByDays'];
  shopping: PrintShoppingRow[];
  checklist: TripView['checklist'];
  days: PrintDayRow[];
  kpi: PrintKpi;
}

/** Минимальная форма похода, нужная маппингу (люди по дням). */
export interface PrintTripPeople {
  defaultPeople: number;
  days?: Array<{ dayDate: string; peopleOverride?: number }>;
}

export function buildPrintModel(trip: PrintTripPeople, view: TripView): PrintModel {
  // Закупка: строки — из общего visibleShopping (видимы исключённые — печать
  // честно перечисляет их в сноске «Исключено из закупки»).
  const shopping: PrintShoppingRow[] = view.visibleShopping.map(item => ({
    ingredientId: String(item.ingredientId),
    ingredientName: item.ingredientName,
    unit: item.unit,
    totalAmount: item.totalAmount,
    plannedCost: item.estimatedCost ?? undefined,
    actualCost: item.effectiveCost,
    excluded: item.excluded,
    manual: (item as { manual?: boolean }).manual,
    hasFact: item.actualUnitPrice != null,
  }));

  // По дням: план/факт — dayPlanFacts (тот же dayShopping, что у этапа ②),
  // люди — effectivePeople меню (peopleOverride ?? defaultPeople).
  const facts = dayPlanFacts(view);
  const peopleByDate = new Map(view.menuByDays.map(d => [d.dayDate, d.effectivePeople]));
  const days: PrintDayRow[] = facts.map(f => ({
    dayDate: f.dayDate,
    people: peopleByDate.get(f.dayDate)
      ?? (trip.days ?? []).find(d => d.dayDate === f.dayDate)?.peopleOverride
      ?? trip.defaultPeople,
    planned: f.plannedCost,
    actual: f.actualCost,
  }));

  // KPI: итоги — из тех же строк, что этап ④ (инвариант checkTotals);
  // totalActual — единый shoppingTotalFinal общего пайплайна.
  const totals = checkTotals(buildCheckRows(view));
  const totalActual = view.shoppingTotalFinal;
  const personMeals = view.tripSummary.totalPersonMeals;
  const kpi: PrintKpi = {
    totalPlanned: totals.totalPlanned,
    totalActual,
    perPerson: totalActual / Math.max(1, view.realPeople),
    perPersonMeal: totalActual / Math.max(1, personMeals || 1),
    personMeals,
    realPeople: view.realPeople,
  };

  return { menu: view.menuByDays, shopping, checklist: view.checklist, days, kpi };
}
