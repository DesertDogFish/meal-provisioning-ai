/**
 * Задача tasks/design-atmosphere-art.md (подзадача 5, утверждено 03.11.2026):
 * шапка страницы похода — «стекло поверх арта»: TripActions + KPI/готовность
 * (TripSummaryPanel) + десктопные сегменты этапов обёрнуты ОДНОЙ glass-
 * карточкой .trip-header-glass с арт-слоем обложки похода (aria-hidden).
 * Мобильная sticky-полоса .trip-strip не должна потерять липкость: на mobile
 * обёртка уходит в display:contents (CSS), в DOM структура сохраняется.
 * RED: до правки data-testid="trip-header-glass" на странице нет.
 */
/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';
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
    if (path === '/trips/77') return TRIP;
    return [];
  });
});

describe('TripDetailPage — glass-шапка «стекло поверх арта» (design-п.5)', () => {
  it('обёртка trip-header-glass содержит TripActions и сводку; .seg-дубля нет (redesign п.6)', async () => {
    renderPage();
    // дожидаемся отрисовки шапки похода
    await screen.findByRole('button', { name: /назад к походам/i });
    const glass = await screen.findByTestId('trip-header-glass');
    // название похода (TripActions) — внутри карточки
    expect(within(glass).getByText('У моря')).toBeTruthy();
    // redesign п.6: десктопный переключатель этапов УДАЛЁН (дубль навигации)
    expect(within(glass).queryByTestId('desktop-stage-seg')).toBeNull();
    expect(screen.queryByTestId('desktop-stage-seg')).toBeNull();
    // мобильная sticky-полоса — тоже внутри (на mobile обёртка = display:contents)
    expect(within(glass).getByTestId('trip-strip')).toBeTruthy();
  });

  it('арт-слой обложки — декоративный (aria-hidden) и ссылается на обложку похода', async () => {
    renderPage();
    const glass = await screen.findByTestId('trip-header-glass');
    const art = glass.querySelector('.trip-header-glass__art');
    expect(art).toBeTruthy();
    expect(art!.getAttribute('aria-hidden')).toBe('true');
    // после 2-й волны отзывов (03.11.2026) под стеклом — растровый арт
    // camp-ready.webp: SVG-заглушки под blur не читались («шапка пропала»)
    expect((art as HTMLElement).style.backgroundImage).toContain('camp-ready');
  });
});
