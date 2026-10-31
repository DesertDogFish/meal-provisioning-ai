/**
 * Navigation-п.5 (2026-10-31): блюдо из меню похода открывает рецепт в 1 тап —
 * название в карточке приёма стало ссылкой: sheet на данных снепшота + выход
 * в глобальный каталог /recipes?view=<id> (резолв snapshotOf). Удалённый из
 * каталога рецепт — sheet без битой ссылки.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const TRIP = {
  id: '77', userId: 'u1', name: 'Алтай', startDate: '2026-07-10', endDate: '2026-07-10',
  defaultPeople: 4,
  days: [
    { id: 'd1', tripId: '77', dayDate: '2026-07-10', meals: [
      { id: 'm1', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'sr1', sortOrder: 1 },
    ] },
  ],
};

// real-режим: меню ссылается на trip-снепшот (sr1), snapshotOf → оригинал r1
const SNAPSHOT = {
  id: 'sr1', name: 'Уха', mealType: 'LUNCH', baseServings: 4, snapshotOf: 'r1',
  caloriesPerServing: 400,
  ingredients: [{ ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Консервы', unit: 'PCS' } }],
};
const CATALOG = [{ id: 'r1', name: 'Уха', mealType: 'LUNCH', baseServings: 4, ingredients: [] }];

const getMock = vi.fn();
const getRecipesMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(), put: vi.fn(), del: vi.fn(),
    onSessionLost: vi.fn(() => () => {}),
  },
  getRecipes: (...a: unknown[]) => getRecipesMock(...a),
  getTripRecipes: vi.fn(async () => [SNAPSHOT]),
}));
vi.mock('../api/tripEdits', () => ({ getTripEdits: vi.fn(async () => []) }));
vi.mock('../api/tripManualItems', () => ({ getManualItems: vi.fn(async () => []), deleteManualItem: vi.fn() }));
vi.mock('../api/shoppingExclusions', () => ({
  getServerExclusions: vi.fn(async () => []),
  syncServerExclusions: vi.fn(async () => undefined),
}));
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'USER' },
    isAdmin: false, loading: false, profileError: false, refresh: vi.fn(), logout: vi.fn(),
  }),
}));

import TripDetailPage from './TripDetailPage';
import { ToastProvider } from '../components/ToastProvider';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc-path">{loc.pathname + loc.search}</div>;
}

function renderPage(url = '/trips/77?stage=menu') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route path="/trips/:id" element={<><TripDetailPage /><LocationProbe /></>} />
          <Route path="/recipes" element={<LocationProbe />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getRecipesMock.mockResolvedValue(CATALOG);
  getMock.mockImplementation(async (path: string) => {
    if (path === '/trips/77') return TRIP;
    return [];
  });
});

async function openSheet() {
  // аккордеон дня закрыт по умолчанию — раскрываем кликом по заголовку дня
  fireEvent.click(await screen.findByText(/10 июля/));
  fireEvent.click(await screen.findByTestId('meal-recipe-link'));
  return screen.findByRole('dialog', { name: 'Блюдо: Уха' });
}

describe('Блюдо из меню открывает рецепт (navigation-п.5)', () => {
  it('sheet на данных снепшота; «В справочнике» → /recipes?view=r1 (резолв snapshotOf)', async () => {
    renderPage();
    const dialog = await openSheet();
    // «Консервы» есть и в чипах карточки приёма — проверяем именно внутри sheet
    expect(within(dialog).getByText(/Консервы/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('recipe-sheet-catalog-link'));
    await waitFor(() => {
      expect(screen.getByTestId('loc-path').textContent).toBe('/recipes?view=r1');
    });
  });

  it('рецепт удалён из каталога → sheet на снепшоте, битой ссылки нет', async () => {
    getRecipesMock.mockResolvedValue([]);
    renderPage();
    expect(await openSheet()).toBeTruthy();
    expect(screen.getByTestId('recipe-sheet-no-catalog')).toBeTruthy();
    expect(screen.queryByTestId('recipe-sheet-catalog-link')).toBeNull();
  });
});
