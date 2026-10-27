import { describe, it, expect } from 'vitest';
import { buildEffectiveIngredients, buildEffectiveRecipesMap } from './recipeEdits';
import { calculateShoppingList, calculateMenuByDays } from './calculations';
import type { Trip, TripDay } from '../types';

const ing = (id: string, name: string, amount: number, unit = 'KG') =>
  ({ ingredientId: id, amount, ingredient: { id, name, unit, category: '' } });

describe('recipeEdits (Fix-6, п.22/25) — серверные правки в расчётах', () => {
  it('EXTRA: добавленный продукт появляется как absolute-строка (не масштабируется)', () => {
    const out = buildEffectiveIngredients(
      [ing('ing1', 'Гречка', 0.4)],
      [{ fromIngredientId: null, toIngredientId: 'ing9', added: true, absoluteAmount: 0.015, toIngredientName: 'Имбирь сушёный', toUnit: 'KG' }],
    );
    expect(out).toHaveLength(2);
    const ginger = out.find(r => r.ingredientId === 'ing9')!;
    expect(ginger.absolute).toBe(true);
    expect(ginger.added).toBe(true);
    expect(ginger.amount).toBeCloseTo(0.015);
    expect(ginger.ingredient.name).toBe('Имбирь сушёный');
  });

  it('EXCLUDE: исключённая позиция исчезает из ингредиентов', () => {
    const out = buildEffectiveIngredients(
      [ing('ing1', 'Гречка', 0.4), ing('ing2', 'Соль', 0.01)],
      [{ fromIngredientId: 'ing2', toIngredientId: null, removed: true }],
    );
    expect(out.map(r => r.ingredientId)).toEqual(['ing1']);
  });

  it('SCALE: количество умножается на ratio (остается масштабируемым)', () => {
    const out = buildEffectiveIngredients(
      [ing('ing1', 'Гречка', 0.4)],
      [{ fromIngredientId: 'ing1', toIngredientId: 'ing1', ratio: 1.5 }],
    );
    expect(out[0].amount).toBeCloseTo(0.6);
    expect(out[0].absolute).toBeUndefined();
  });

  it('SUBST: количество переносится на цель × ratio, помечается substitutedFrom', () => {
    const out = buildEffectiveIngredients(
      [ing('ing1', 'Гречка', 0.4), ing('ing3', 'Рис', 0.1)],
      [{ fromIngredientId: 'ing1', toIngredientId: 'ing3', ratio: 1, fromIngredientName: 'Гречка' }],
    );
    expect(out).toHaveLength(1);
    expect(out[0].ingredientId).toBe('ing3');
    expect(out[0].amount).toBeCloseTo(0.5);
    expect(out[0].substitutedFrom).toBe('Гречка');
  });

  it('SUBST на продукт вне рецепта: создаётся строка с единицей цели', () => {
    const out = buildEffectiveIngredients(
      [ing('ing1', 'Гречка', 0.4)],
      [{ fromIngredientId: 'ing1', toIngredientId: 'ing7', ratio: 2, toIngredientName: 'Пшено', toUnit: 'KG' }],
    );
    expect(out[0].ingredientId).toBe('ing7');
    expect(out[0].amount).toBeCloseTo(0.8);
    expect(out[0].ingredient.unit).toBe('KG');
  });

  it('пустые правки — тот же массив', () => {
    const ings = [ing('ing1', 'Гречка', 0.4)];
    expect(buildEffectiveIngredients(ings, [])).toBe(ings);
  });

  it('buildEffectiveRecipesMap: правки матчат снепшот-id рецепта, остальные рецепты не трогает', () => {
    const map = new Map<string, any>([
      ['rec1', { id: 'rec1', baseServings: 2, ingredients: [ing('ing1', 'Гречка', 0.4)] }],
      ['rec2', { id: 'rec2', baseServings: 2, ingredients: [ing('ing2', 'Рис', 0.3)] }],
    ]);
    const out = buildEffectiveRecipesMap(map, [
      { recipeId: 'rec1', fromIngredientId: null, toIngredientId: 'ing9', added: true, absoluteAmount: 0.01, toIngredientName: 'Имбирь', toUnit: 'KG' },
    ]);
    expect(out.get('rec1')!.ingredients).toHaveLength(2);
    expect(out.get('rec2')).toBe(map.get('rec2')); // не тронут
    expect(map.get('rec1')!.ingredients).toHaveLength(1); // исходник не мутирован
  });
});

describe('расчёты с effective-рецептами (Fix-6): «Имбирь попадает в чек»', () => {
  const recipe = {
    id: 'rec1', baseServings: 2,
    ingredients: [ing('ing1', 'Гречка', 0.4)],
  };
  const effective = {
    ...recipe,
    ingredients: buildEffectiveIngredients(recipe.ingredients as any, [
      { fromIngredientId: null, toIngredientId: 'ing9', added: true, absoluteAmount: 0.015, toIngredientName: 'Имбирь сушёный молотый', toUnit: 'KG' },
    ]),
  };
  const map = new Map<string, any>([['rec1', effective]]);
  const day: TripDay = {
    id: 'd1', tripId: 't1', dayDate: '2026-05-01',
    meals: [{ id: 'm1', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'rec1', sortOrder: 1 }],
  };
  const trip: Trip = {
    id: 't1', userId: 'u', name: 'T', startDate: '2026-05-01', endDate: '2026-05-01',
    defaultPeople: 4, createdAt: '', days: [day],
  };
  const prices = [
    { id: 'p1', ingredientId: 'ing1', pricePerUnit: 200, currency: 'RUB', effectiveFrom: '2026-01-01' },
    { id: 'p9', ingredientId: 'ing9', pricePerUnit: 3000, currency: 'RUB', effectiveFrom: '2026-01-01' },
  ] as any;

  it('закупка: EXTRA-позиция в списке с абсолютным количеством и ценой', () => {
    const rows = calculateShoppingList(trip, map, prices);
    const ginger = rows.find(r => r.ingredientId === 'ing9');
    expect(ginger).toBeTruthy();
    expect(ginger!.totalAmount).toBeCloseTo(0.015); // абсолют, не ×4 чел.
    expect(ginger!.estimatedCost).toBeCloseTo(45); // 0.015 × 3000
    const grech = rows.find(r => r.ingredientId === 'ing1')!;
    expect(grech.totalAmount).toBeCloseTo(0.8); // 0.4/2×4 — масштабируется как раньше
  });

  it('меню: EXTRA видна рядом со старыми ингредиентами с флагом added', () => {
    const menu = calculateMenuByDays(trip, map);
    const ings = menu[0].meals[0].ingredients;
    expect(ings.map(i => i.name)).toEqual(['Гречка', 'Имбирь сушёный молотый']);
    const ginger = ings.find(i => i.name.startsWith('Имбирь'))!;
    expect(ginger.added).toBe(true);
    expect(ginger.amount).toBeCloseTo(0.015);
  });
});
