/**
 * Navigation-п.5 (2026-10-31): read-only просмотр блюда из меню похода —
 * данные снепшота (состав на приём + ккал), ссылка «В справочнике» только если
 * блюдо резолвится в живой глобальный каталог (удалённое — нота без битой ссылки).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeViewSheet } from './RecipeViewSheet';
import type { Recipe } from '../types/tripDetail';

const RECIPE = {
  id: 'sr1', name: 'Уха', mealType: 'LUNCH', baseServings: 4,
  caloriesPerServing: 400, ingredients: [],
} as unknown as Recipe;

const INGREDIENTS = [{ name: 'Консервы', amount: 2, unit: 'PCS' }];

describe('RecipeViewSheet (navigation-п.5)', () => {
  it('снепшот-блюдо: название, состав приёма, ккал, ссылка «В справочнике»', () => {
    const onOpenInCatalog = vi.fn();
    const onClose = vi.fn();
    render(
      <RecipeViewSheet
        recipe={RECIPE}
        servings={2}
        ingredients={INGREDIENTS}
        catalogRecipeId="r1"
        onClose={onClose}
        onOpenInCatalog={onOpenInCatalog}
      />
    );
    expect(screen.getByRole('dialog', { name: 'Блюдо: Уха' })).toBeTruthy();
    expect(screen.getByTestId('recipe-sheet-snapshot-note')).toBeTruthy();
    expect(screen.getByText(/Консервы/)).toBeTruthy();
    expect(screen.getByText(/400 ккал/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('recipe-sheet-catalog-link'));
    expect(onOpenInCatalog).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Закрыть'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('блюдо удалено из справочника — нота, битой ссылки нет', () => {
    render(
      <RecipeViewSheet
        recipe={RECIPE}
        servings={2}
        ingredients={INGREDIENTS}
        catalogRecipeId={null}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('recipe-sheet-no-catalog')).toBeTruthy();
    expect(screen.queryByTestId('recipe-sheet-catalog-link')).toBeNull();
  });
});
