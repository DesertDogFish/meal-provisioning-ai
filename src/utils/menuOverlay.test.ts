import { describe, it, expect } from 'vitest';
import {
  stripSnapshotSuffix,
  editMatchesRecipe,
  classifyEdits,
  overlayEditsOnIngredients,
} from './menuOverlay';

const ing = (id: string, name: string, amount: number, unit = 'KG') =>
  ({ ingredientId: id, name, amount, unit });

describe('menuOverlay (U30) — правки состава видны в карточке приёма', () => {
  it('stripSnapshotSuffix: trip-scoped id → базовый', () => {
    expect(stripSnapshotSuffix('ing5::ttrip1')).toBe('ing5');
    expect(stripSnapshotSuffix('ing5')).toBe('ing5');
    expect(stripSnapshotSuffix(null)).toBe('');
  });

  it('editMatchesRecipe: каталожный id правки матчит снепшот-рецепт и через snapshotOf', () => {
    const edit = { recipeId: 'rec1' };
    expect(editMatchesRecipe(edit, 'rec1')).toBe(true);
    expect(editMatchesRecipe(edit, 'rec1::ttrip1')).toBe(true);
    // real-режим: числовой id копии, snapshotOf указывает на оригинал
    expect(editMatchesRecipe({ recipeId: '101' }, '55', new Map([['55', '101']]))).toBe(true);
    expect(editMatchesRecipe(edit, 'rec2')).toBe(false);
  });

  it('classifyEdits: added→EXTRA, to=null→EXCLUDE, from==to→SCALE, иначе SUBST', () => {
    const c = classifyEdits([
      { fromIngredientId: null, toIngredientId: 'ing9', added: true, absoluteAmount: 0.005 },
      { fromIngredientId: 'ing1', toIngredientId: null, removed: true },
      { fromIngredientId: 'ing2', toIngredientId: 'ing2', ratio: 1.5 },
      { fromIngredientId: 'ing3', toIngredientId: 'ing4', ratio: 2 },
    ]);
    expect(c.extras).toHaveLength(1);
    expect(c.excluded.has('ing1')).toBe(true);
    expect(c.scaleRatios.get('ing2')).toBe(1.5);
    expect(c.substitutions[0]).toMatchObject({ from: 'ing3', to: 'ing4', ratio: 2 });
  });

  it('EXTRA: добавленный продукт появляется рядом со старыми ингредиентами', () => {
    const ings = [ing('ing1', 'Гречка', 0.4), ing('ing12', 'Соль', 0.01)];
    const out = overlayEditsOnIngredients(ings, [
      { fromIngredientId: null, toIngredientId: 'ing9', added: true, absoluteAmount: 0.005, toIngredientName: 'Сахар', toUnit: 'KG' },
    ], 4);
    expect(out.map(i => i.name)).toEqual(['Гречка', 'Соль', 'Сахар']);
    const added = out.find(i => i.name === 'Сахар')!;
    expect(added.added).toBe(true);
    expect(added.amount).toBeCloseTo(0.005);
    // старые позиции не тронуты
    expect(out[0].amount).toBeCloseTo(0.4);
  });

  it('EXTRA c amountPerServing (V21: абсолют на приём) — НЕ масштабируется на людей', () => {
    const out = overlayEditsOnIngredients([ing('ing1', 'Гречка', 0.4)], [
      { fromIngredientId: null, toIngredientId: 'ing9', added: true, amountPerServing: 0.05, toIngredientName: 'Сгущёнка' },
    ], 6);
    expect(out.find(i => i.added)!.amount).toBeCloseTo(0.05);
  });

  it('EXCLUDE: исключённый продукт исчезает из карточки', () => {
    const ings = [ing('ing1', 'Гречка', 0.4), ing('ing12', 'Соль', 0.01)];
    const out = overlayEditsOnIngredients(ings, [
      { fromIngredientId: 'ing12', toIngredientId: null, removed: true },
    ], 4);
    expect(out.map(i => i.name)).toEqual(['Гречка']);
  });

  it('SCALE: количество умножается на ratio', () => {
    const out = overlayEditsOnIngredients([ing('ing1', 'Гречка', 0.4)], [
      { fromIngredientId: 'ing1', toIngredientId: 'ing1', ratio: 1.5 },
    ], 4);
    expect(out[0].amount).toBeCloseTo(0.6);
  });

  it('SUBST: количество переносится на цель × ratio, цель получает substitutedFrom', () => {
    const ings = [ing('ing1', 'Гречка', 0.4), ing('ing3', 'Рис', 0.1)];
    const out = overlayEditsOnIngredients(ings, [
      { fromIngredientId: 'ing1', toIngredientId: 'ing3', ratio: 1, fromIngredientName: 'Гречка', toIngredientName: 'Рис' },
    ], 4);
    expect(out.map(i => i.name)).toEqual(['Рис']);
    expect(out[0].amount).toBeCloseTo(0.5);
    expect(out[0].substitutedFrom).toBe('Гречка');
  });

  it('SUBST на продукт вне состава: создаётся новая строка', () => {
    const out = overlayEditsOnIngredients([ing('ing1', 'Гречка', 0.4)], [
      { fromIngredientId: 'ing1', toIngredientId: 'ing7', ratio: 2, toIngredientName: 'Пшено', toUnit: 'KG' },
    ], 4);
    expect(out.map(i => i.name)).toEqual(['Пшено']);
    expect(out[0].amount).toBeCloseTo(0.8);
  });

  it('снепшот-id ингредиентов матчатся с каталожными id правок', () => {
    const ings = [ing('ing1::ttrip1', 'Гречка', 0.4), ing('ing12::ttrip1', 'Соль', 0.01)];
    const out = overlayEditsOnIngredients(ings, [
      { fromIngredientId: 'ing12', toIngredientId: null, removed: true },
    ], 4);
    expect(out.map(i => i.name)).toEqual(['Гречка']);
  });

  it('пустые правки — ингредиенты без изменений (тот же набор)', () => {
    const ings = [ing('ing1', 'Гречка', 0.4)];
    const out = overlayEditsOnIngredients(ings, [], 4);
    expect(out).toEqual(ings);
  });
});
