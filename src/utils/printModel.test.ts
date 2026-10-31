/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { deriveTripView, type TripViewInput } from './tripDerived';
import { buildPrintModel } from './printModel';
import { buildCheckRows, checkTotals } from '../components/ChecksModel';
import type { Trip, Recipe, Price } from '../types/tripDetail';

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.6, критерий): суммы
 * печатного документа РАВНЫ суммам общего пайплайна deriveTripView — при любых
 * черновиках чеков, исключениях и peopleOverride. Фикстура — та же, что в
 * tripDerived.test.ts (t1: 2 дня, Гречка i1=100 ₽/кг, Тушёнка i2=50 ₽/шт,
 * «Без цены» i3; defaultPeople=2).
 */

const trip: Trip = {
  id: 't1', userId: 'u1', name: 'Тестовый поход',
  startDate: '2026-07-01', endDate: '2026-07-02', defaultPeople: 2,
  days: [
    { id: 'd1', tripId: 't1', dayDate: '2026-07-01', meals: [
      { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r1', sortOrder: 1 },
    ] },
    { id: 'd2', tripId: 't1', dayDate: '2026-07-02', meals: [
      { id: 'm2', tripDayId: 'd2', mealType: 'DINNER', recipeId: 'r2', sortOrder: 1 },
    ] },
  ],
};

const recipes: Recipe[] = [
  { id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
    { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG' } },
    { ingredientId: 'i3', amount: 2, ingredient: { id: 'i3', name: 'Без цены', unit: 'PCS' } },
  ] },
  { id: 'r2', name: 'Тушёнка', mealType: 'DINNER', baseServings: 2, ingredients: [
    { ingredientId: 'i2', amount: 1, ingredient: { id: 'i2', name: 'Тушёнка', unit: 'PCS' } },
  ] },
];

const prices: Price[] = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
  { id: 'p2', ingredientId: 'i2', pricePerUnit: 50, currency: 'RUB', effectiveFrom: '2026-06-01' },
];

function view(over: Partial<TripViewInput> = {}) {
  return deriveTripView({
    trip, recipes, tripRecipes: [], recipesMap: new Map(recipes.map(r => [r.id, r])),
    tripEdits: [], prices, manualItems: [], products: [],
    draftOverrides: {}, shoppingExcluded: new Set<string>(), checklistBought: new Set<string>(),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
    ...over,
  });
}

describe('buildPrintModel — суммы печати == суммы общего пайплайна (п.6)', () => {
  it('без чеков: план == факт == shoppingTotalFinal == tripSummary.totalCost; KPI совпадают', () => {
    const v = view();
    const m = buildPrintModel(trip, v);

    expect(m.kpi.totalPlanned).toBe(v.shoppingTotalFinal);
    expect(m.kpi.totalActual).toBe(v.shoppingTotalFinal);
    expect(m.kpi.totalActual).toBe(v.tripSummary.totalCost);
    expect(m.kpi.perPerson).toBe(v.tripSummary.costPerDefaultPerson); // 75 = 150/2
    expect(m.kpi.perPersonMeal).toBe(v.tripSummary.costPerPersonMeal); // 37.5 = 150/4
    expect(m.kpi.personMeals).toBe(v.tripSummary.totalPersonMeals);    // 4
    expect(m.kpi.realPeople).toBe(v.realPeople);                       // 2

    // сумма строк закупки документа (невключённые не считаем) == итог пайплайна
    const includedSum = m.shopping.filter(r => !r.excluded).reduce((a, r) => a + (r.actualCost ?? 0), 0);
    expect(includedSum).toBe(v.shoppingTotalFinal);
    // «Думали/Заплатили» по дням документа == общий день
    expect(m.days.map(d => [d.planned, d.actual])).toEqual([[100, 100], [50, 50]]);
    expect(m.days.reduce((a, d) => a + d.actual, 0)).toBe(v.shoppingTotalFinal);
    // ни одна позиция не «с фактом» — документ печатает плановые колонки
    expect(m.shopping.every(r => !r.hasFact)).toBe(true);
  });

  it('черновик чека + исключение: печать == deriveTripView == checkTotals этапа ④', () => {
    const v = view({
      draftOverrides: { i1: { price: 120, total: 0 } },
      shoppingExcluded: new Set<string>(['i2']),
    });
    const m = buildPrintModel(trip, v);
    const totals = checkTotals(buildCheckRows(v));

    // инвариант п.5/п.6: ② == ④ == печать == tripSummary
    expect(totals).toEqual({ totalPlanned: 100, totalActual: 120 });
    expect(m.kpi.totalPlanned).toBe(totals.totalPlanned);
    expect(m.kpi.totalActual).toBe(v.shoppingTotalFinal);
    expect(v.shoppingTotalFinal).toBe(totals.totalActual);
    expect(v.tripSummary.totalCost).toBe(totals.totalActual);
    expect(m.kpi.perPerson).toBe(60); // 120 / 2

    const buckwheat = m.shopping.find(r => r.ingredientId === 'i1')!;
    expect(buckwheat.hasFact).toBe(true);
    expect(buckwheat.actualCost).toBe(120); // факт-цена 120 ₽/кг × 1 кг
    expect(buckwheat.plannedCost).toBe(100);

    const stew = m.shopping.find(r => r.ingredientId === 'i2')!;
    expect(stew.excluded).toBe(true);
    // исключённая позиция не попадает в чеклист документа
    const checklistNames = m.checklist.flatMap(g => g.rows.map(r => r.name));
    expect(checklistNames).not.toContain('Тушёнка');
    expect(checklistNames).toContain('Гречка');

    // дни: d1 — факт 120 (чек), d2 — исключён → 0/0
    expect(m.days).toEqual([
      { dayDate: '2026-07-01', people: 2, planned: 100, actual: 120 },
      { dayDate: '2026-07-02', people: 2, planned: 0, actual: 0 },
    ]);
    expect(m.days.reduce((a, d) => a + d.actual, 0)).toBe(v.shoppingTotalFinal);
  });

  it('peopleOverride попадает в «людей» дня печати (из effectivePeople меню)', () => {
    const tripOv: Trip = {
      ...trip,
      days: [
        { ...trip.days![0], peopleOverride: 4 },
        trip.days![1],
      ],
    };
    const v = view({ trip: tripOv });
    const m = buildPrintModel(tripOv, v);
    expect(m.days[0].people).toBe(4);
    expect(m.days[1].people).toBe(2);
    expect(m.kpi.realPeople).toBe(v.realPeople); // среднее (4+2)/2 = 3
    expect(m.kpi.realPeople).toBe(3);
  });
});
