/// <reference types="vitest/globals" />
/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): view-модель этапа ④
 * строится из общего deriveTripView. Ключевой критерий плана: «суммы ② и ④
 * идентичны на фикстуре с исключениями и ручными позициями» — здесь юнит-тест
 * этого инварианта (раньше ④ считал закупку своей копией пайплайна).
 */
import { describe, it, expect } from 'vitest';
import { deriveTripView, type TripViewInput } from '../utils/tripDerived';
import {
  buildCheckRows, groupCheckRows, dayPlanFacts, checkTotals,
  calculateDelta, formatDelta, getDeltaChipClass,
  hasEnteredFacts, rowHasFact,
} from './ChecksModel';
import type { TripManualItem } from '../api/tripManualItems';
import type { Trip, Recipe, Price } from '../types/tripDetail';

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
    { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG', category: 'Крупы' } },
    { ingredientId: 'i3', amount: 2, ingredient: { id: 'i3', name: 'Без цены', unit: 'PCS', category: 'Прочее' } },
  ] },
  { id: 'r2', name: 'Тушёнка', mealType: 'DINNER', baseServings: 2, ingredients: [
    { ingredientId: 'i2', amount: 1, ingredient: { id: 'i2', name: 'Тушёнка', unit: 'PCS', category: 'Консервы' } },
  ] },
];

const prices: Price[] = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
  { id: 'p2', ingredientId: 'i2', pricePerUnit: 50, currency: 'RUB', effectiveFrom: '2026-06-01' },
];

const manualItems: TripManualItem[] = [
  { id: 'mi1', tripId: 't1', dayId: null, ingredientId: 'i9', ingredientName: 'Аптечка', unit: 'PCS', amount: 1 },
];

function input(over: Partial<TripViewInput> = {}): TripViewInput {
  return {
    trip,
    recipes,
    tripRecipes: [],
    recipesMap: new Map(recipes.map(r => [r.id, r])),
    tripEdits: [],
    prices,
    manualItems,
    products: [],
    draftOverrides: {},
    shoppingExcluded: new Set<string>(),
    checklistBought: new Set<string>(),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
    ...over,
  };
}

describe('ChecksModel — строки этапа ④ из общей view (cleanup-п.5)', () => {
  it('buildCheckRows: алфавит, все позиции (включая исключённые и ручные)', () => {
    const v = deriveTripView(input({ shoppingExcluded: new Set(['i2']) }));
    const rows = buildCheckRows(v);
    expect(rows.map(r => r.ingredientName)).toEqual(['Аптечка', 'Без цены', 'Гречка', 'Тушёнка']);
    expect(rows.find(r => r.ingredientName === 'Тушёнка')!.excluded).toBe(true);
    expect(rows.find(r => r.ingredientName === 'Аптечка')!.manual).toBe(true);
  });

  it('ИНВАРИАНТ: суммы ② и ④ идентичны (исключения + ручные позиции + чек)', () => {
    const v = deriveTripView(input({
      shoppingExcluded: new Set(['i2']),
      draftOverrides: { i1: { price: 120, total: 120 } }, // факт-цена гречки
    }));
    const rows = buildCheckRows(v);
    const totals = checkTotals(rows);
    // ④ «Заплатили» == ② «Итого» == KPI tripSummary.totalCost — один пайплайн
    expect(totals.totalActual).toBe(v.shoppingTotalFinal);
    expect(totals.totalActual).toBe(v.tripSummary.totalCost);
    // план ④ = сумма плановых стоимостей включённых (100 гречка + 0 без цены + аптечка без цены)
    expect(totals.totalPlanned).toBe(100);
    // факт: гречка 120 (draft), тушёнка исключена, остальные без цены → план
    expect(totals.totalActual).toBe(120);
  });

  it('groupCheckRows: категории из общего productInfo, «Прочее» — последняя', () => {
    const v = deriveTripView(input());
    const groups = groupCheckRows(buildCheckRows(v), v);
    const cats = groups.map(g => g.category);
    expect(cats[cats.length - 1]).toBe('Прочее');
    expect(cats).toContain('Крупы');
  });

  it('dayPlanFacts: план/факт по дням из общего dayShopping', () => {
    const v = deriveTripView(input({ draftOverrides: { i1: { price: 200, total: 200 } } }));
    const days = dayPlanFacts(v);
    expect(days).toHaveLength(2);
    const day1 = days.find(d => d.dayDate === '2026-07-01')!;
    expect(day1.plannedCost).toBe(100); // гречка по плану
    expect(day1.actualCost).toBe(200);  // гречка по факту
  });

  it('дельта: расчёт, формат (−0,0% → 0%), класс чипа', () => {
    expect(calculateDelta(100, 120)).toBeCloseTo(20);
    expect(calculateDelta(0, 120)).toBe(0);
    expect(formatDelta(-0.04)).toBe('0%');
    expect(formatDelta(20)).toBe('+20,0%');
    expect(getDeltaChipClass(0)).toBe('dim');
    expect(getDeltaChipClass(5)).toBe('fire');
    expect(getDeltaChipClass(-5)).toBe('ok');
  });
});

/**
 * UX-осмотр 31.10 (п.10): «честный факт». До первого введённого чека факт —
 * это копия плана (effectiveCost фолбэчится в estimatedCost), поэтому UI
 * показывал «Факт = План» и «+0%», как будто деньги уже посчитаны. Модель
 * отдаёт признак «факт действительно введён» — по позициям и по дням.
 */
describe('ChecksModel — честный факт (UX-осмотр 31.10, п.10)', () => {
  it('hasEnteredFacts: false, пока ни один чек не введён', () => {
    const v = deriveTripView(input());
    expect(hasEnteredFacts(buildCheckRows(v))).toBe(false);
  });

  it('hasEnteredFacts/rowHasFact: true после первой введённой факт-цены', () => {
    const v = deriveTripView(input({ draftOverrides: { i1: { price: 120, total: 120 } } }));
    const rows = buildCheckRows(v);
    expect(hasEnteredFacts(rows)).toBe(true);
    expect(rowHasFact(rows.find(r => r.ingredientName === 'Гречка')!)).toBe(true);
    expect(rowHasFact(rows.find(r => r.ingredientName === 'Тушёнка')!)).toBe(false);
  });

  it('исключённая позиция с фактом не считается введённым чеком', () => {
    const v = deriveTripView(input({
      draftOverrides: { i2: { price: 60, total: 60 } },
      shoppingExcluded: new Set(['i2']),
    }));
    expect(hasEnteredFacts(buildCheckRows(v))).toBe(false);
  });

  it('dayPlanFacts.hasFact: день с чеком — true, день без чека — false', () => {
    const v = deriveTripView(input({ draftOverrides: { i1: { price: 200, total: 200 } } }));
    const days = dayPlanFacts(v);
    expect(days.find(d => d.dayDate === '2026-07-01')!.hasFact).toBe(true);
    expect(days.find(d => d.dayDate === '2026-07-02')!.hasFact).toBe(false);
  });
});
