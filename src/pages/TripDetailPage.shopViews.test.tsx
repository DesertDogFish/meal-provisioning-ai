/**
 * bugs-trip-shopping-stage п.5: вид «На человека» вырезан из этапа ② —
 * в переключателе видов закупки остаются «На поход» и «По дням».
 * Старый URL ?stage=person по-прежнему открывает этап ② (parseStage).
 */
/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const TRIP = {
  id: '77', userId: 'u1', name: 'У моря', startDate: '2026-07-10', endDate: '2026-07-12',
  defaultPeople: 4,
  days: [
    { id: 'd1', tripId: '77', dayDate: '2026-07-10', meals: [] },
  ],
};

const getMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(), put: vi.fn(), del: vi.fn(),
    onSessionLost: vi.fn(() => () => {}),
  },
  getRecipes: vi.fn(async () => []),
  getTripRecipes: vi.fn(async () => []),
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

import { ToastProvider } from '../components/ToastProvider';

import TripDetailPage from './TripDetailPage';

function renderPage(url = '/trips/77?stage=shopping') {
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
    if (path === '/trips/77') return TRIP;
    return [];
  });
});

describe('TripDetailPage — виды закупки без «На человека» (bugs-trip-shopping-stage п.5)', () => {
  it('в seg закупки два вида: «На поход» и «По дням»', async () => {
    renderPage('/trips/77?stage=shopping');
    await screen.findByTestId('shopping-view-total');
    expect(screen.getByTestId('shopping-view-days')).toBeTruthy();
    expect(screen.queryByTestId('shopping-view-person')).toBeNull();
    const seg = screen.getByRole('tablist', { name: 'Вид списка закупки' });
    expect(seg.querySelectorAll('[role="tab"]')).toHaveLength(2);
  });

  it('старый URL ?stage=person по-прежнему открывает этап ② (маппинг сохранён)', async () => {
    renderPage('/trips/77?stage=person');
    await screen.findByTestId('shopping-view-total');
    expect(screen.getByTestId('stage-bar-shopping').getAttribute('aria-current')).toBe('page');
  });
});
