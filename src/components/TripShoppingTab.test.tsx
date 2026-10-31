/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 10).
 *
 * Находки осмотра этапа ② «Закупка»:
 *  1. Колонка чекбоксов была БЕЗ заголовка (`<th aria-label="В расчёт" />` —
 *     пустой th): смысл галочки не читался ни глазом, ни в легенде. Теперь
 *     заголовок виден и объяснён InfoTip-подсказкой.
 *  2. Дробные количества печатались через точку («6.53 л») — в ru-локали
 *     разделитель всегда запятая (formatQty/formatAmount).
 *  3. Чекбокс исключения — 20×20 без хит-зоны: на тач-устройстве попадает
 *     в обёртку `.check-hit` (≥40 px, подзадача 7).
 */
/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TripShoppingTab from './TripShoppingTab';
import { deriveTripView, type TripViewInput } from '../utils/tripDerived';
import type { Trip, Recipe, Price } from '../types/tripDetail';

const trip: Trip = {
  id: 't1', userId: 'u1', name: 'Поход', startDate: '2026-07-01', endDate: '2026-07-01',
  defaultPeople: 2,
  days: [{ id: 'd1', tripId: 't1', dayDate: '2026-07-01', peopleOverride: 2, meals: [
    { id: 'm1', tripDayId: 'd1', mealType: 'DINNER', recipeId: 'r1', sortOrder: 1 },
  ] }],
};

const recipes: Recipe[] = [
  { id: 'r1', name: 'Компот', mealType: 'DINNER', baseServings: 2, ingredients: [
    { ingredientId: 'i1', amount: 6.53, ingredient: { id: 'i1', name: 'Молоко', unit: 'L', category: 'Молочка' } },
  ] },
];

const prices: Price[] = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 80, currency: 'RUB', effectiveFrom: '2026-06-01' },
];

function makeView(over: Partial<TripViewInput> = {}) {
  return deriveTripView({
    trip, recipes, tripRecipes: [], recipesMap: new Map(recipes.map(r => [r.id, r])),
    tripEdits: [], prices, manualItems: [], products: [],
    draftOverrides: {}, shoppingExcluded: new Set(), checklistBought: new Set(),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
    ...over,
  });
}

function setup(over: Partial<TripViewInput> = {}) {
  const view = makeView(over);
  render(
    <TripShoppingTab
      rows={view.sortedShopping}
      sortSpec={{ field: 'ingredientName', dir: 'asc' }}
      onSortField={vi.fn()}
      total={view.shoppingTotalFinal}
      excludedCount={view.sortedShopping.filter(i => i.excluded).length}
      hasMissingPrices={false}
      missingIngredients={[]}
      excluded={over.shoppingExcluded ?? new Set<string>()}
      onToggleExcluded={vi.fn()}
    />,
  );
  return view;
}

describe('TripShoppingTab — легенда колонки чекбоксов (UX-осмотр 31.10, п.10)', () => {
  it('заголовок колонки чекбоксов ВИДЕН: «В расчёт»', () => {
    setup();
    const header = screen.getByTestId('shopping-check-col');
    expect(header.textContent).toContain('В расчёт');
  });

  it('смысл галочки объяснён подсказкой (InfoTip с легендой)', () => {
    setup();
    expect(screen.getByLabelText('Что означает галочка')).toBeTruthy();
  });

  it('чекбокс исключения — внутри тач-хит-обёртки (п.7)', () => {
    setup();
    expect(document.querySelector('.check-hit input[type="checkbox"]')).toBeTruthy();
  });
});

describe('TripShoppingTab — ru-формат количеств (UX-осмотр 31.10, п.10)', () => {
  it('«6.53 л» больше не протекает: десятичная запятая', () => {
    setup();
    expect(screen.getByText('6,53 л')).toBeTruthy();
    expect(screen.queryByText('6.53 л')).toBeNull();
  });

  it('стоимость — целыми рублями с неразрывным пробелом', () => {
    setup();
    expect(document.body.textContent).toContain(`522\u00A0₽`);
  });
});
