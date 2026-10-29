/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest';
import { deriveTripView, type TripViewInput } from './tripDerived';
import type { TripManualItem } from '../api/tripManualItems';
import type { Trip, Recipe, Price } from '../types/tripDetail';

/**
 * Подзадача 26 аудита (2026-10-29): производные view-модели страницы похода —
 * чистая функция `deriveTripView`. Проверяем инварианты, которые страница и
 * вкладки обязаны сохранять (Release-1.0 UI-consistency, Fix-2/7/8):
 *  - единый источник «Итого» (shoppingTotalFinal = KPI = tripSummary.totalCost);
 *  - факт-цена чека применяется к закупке, дням и «на человека»;
 *  - исключения: глобальные и по-дневные (составной ключ `дата::id`);
 *  - «нет цен» — только про позиции без плановой цены И без чека;
 *  - чеклист/готовность считаются из включённых позиций.
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

function input(over: Partial<TripViewInput> = {}): TripViewInput {
  return {
    trip,
    recipes,
    tripRecipes: [],
    recipesMap: new Map(recipes.map(r => [r.id, r])),
    tripEdits: [],
    prices,
    manualItems: [],
    products: [],
    draftOverrides: {},
    shoppingExcluded: new Set<string>(),
    checklistBought: new Set<string>(),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
    ...over,
  };
}

const rowByName = (rows: { ingredientName: string }[], name: string) =>
  rows.find(r => r.ingredientName === name) as any;

describe('deriveTripView — меню и базовая закупка', () => {
  it('меню по дням: названия, порции и ингредиенты из эффективных рецептов', () => {
    const v = deriveTripView(input());
    expect(v.menuByDays).toHaveLength(2);
    expect(v.menuByDays[0].dayDate).toBe('2026-07-01');
    expect(v.menuByDays[0].effectivePeople).toBe(2);
    const meal = v.menuByDays[0].meals[0];
    expect(meal.recipeName).toBe('Каша');
    expect(meal.servings).toBe(2);
    expect(meal.ingredients.map(i => i.name)).toEqual(['Гречка', 'Без цены']);
    expect(meal.ingredients[0].amount).toBe(1); // baseServings=2, людей=2 — без масштабирования
  });

  it('закупка: агрегат по дням, суммы, «нет цены», единый источник Итого', () => {
    const v = deriveTripView(input());
    expect(v.visibleShopping).toHaveLength(3);
    expect(rowByName(v.visibleShopping, 'Гречка').effectiveCost).toBe(100);
    expect(rowByName(v.visibleShopping, 'Тушёнка').effectiveCost).toBe(50);
    expect(rowByName(v.visibleShopping, 'Без цены').hasPrice).toBe(false);
    expect(v.shoppingTotalFinal).toBe(150);
    // Release-1.0: KPI и «Итого» — ОДИН источник
    expect(v.totalCostFinal).toBe(v.shoppingTotalFinal);
    expect(v.tripSummary.totalCost).toBe(150);
    expect(v.tripSummary.hasMissingPrices).toBe(true);
    expect(v.tripSummary.missingIngredients).toEqual(['Без цены']);
    // Fix-4 (п.11): знаменатель «введено X из Y» — все включённые позиции
    expect(v.factsTotal).toBe(3);
    expect(v.factCount).toBe(0);
  });

  it('«на человека»: суммы и сортировка по алфавиту (U28/U33)', () => {
    const v = deriveTripView(input());
    expect(v.realPeople).toBe(2);
    expect(v.tripSummary.costPerDefaultPerson).toBe(75); // 150 / 2
    expect(v.tripSummary.costPerPersonMeal).toBe(37.5); // 150 / (2 дня × 2 чел.)
    const names = v.personSummary.map(p => p.ingredientName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ru')));
    expect(names).toContain('Гречка');
    expect(rowByName(v.personSummary, 'Гречка').costPerDefaultPerson).toBe(50); // 100 / 2
  });
});

describe('deriveTripView — чек (draftOverrides) и исключения', () => {
  it('факт-цена чека применяется к закупке, «на человека» и счётчику чека (Fix-7/8)', () => {
    const v = deriveTripView(input({ draftOverrides: { i2: { price: 30, total: 0 } } }));
    const t = rowByName(v.visibleShopping, 'Тушёнка');
    expect(t.actualUnitPrice).toBe(30);
    expect(t.effectiveCost).toBe(30); // 30 × 1 шт — факт × текущее количество
    expect(v.shoppingTotalFinal).toBe(130); // 100 + 30
    expect(v.factCount).toBe(1);
    const p = rowByName(v.personSummary, 'Тушёнка');
    expect(p.costPerDefaultPerson).toBe(15); // 30 × (1/2 чел.)
  });

  it('введённый чек делает позицию «с ценой» — «нет цен» её больше не пугает (Fix-7 п.28)', () => {
    const v = deriveTripView(input({ draftOverrides: { i3: { price: 10, total: 0 } } }));
    const row = rowByName(v.visibleShopping, 'Без цены');
    expect(row.hasPrice).toBe(true);
    expect(v.tripSummary.hasMissingPrices).toBe(false);
    expect(v.tripSummary.missingIngredients).toEqual([]);
  });

  it('глобальное исключение: строка видна (зачёркнута), но вне итогов и вне «на человека»', () => {
    const v = deriveTripView(input({ shoppingExcluded: new Set(['i2']) }));
    expect(rowByName(v.visibleShopping, 'Тушёнка').excluded).toBe(true);
    expect(v.includedShoppingFinal.map(i => i.ingredientName)).not.toContain('Тушёнка');
    expect(v.shoppingTotalFinal).toBe(100);
    // calculatePersonSummary получает тот же набор исключений — строка уходит целиком
    expect(v.personSummary.map(p => p.ingredientName)).not.toContain('Тушёнка');
  });

  it('по-дневное исключение `дата::id` снимает количество только этого дня (Fix-2 п.5)', () => {
    const v = deriveTripView(input({ shoppingExcluded: new Set(['2026-07-01::i1']) }));
    // Гречка была только в дне 1 — из агрегата закупки уходит полностью
    expect(v.visibleShopping.map(i => i.ingredientName)).not.toContain('Гречка');
    expect(v.shoppingTotalFinal).toBe(50);
    // день 1: позиция помечена исключённой, dayCost без неё
    const day1 = v.dayShopping.find(dd => dd.dayDate === '2026-07-01')!;
    expect(rowByName(day1.items, 'Гречка').excluded).toBe(true);
    expect(day1.dayCost).toBe(0);
  });
});

describe('deriveTripView — дни, чеклист, готовность, ручные позиции', () => {
  it('закупка по дням: dayCost, алфавит (U27), «есть без цены»', () => {
    const v = deriveTripView(input());
    expect(v.dayShopping).toHaveLength(2);
    const day1 = v.dayShopping.find(dd => dd.dayDate === '2026-07-01')!;
    expect(day1.dayCost).toBe(100);
    expect(day1.hasMissingPrices).toBe(true);
    const names = day1.items.map(i => i.ingredientName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ru')));
  });

  it('чеклист и готовность: шаги «меню/закупка/чек» из включённых позиций (Fix-3)', () => {
    const v = deriveTripView(input());
    expect(v.checklistRowIds).toHaveLength(3);
    expect(v.boughtInList).toBe(0);
    expect(v.readiness.menu).toBe('done');
    expect(v.readiness.shopping).toBe('none');
    expect(v.readiness.checks).toBe('none');
    expect(v.readiness.ready).toBe(false);
  });

  it('готовность «готов» при полностью отмеченном чеклисте и введённых чеках', () => {
    const base = deriveTripView(input());
    const v = deriveTripView(input({
      checklistBought: new Set(base.checklistRowIds),
      draftOverrides: { i1: { price: 90, total: 0 }, i2: { price: 30, total: 0 }, i3: { price: 5, total: 0 } },
    }));
    expect(v.boughtInList).toBe(3);
    expect(v.readiness.shopping).toBe('done');
    expect(v.readiness.checks).toBe('done');
    expect(v.readiness.ready).toBe(true);
  });

  it('ручные позиции U40: к походу — в агрегате по trip-ценам, к дню — в закупке дня', () => {
    const manualItems: TripManualItem[] = [
      { id: 'mm1', tripId: 't1', dayId: null, ingredientId: 'i9', ingredientName: 'Аптечка', unit: 'PCS', amount: 1 },
      { id: 'mm2', tripId: 't1', dayId: 'd1', ingredientId: 'i8', ingredientName: 'Антисептик', unit: 'PCS', amount: 2 },
    ];
    const manualPrices: Price[] = [
      ...prices,
      { id: 'p9', ingredientId: 'i9', pricePerUnit: 200, currency: 'RUB', effectiveFrom: '2026-06-01' },
    ];
    const v = deriveTripView(input({ manualItems, prices: manualPrices }));
    // плановая цена ручной позиции — срез на дату окончания похода (Fix-5 п.11)
    expect(v.manualPriceOf('i9')).toBe(200);
    expect(v.manualPriceOf('i8')).toBeUndefined();
    expect(rowByName(v.visibleShopping, 'Аптечка').effectiveCost).toBe(200);
    expect(v.shoppingTotalFinal).toBe(350); // 150 + 200 (антисептик без цены)
    const day1 = v.dayShopping.find(dd => dd.dayDate === '2026-07-01')!;
    expect(day1.items.map(i => i.ingredientName)).toContain('Антисептик');
  });

  it('опции ручных позиций: справочник продуктов, фолбэк — ингредиенты блюд (U40)', () => {
    const fallback = deriveTripView(input());
    expect(fallback.manualProductOptions.map((o: any) => o.id).sort()).toEqual(['i1', 'i2', 'i3']);
    const products = [{ id: 'i5', name: 'Товар', category: 'Бакалея' }];
    const withProducts = deriveTripView(input({ products }));
    expect(withProducts.manualProductOptions).toEqual(products);
  });

  it('trip-снепшоты блюд не ломают расчёт (snapshotOf → effectiveRecipesMap)', () => {
    const tripRecipes: Recipe[] = [
      { id: 'r1::tt1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [] } as any,
    ];
    (tripRecipes[0] as any).snapshotOf = 'r1';
    const recipesMap = new Map([...recipes, ...tripRecipes].map(r => [r.id, r]));
    const v = deriveTripView(input({ tripRecipes, recipesMap }));
    expect(v.menuByDays[0].meals[0].recipeName).toBe('Каша');
    expect(v.shoppingTotalFinal).toBe(150);
  });

  it('сортировка закупки (U26): sortSpec применяется к видимым строкам', () => {
    const asc = deriveTripView(input());
    const desc = deriveTripView(input({ sortSpec: { field: 'ingredientName', dir: 'desc' } }));
    expect(desc.sortedShopping.map(i => i.ingredientName))
      .toEqual([...asc.sortedShopping.map(i => i.ingredientName)].reverse());
  });
});
