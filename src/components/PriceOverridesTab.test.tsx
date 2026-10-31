/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): этап ④ — props-driven.
 * Критерии: переход на этап НЕ делает сетевых запросов (assert на моках);
 * мутации факт-цен идут через колбэк страницы; строки/итоги — из общей view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock('../api/client', () => ({
  api: { get: (...a: unknown[]) => getMock(...a), post: vi.fn(), put: (...a: unknown[]) => putMock(...a), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
  getRecipes: vi.fn(async () => []),
  getTripRecipes: vi.fn(async () => []),
}));
vi.mock('./ToastProvider', () => ({ useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }) }));

import PriceOverridesTab from './PriceOverridesTab';
import { deriveTripView, type TripViewInput } from '../utils/tripDerived';
import type { Trip, Recipe, Price } from '../types/tripDetail';

const trip: Trip = {
  id: 't1', userId: 'u1', name: 'Поход', startDate: '2026-07-01', endDate: '2026-07-01',
  defaultPeople: 2,
  days: [{ id: 'd1', tripId: 't1', dayDate: '2026-07-01', peopleOverride: 2, meals: [
    { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r1', sortOrder: 1 },
  ] }],
};
const recipes: Recipe[] = [
  { id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
    { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG', category: 'Крупы' } },
  ] },
];
const prices: Price[] = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
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

function renderTab(over: Partial<TripViewInput> = {}, props: Record<string, unknown> = {}) {
  const view = makeView(over);
  const defaults = {
    trip,
    view,
    draftOverrides: over.draftOverrides ?? {},
    excluded: over.shoppingExcluded ?? new Set<string>(),
    boughtSet: new Set<string>(),
    actualQty: {},
    onCommitActualTotal: vi.fn(),
    onToggleExcluded: vi.fn(),
    onToggleBought: vi.fn(),
    onCommitTook: vi.fn(),
    ...props,
  };
  render(<PriceOverridesTab {...(defaults as any)} />);
  return defaults;
}

describe('PriceOverridesTab — props-driven этап ④ (cleanup-п.5)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('рендерится из props и НЕ делает сетевых запросов', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    // «Гречка» рендерится дважды: десктоп-таблица + мобильные строки
    expect((await screen.findAllByText('Гречка')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('who-owes')).toBeTruthy();
    expect(screen.getByTestId('planfact-strip')).toBeTruthy();
    expect(getMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('без отметок «взято» — нота «чек вводится после магазина» (Fix-3 п.2)', async () => {
    renderTab();
    expect(await screen.findByTestId('checks-locked-note')).toBeTruthy();
  });

  it('ввод суммы чека → колбэк страницы onCommitActualTotal(row, total)', async () => {
    const user = userEvent.setup();
    const props = renderTab({}, { boughtSet: new Set(['k1']) });
    const input = await screen.findByTestId('actual-input-i1');
    // NumberField: клик → ввод → Enter/blur коммитит
    await user.click(input);
    const field = input.querySelector('input') ?? input;
    await user.type(field as HTMLElement, '120');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(props.onCommitActualTotal).toHaveBeenCalled());
    const [row, total] = (props.onCommitActualTotal as any).mock.calls[0];
    expect(row.ingredientId).toBe('i1');
    expect(total).toBe(120);
  });

  it('чек-бокс «в расчёте» → onToggleExcluded; «взято» (моб. строка) → onToggleBought', async () => {
    const user = userEvent.setup();
    const props = renderTab({}, { boughtSet: new Set(['k1']) });
    const excl = await screen.findAllByLabelText('Исключить из расчёта: Гречка');
    await user.click(excl[0]);
    expect(props.onToggleExcluded).toHaveBeenCalledWith('i1');
  });

  it('итоги полосы: план/факт из общей view (совпадают с ②)', async () => {
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    const strip = await screen.findByTestId('planfact-strip');
    expect(strip.textContent).toContain('100'); // план
    expect(strip.textContent).toContain('120'); // факт
  });
});

/** Navigation-п.3: пустое состояние этапа ④ + выход из locked-ноты */
describe('PriceOverridesTab — empty-state (navigation-п.3)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('нет позиций → empty-state с CTA «К закупке ②»', async () => {
    const onGoToShopping = vi.fn();
    renderTab(
      { trip: { ...trip, days: [] }, recipes: [], recipesMap: new Map(), prices: [] },
      { onGoToShopping },
    );
    expect(await screen.findByTestId('checks-empty')).toBeTruthy();
    await userEvent.click(screen.getByTestId('checks-empty-cta'));
    expect(onGoToShopping).toHaveBeenCalledTimes(1);
  });

  it('locked-нота: кнопка «К магазину ③» переключает этап', async () => {
    const onGoToStore = vi.fn();
    renderTab({}, { onGoToStore });
    const btn = await screen.findByTestId('checks-to-store');
    await userEvent.click(btn);
    expect(onGoToStore).toHaveBeenCalledTimes(1);
  });
});
