/**
 * Navigation-п.5 (2026-10-31): резолв trip-снепшота блюда в глобальный каталог —
 * единая функция (раньше логика жила инлайн в TripDetailPage для ?edit=).
 * real-режим: копия имеет snapshotOf → id оригинала; mock-режим: суффикс '::t<id>'.
 */
import { describe, it, expect } from 'vitest';
import { globalCatalogRecipeId } from './recipeRef';

const tripRecipes = [
  { id: 'sr1', name: 'Уха', snapshotOf: 'r1' },
  { id: 'sr2', name: 'Каша' },
] as any[];

describe('globalCatalogRecipeId (navigation-п.5)', () => {
  it('снепшот со snapshotOf → id оригинала', () => {
    expect(globalCatalogRecipeId('sr1', tripRecipes)).toBe('r1');
  });
  it('mock-суффикс «::t…» → базовый id', () => {
    expect(globalCatalogRecipeId('r1::t77', tripRecipes)).toBe('r1');
  });
  it('без снепшота и суффикса — id как есть', () => {
    expect(globalCatalogRecipeId('r9', tripRecipes)).toBe('r9');
    expect(globalCatalogRecipeId('sr2', tripRecipes)).toBe('sr2');
  });
  it('number-id приводятся к строке', () => {
    expect(globalCatalogRecipeId(105 as any, [{ id: 105, snapshotOf: 5 }] as any[])).toBe('5');
  });
});
