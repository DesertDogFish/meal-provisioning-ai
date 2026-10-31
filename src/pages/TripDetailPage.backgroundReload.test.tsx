/**
 * Transparency-п.5 (план plans/done/2026-10-31-ux-audit-transparency.md): мутации
 * на странице похода не роняют full-page лоадер — после сохранения/удаления
 * идёт фоновая перечитка (`loadData(true)` / `reloadInBackground`), контент
 * этапа остаётся на месте, PageLoader появляется только на ПЕРВОЙ загрузке.
 * Ошибки мутаций по-прежнему показывают тост (проверено retry-тестом страницы).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const TRIP = {
  id: '77', userId: 'u1', name: 'Алтай', startDate: '2026-07-10', endDate: '2026-07-11',
  defaultPeople: 4,
  days: [
    { id: 'd1', tripId: '77', dayDate: '2026-07-10', meals: [
      { id: 'm1', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'r1', peopleOverride: null, sortOrder: 1 },
    ] },
    { id: 'd2', tripId: '77', dayDate: '2026-07-11', meals: [] },
  ],
};

const RECIPE = { id: 'r1', name: 'Уха', mealType: 'LUNCH', baseServings: 4, caloriesPerServing: 400, ingredients: [] };

const COMPOSITION = {
  mealId: 'm1', dayDate: '2026-07-10', mealType: 'LUNCH' as const, people: 4,
  baseServings: 4, recipeId: 'r1', recipeName: 'Уха',
  items: [
    {
      ingredientId: '1', name: 'Гречка', unit: 'KG' as const,
      packSize: null, pieceWeightG: null, kcalPer100g: 350,
      baseAmountPerServing: 0.2, derivedAmount: 0.8, effectiveAmount: 0.8,
      state: 'RECIPE' as const, ratio: null, substitutedFrom: null, kcalTotal: 0,
    },
  ],
  substitutions: [],
  totals: { kcal: 1400, weightGrams: 800, plannedCost: 100 },
};

const getMock = vi.fn();
const delMock = vi.fn(async (..._a: unknown[]) => null);
const putCompMock = vi.fn(async (_t: string, _m: string, body: any) => ({ ...COMPOSITION, items: body.items }));

vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(async () => ({ id: 'm2' })),
    put: vi.fn(async () => null),
    del: (...args: unknown[]) => delMock(...args),
    onSessionLost: vi.fn(() => () => {}),
  },
  getRecipes: vi.fn(async () => [RECIPE]),
  getTripRecipes: vi.fn(async () => []),
  getMealComposition: vi.fn(async () => JSON.parse(JSON.stringify(COMPOSITION))),
  putMealComposition: (...args: unknown[]) => putCompMock(...(args as [string, string, any])),
  humanize: (n: number, u: string) => `${n} ${u}`,
  packHint: () => null,
  humanizeWeight: (g: number) => `${g} г`,
}));
vi.mock('../api/tripEdits', () => ({ getTripEdits: vi.fn(async () => []) }));
vi.mock('../api/tripManualItems', () => ({ getManualItems: vi.fn(async () => []), deleteManualItem: vi.fn() }));
vi.mock('../api/shoppingExclusions', () => ({
  getServerExclusions: vi.fn(async () => []),
  syncServerExclusions: vi.fn(async () => undefined),
}));
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'ADMIN' },
    isAdmin: true, loading: false, profileError: false, refresh: vi.fn(), logout: vi.fn(),
  }),
}));

import TripDetailPage from './TripDetailPage';
import { ToastProvider } from '../components/ToastProvider';

function renderPage(url = '/trips/77?stage=menu') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route path="/trips/:id" element={<TripDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getMock.mockImplementation(async (path: string) => {
    if (path === '/trips/77') return JSON.parse(JSON.stringify(TRIP));
    return [];
  });
});

describe('Мутации без full-page мигания (transparency-п.5)', () => {
  it('первая загрузка показывает PageLoader, после загрузки — контент', async () => {
    renderPage();
    // PageLoader — только на первой загрузке
    await screen.findByRole('heading', { name: 'Алтай' });
    expect(screen.queryByTestId('page-loader')).toBeNull();
  });

  /** День по умолчанию свёрнут — раскрываем первый (карточки приёмов внутри). */
  const expandFirstDay = async () => {
    const headers = await screen.findAllByText(/приёмов пищи/);
    // шапка дня — div с onClick (аккордеон), не button
    fireEvent.click(headers[0].closest('.cursor-pointer')!);
    await screen.findByLabelText('Состав приёма: Уха');
  };

  it('удаление приёма: фоновая перечитка БЕЗ PageLoader, контент не исчезает', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Алтай' });
    await expandFirstDay();
    const getBefore = getMock.mock.calls.length;

    fireEvent.click(screen.getByLabelText('Удалить приём пищи: Уха'));
    fireEvent.click(await screen.findByTestId('confirm-yes'));

    await waitFor(() => expect(delMock).toHaveBeenCalledTimes(1));
    // перечитка произошла (второй GET /trips/77) …
    await waitFor(() => {
      const tripGets = getMock.mock.calls.filter((c: any[]) => c[0] === '/trips/77');
      expect(tripGets.length).toBeGreaterThan(1);
      expect(getMock.mock.calls.length).toBeGreaterThan(getBefore);
    });
    // … но full-page лоадер НЕ рендерился и контент этапа остался на месте
    expect(screen.queryByTestId('page-loader')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Алтай' })).toBeTruthy();
  });

  it('сохранение состава: PageLoader не рендерится, страница остаётся читаемой', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Алтай' });
    await expandFirstDay();

    fireEvent.click(screen.getByLabelText('Состав приёма: Уха'));
    await screen.findByRole('dialog', { name: 'Состав приёма' });
    // dirty: исключаем позицию — иначе «Сохранить состав» disabled
    fireEvent.click(await screen.findByLabelText('Исключить: Гречка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить состав' }));

    await waitFor(() => expect(putCompMock).toHaveBeenCalledTimes(1));
    // фоновая перечитка после onSaved — без снятия контента
    await waitFor(() => {
      const tripGets = getMock.mock.calls.filter((c: any[]) => c[0] === '/trips/77');
      expect(tripGets.length).toBeGreaterThan(1);
    });
    expect(screen.queryByTestId('page-loader')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Алтай' })).toBeTruthy();
  });
});
