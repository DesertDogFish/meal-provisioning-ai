/**
 * Unit-тесты чистой расчётной математики src/utils/calculations.ts.
 *
 * Зачем: coverage-гейт R5 (PLAN.md, Фаза 10 п.5) требует lines ≥80% на зоне
 * изменения; calculations.ts — ядро бизнес-логики (список покупок, стоимость,
 * ккал), ранее покрытый только баг-тестом calculateShoppingList (30%).
 *
 * Каскад приоритетов людей (meal > day > trip) и выбор цены по effectiveFrom —
 * это правила из ТЗ, фиксируем их как исполняемые спецификации.
 */
import { describe, it, expect } from 'vitest';
import type { IngredientPrice, Trip, TripDay } from '../types';
import {
  getEffectivePeople,
  calculateAmountPerPerson,
  findPriceForDate,
  formatAmount,
  calculateMenuByDays,
  calculateShoppingList,
  calculateDayShopping,
  calculatePersonSummary,
  shoppingPlannedTotal,
  realTripPeople,
  isRowExcluded,
} from './calculations';

// ---------- фикстуры ----------

const ING_BREAD = { id: 'ing-bread', name: 'Хлеб', unit: 'KG' as const, kcalPer100g: 250, pieceWeightG: null };
const ING_EGG = { id: 'ing-egg', name: 'Яйцо', unit: 'PCS' as const, kcalPer100g: 155, pieceWeightG: 60 };

const RECIPE_OMELET = {
  baseServings: 2,
  ingredients: [
    { ingredientId: 'ing-egg', ingredient: ING_EGG, amount: 4 }, // 2 яйца/порция
    // FIX (T0, зелёный main): контракт единиц — KG/L хранят БАЗОВЫЕ единицы
    // (кг/л), как в calc.test.ts (KCAL-01: 0.08 KG), backend KcalCalculator и
    // фикстурах contract.test.ts (гречка 1.8 KG). Раньше было `200` («граммы»),
    // что давало расхождение ×1000 в CR-тесте ккал (250186 вместо 436).
    { ingredientId: 'ing-bread', ingredient: ING_BREAD, amount: 0.2 }, // 0.2 кг = 200 г/порция (цена ₽/кг)
  ],
};

function makeTrip(days: TripDay[], defaultPeople = 4): Trip {
  return {
    id: 'trip-1',
    userId: 'u1',
    name: 'Поход',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    defaultPeople,
    createdAt: '2026-05-01',
    days,
  };
}

const day1: TripDay = {
  id: 'd1',
  tripId: 'trip-1',
  dayDate: '2026-05-01',
  meals: [{ id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST' as const, recipeId: 'r-omelet', sortOrder: 1 }],
};

const recipesMap = new Map<string, any>([['r-omelet', RECIPE_OMELET]]);

const PRICES: IngredientPrice[] = [
  { id: 'p1', ingredientId: 'ing-egg', pricePerUnit: 12, currency: 'RUB', effectiveFrom: '2026-01-01' },
  { id: 'p2', ingredientId: 'ing-egg', pricePerUnit: 15, currency: 'RUB', effectiveFrom: '2026-04-01' },
  { id: 'p3', ingredientId: 'ing-bread', pricePerUnit: 200, currency: 'RUB', effectiveFrom: '2026-04-15' },
];

// ---------- простые функции ----------

describe('getEffectivePeople — каскад overrides', () => {
  const trip = makeTrip([]);
  const day: TripDay = { id: 'd', tripId: 't', dayDate: '2026-05-01', peopleOverride: 6, meals: [] };
  const meal = { id: 'm', tripDayId: 'd', mealType: 'BREAKFAST' as const, recipeId: 'r', sortOrder: 1, peopleOverride: 8 };

  it('без override’ов — defaultPeople поездки', () => {
    expect(getEffectivePeople(trip, { id: 'x', tripId: 't', dayDate: '2026-05-01' })).toBe(4);
  });
  it('override дня важнее default поездки', () => {
    expect(getEffectivePeople(trip, day)).toBe(6);
  });
  it('override приёма пищи важнее override дня (правило каскада)', () => {
    expect(getEffectivePeople(trip, day, meal)).toBe(8);
  });
});

describe('calculateAmountPerPerson — масштабирование по порциям', () => {
  it('4 шт на 2 порции → 10 порций = 20 шт', () => {
    expect(calculateAmountPerPerson(4, 2, 10)).toBe(20);
  });
  it('обратная масштабируемость: people=baseServings сохраняет amount', () => {
    expect(calculateAmountPerPerson(0.2, 2, 2)).toBeCloseTo(0.2);
  });
});

describe('findPriceForDate — выбор актуальной цены', () => {
  it('берёт последнюю цену с effectiveFrom <= date', () => {
    const eggPrices = PRICES.filter(p => p.ingredientId === 'ing-egg');
    expect(findPriceForDate(eggPrices, '2026-05-01')!.pricePerUnit).toBe(15);
    expect(findPriceForDate(eggPrices, '2026-02-01')!.pricePerUnit).toBe(12);
  });
  it('нет цены до даты → undefined', () => {
    expect(findPriceForDate(PRICES.filter(p => p.ingredientId === 'ing-bread'), '2026-01-01')).toBeUndefined();
  });
  it('пустой список цен → undefined', () => {
    expect(findPriceForDate([], '2026-05-01')).toBeUndefined();
  });
});

describe('formatAmount — humanize единиц измерения', () => {
  // Release-1.0 (UI-consistency): единый формат — запятая и адаптивная точность
  // («1,5 кг», а не legacy «1.50 кг» через точку).
  it('KG: <1 → граммы, >=1 → кг через запятую', () => {
    expect(formatAmount(0.8, 'KG')).toBe('800 г');
    expect(formatAmount(1.5, 'KG')).toBe('1,5 кг');
  });
  it('L: <1 → мл, >=1 → л', () => {
    expect(formatAmount(0.25, 'L')).toBe('250 мл');
    expect(formatAmount(2, 'L')).toBe('2 л');
  });
  it('PCS/PACK: округление до целых шт/уп', () => {
    expect(formatAmount(5.6, 'PCS')).toBe('6 шт');
    expect(formatAmount(1.4, 'PACK')).toBe('1 уп');
  });
  it('неизвестная единица — через запятую, единица сохраняется', () => {
    expect(formatAmount(3.2, 'TLSP')).toBe('3,2 TLSP');
  });
});

// ---------- агрегаты ----------

describe('calculateMenuByDays', () => {
  it('trip без дней → пустой массив', () => {
    expect(calculateMenuByDays(makeTrip([]), recipesMap)).toEqual([]);
  });
  it('считает per-person количества и пробрасывает unknown-рецепт', () => {
    const menu = calculateMenuByDays(makeTrip([day1]), recipesMap);
    expect(menu).toHaveLength(1);
    expect(menu[0].effectivePeople).toBe(4);
    const meal = menu[0].meals[0];
    expect(meal.recipeName).toBe('Unknown'); // name не задан в рецепте → Unknown
    expect(meal.ingredients.find(i => i.name === 'Яйцо')!.amount).toBe(8); // 2*4
    expect(meal.ingredients.find(i => i.name === 'Хлеб')!.amount).toBeCloseTo(0.4); // 0.2 кг × (4/2 порции) = 0.4 кг = 400 г
  });
});

describe('calculateShoppingList', () => {
  it('trip без дней → пусто', () => {
    expect(calculateShoppingList(makeTrip([]), recipesMap, PRICES)).toEqual([]);
  });
  it('агрегирует ингредиент по дням и копит стоимость по цене каждой даты', () => {
    const day2: TripDay = { ...day1, id: 'd2', dayDate: '2026-05-02' };
    const list = calculateShoppingList(makeTrip([day1, day2]), recipesMap, PRICES);
    const eggs = list.find(i => i.ingredientId === 'ing-egg')!;
    expect(eggs.totalAmount).toBe(16); // 8 яиц в день × 2 дня
    expect(eggs.estimatedCost).toBeCloseTo(240); // 8×15 + 8×15
    expect(eggs.hasPrice).toBe(true);
  });
  it('рецепт отсутствует в map → пропускается без падения', () => {
    const orphan: TripDay = { ...day1, meals: [{ ...day1.meals![0], recipeId: 'nope' }] };
    expect(calculateShoppingList(makeTrip([orphan]), recipesMap, PRICES)).toEqual([]);
  });
  it('нет цены → hasPrice=false, estimatedCost undefined', () => {
    const noPrices = calculateShoppingList(makeTrip([day1]), recipesMap, []);
    expect(noPrices.every(i => !i.hasPrice && i.estimatedCost === undefined)).toBe(true);
  });
});

describe('calculateDayShopping', () => {
  it('разносит покупки по дням с дневной стоимостью', () => {
    const day2: TripDay = { ...day1, id: 'd2', dayDate: '2026-05-02' };
    const res = calculateDayShopping(makeTrip([day1, day2]), recipesMap, PRICES);
    expect(res).toHaveLength(2);
    expect(res[0].dayCost).toBeCloseTo(8 * 15 + 0.4 * 200); // яйца 8шт×15₽ + хлеб 400г×200₽/кг=80₽
    expect(res[0].hasMissingPrices).toBe(false);
  });
  it('день без цены → hasMissingPrices=true', () => {
    const res = calculateDayShopping(makeTrip([day1]), recipesMap, []);
    expect(res[0].hasMissingPrices).toBe(true);
    expect(res[0].dayCost).toBe(0);
  });
  it('trip без дней → пусто', () => {
    expect(calculateDayShopping(makeTrip([]), recipesMap, PRICES)).toEqual([]);
  });
});

describe('calculatePersonSummary', () => {
  it('итоги поездки: стоимость на человека и на приём пищи', () => {
    const { summary, tripSummary } = calculatePersonSummary(makeTrip([day1]), recipesMap, PRICES);
    const dayCost = 8 * 15 + 0.4 * 200; // 120 + 80 = 200 (400 г → 0.4 кг × 200 ₽/кг)
    expect(tripSummary.totalCost).toBeCloseTo(dayCost);
    expect(tripSummary.costPerDefaultPerson).toBeCloseTo(dayCost / 4);
    expect(tripSummary.totalPersonMeals).toBe(4);
    expect(tripSummary.costPerPersonMeal).toBeCloseTo(dayCost / 4);
    const eggRow = summary.find(s => s.ingredientName === 'Яйцо')!;
    expect(eggRow.amountPerDefaultPerson).toBe(2); // 8/4
  });

  it('CR-1: ккал на приём пищи считается через calculateKcal (PCS через pieceWeight)', () => {
    const { tripSummary } = calculatePersonSummary(makeTrip([day1]), recipesMap, PRICES);
    // Яйца: 8 кг-экв? нет: 8 шт × 60г = 480г → 480/100×155 = 744 ккал
    // Хлеб: 0.4 кг = 400г → 400/100×250 = 1000 ккал. Всего 1744 на 4 person-meals.
    expect(tripSummary.caloriesPerPersonMeal).toBeCloseTo((744 + 1000) / 4);
  });

  it('ингредиент без kcalPer100g → калории не считаются (сумма остаётся 0)', () => {
    const recipeNoKcal = {
      baseServings: 2,
      ingredients: [{ ingredientId: 'ing-x', ingredient: { id: 'ing-x', name: 'Что-то', unit: 'PCS' as const }, amount: 2 }],
    };
    const map = new Map<string, any>([['r', recipeNoKcal]]);
    const d: TripDay = { ...day1, meals: [{ ...day1.meals![0], recipeId: 'r' }] };
    const { tripSummary } = calculatePersonSummary(makeTrip([d]), map, []);
    // hasAllKcal=false → totalCalories не пополняется; на выходе 0 person-meal ккал.
    expect(tripSummary.caloriesPerPersonMeal).toBe(0);
  });

  it('нет цен → hasMissingPrices=true со списком ингредиентов', () => {
    const { tripSummary } = calculatePersonSummary(makeTrip([day1]), recipesMap, []);
    expect(tripSummary.hasMissingPrices).toBe(true);
    expect(tripSummary.missingIngredients).toEqual(expect.arrayContaining(['Яйцо', 'Хлеб']));
  });
});

// ---------- Release-1.0 (UI-consistency): единая формула плановой суммы ----------

describe('shoppingPlannedTotal — ОДНА формула плановой суммы закупки', () => {
  const items = [
    { ingredientId: '1', ingredientName: 'Гречка', unit: 'KG', totalAmount: 2, estimatedCost: 100, hasPrice: true },
    { ingredientId: '2', ingredientName: 'Тушёнка', unit: 'PCS', totalAmount: 3, estimatedCost: 50.4, hasPrice: true },
    { ingredientId: '3', ingredientName: 'Без цены', unit: 'PCS', totalAmount: 1, hasPrice: false },
  ] as any;

  it('суммирует estimatedCost; позиции без цены дают 0', () => {
    expect(shoppingPlannedTotal(items)).toBeCloseTo(150.4);
  });

  it('исключённые позиции (soft-disable) не входят в сумму — KPI не спорит с «Итого»', () => {
    expect(shoppingPlannedTotal(items, new Set(['1']))).toBeCloseTo(50.4);
    expect(shoppingPlannedTotal(items, new Set(['1', '2', '3']))).toBe(0);
  });
});

// ---------- U33 (список 26.10): «на человека» — по реальному количеству людей ----------

describe('realTripPeople — реальное число людей похода (U33)', () => {
  it('без дней и без override’ов — defaultPeople', () => {
    expect(realTripPeople(makeTrip([]))).toBe(4);
  });

  it('без override’ов — среднее равно defaultPeople (обратная совместимость)', () => {
    const trip = makeTrip([
      { id: 'd1', tripId: 'trip-1', dayDate: '2026-05-01', meals: [] },
      { id: 'd2', tripId: 'trip-1', dayDate: '2026-05-02', meals: [] },
    ]);
    expect(realTripPeople(trip)).toBe(4);
  });

  it('peopleOverride дней учитывается: (2+6)/2 = 4', () => {
    const trip = makeTrip([
      { id: 'd1', tripId: 'trip-1', dayDate: '2026-05-01', peopleOverride: 2, meals: [] },
      { id: 'd2', tripId: 'trip-1', dayDate: '2026-05-02', peopleOverride: 6, meals: [] },
    ]);
    expect(realTripPeople(trip)).toBe(4);
  });

  it('override только одного дня: (3+4)/2 = 3.5', () => {
    const trip = makeTrip([
      { id: 'd1', tripId: 'trip-1', dayDate: '2026-05-01', peopleOverride: 3, meals: [] },
      { id: 'd2', tripId: 'trip-1', dayDate: '2026-05-02', meals: [] },
    ]);
    expect(realTripPeople(trip)).toBe(3.5);
  });
});

describe('calculatePersonSummary с реальным числом людей (U33)', () => {
  it('day-override 2 чел.: «на человека» делится на 2, а не на defaultPeople=4', () => {
    const day: TripDay = {
      id: 'd1', tripId: 'trip-1', dayDate: '2026-05-01', peopleOverride: 2,
      meals: [{ id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r-omelet', sortOrder: 1 }],
    };
    const { summary, tripSummary } = calculatePersonSummary(makeTrip([day]), recipesMap, PRICES);
    // омлет: 4 яйца/2 порции × 2 чел. = 4 шт; хлеб 0.2/2×2 = 0.2 кг
    const egg = summary.find(s => s.ingredientName === 'Яйцо')!;
    expect(egg.amountPerDefaultPerson).toBeCloseTo(4 / 2); // /2 чел., а не /4
    // стоимость: яйца по цене 15 (05-01 ≥ 04-01): 4×15=60; хлеб 0.2×200=40 → итого 100
    expect(tripSummary.costPerDefaultPerson).toBeCloseTo(100 / 2);
  });

  it('явный параметр realPeople переопределяет среднее по дням', () => {
    const { tripSummary } = calculatePersonSummary(makeTrip([day1]), recipesMap, PRICES, 10);
    // день без override: 4 чел. → 8 яиц ×15 = 120 + 0.4 кг хлеба ×200 = 80 → 200
    expect(tripSummary.costPerDefaultPerson).toBeCloseTo(200 / 10);
  });
});

// ---------- Fix-2 (список 26.10, п.5): по-дневные исключения ----------

describe('по-дневные исключения (Fix-2)', () => {
  // Два дня, один и тот же рецепт: 4 яйца/2 порции × 4 чел. = 8 яиц в день
  const mkDay = (id: string, date: string): TripDay => ({
    id, tripId: 'trip-1', dayDate: date,
    meals: [{ id: `m-${id}`, tripDayId: id, mealType: 'BREAKFAST', recipeId: 'r-omelet', sortOrder: 1 }],
  });
  const trip2 = makeTrip([mkDay('d1', '2026-05-01'), mkDay('d2', '2026-05-02')]);

  it('глобальный ключ исключает позицию во всех днях (прежнее поведение)', () => {
    const days = calculateDayShopping(trip2, recipesMap, PRICES, new Set(['ing-egg']));
    for (const d of days) {
      expect(d.items.find(i => i.ingredientId === 'ing-egg')).toBeUndefined();
    }
    const total = calculateShoppingList(trip2, recipesMap, PRICES, new Set(['ing-egg']));
    expect(total.find(i => i.ingredientId === 'ing-egg')).toBeUndefined();
  });

  it('ключ «день::продукт» исключает позицию ТОЛЬКО в этот день', () => {
    const days = calculateDayShopping(trip2, recipesMap, PRICES, new Set(['2026-05-01::ing-egg']));
    const d1 = days.find(d => d.dayDate === '2026-05-01')!;
    const d2 = days.find(d => d.dayDate === '2026-05-02')!;
    expect(d1.items.find(i => i.ingredientId === 'ing-egg')).toBeUndefined();
    expect(d2.items.find(i => i.ingredientId === 'ing-egg')!.totalAmount).toBeCloseTo(8);
  });

  it('агрегат закупки уменьшается только на количество исключённого дня', () => {
    // без исключений: 16 яиц (8+8); с исключением дня d1: 8
    const full = calculateShoppingList(trip2, recipesMap, PRICES);
    expect(full.find(i => i.ingredientId === 'ing-egg')!.totalAmount).toBeCloseTo(16);
    const partial = calculateShoppingList(trip2, recipesMap, PRICES, new Set(['2026-05-01::ing-egg']));
    expect(partial.find(i => i.ingredientId === 'ing-egg')!.totalAmount).toBeCloseTo(8);
    // стоимость пересчитана: яйца d2 по цене 15 (май) → 8×15=120 (вместо 240)
    expect(partial.find(i => i.ingredientId === 'ing-egg')!.estimatedCost).toBeCloseTo(120);
  });

  it('person-сводка учитывает по-дневные исключения (инвариант сумм)', () => {
    const { summary } = calculatePersonSummary(trip2, recipesMap, PRICES, 4, new Set(['2026-05-01::ing-egg']));
    const egg = summary.find(s => s.ingredientName === 'Яйцо')!;
    expect(egg.amountPerDefaultPerson).toBeCloseTo(8 / 4);
  });

  it('isRowExcluded: пустое множество — ничего не исключено', () => {
    expect(isRowExcluded(undefined, '2026-05-01', 'x')).toBe(false);
    expect(isRowExcluded(new Set(), '2026-05-01', 'x')).toBe(false);
    expect(isRowExcluded(new Set(['2026-05-01::x']), '2026-05-01', 'x')).toBe(true);
    expect(isRowExcluded(new Set(['2026-05-01::x']), '2026-05-02', 'x')).toBe(false);
  });
});

// ---------- Fix-5 (п.7): ручные позиции в «на человека» ----------

describe('calculatePersonSummary с ручными позициями (Fix-5)', () => {
  it('аптечка к походу входит в стоимость на человека', () => {
    const manual = [{
      id: 'mi1', tripId: 'trip-1', dayId: null,
      ingredientId: 'ing-med', ingredientName: 'Аптечка', unit: 'PCS' as const, amount: 2,
    }];
    const priceOf = (id: string) => (id === 'ing-med' ? 300 : undefined);
    const { summary, tripSummary } = calculatePersonSummary(
      makeTrip([day1]), recipesMap, PRICES, 4, undefined, manual, priceOf,
    );
    const med = summary.find(p => p.ingredientName === 'Аптечка');
    expect(med).toBeTruthy();
    // 2 шт × 300 ₽ = 600 ₽; на человека (4) = 150
    expect(med!.costPerDefaultPerson).toBeCloseTo(150);
    // общая стоимость увеличилась на 600 (омлет на 4 чел.: 8 яиц×15=120 + 0.4кг×200=80 → 200)
    expect(tripSummary.totalCost).toBeCloseTo(800);
    expect(tripSummary.costPerDefaultPerson).toBeCloseTo(200);
  });
});
