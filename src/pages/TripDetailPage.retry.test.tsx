/**
 * Баг-тест (AGENTS §8, plan plans/done/2026-10-31-ux-audit-navigation.md п.4):
 * «Повторить» в error-состоянии загрузки данных похода была МЁРТВОЙ
 * (PriceOverridesTab.tsx:446 — Button без onClick). После cleanup-п.5 этап ④
 * не грузит данные сам — ошибка загрузки показывается на уровне страницы,
 * и у неё ОБЯЗАНА быть рабочая кнопка «Повторить» (повторный запрос) и путь
 * назад к списку походов.
 *
 * RED: до фикса на странице ошибки нет кнопки «Повторить».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const getMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
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

import TripDetailPage from './TripDetailPage';
import { ToastProvider } from '../components/ToastProvider';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trips/77?stage=checks']}>
      <ToastProvider>
        <Routes>
          <Route path="/trips/:id" element={<TripDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('TripDetailPage: error-state этапа — рабочая «Повторить» (navigation-п.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('ошибка загрузки → «Повторить» делает повторный запрос, есть путь назад', async () => {
    getMock.mockRejectedValue({ detail: 'Сервер недоступен' });
    renderPage();

    // человекочитаемая ошибка + путь назад
    expect(await screen.findByText('Сервер недоступен', { selector: '*' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /назад к походам/i })).toBeTruthy();

    // «Повторить» — живая: клик → повторный запрос похода
    const callsBefore = getMock.mock.calls.filter(c => String(c[0]).includes('/trips/77')).length;
    const retry = await screen.findByRole('button', { name: /^повторить$/i });
    const user = userEvent.setup();
    await user.click(retry);
    await waitFor(() => {
      const callsAfter = getMock.mock.calls.filter(c => String(c[0]).includes('/trips/77')).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});

/**
 * KB-34 (план plans/done/2026-10-31-ux-audit-visual-inspection.md, подзадача 11):
 * чужой поход в mock теперь неотличим от несуществующего — 404 (паритет с
 * TripService.findByIdWithDaysAndMeals(tripId, userId)). Прямой URL чужого
 * похода обязан показывать ЧЕЛОВЕЧЕСКУЮ RU-ошибку, а не сырой английский
 * detail из ProblemDetail («Trip 77 not found»).
 */
describe('TripDetailPage: 404 на чужой поход — человеческая ошибка (KB-34)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('404 → «Поход не найден или недоступен», английский detail не показываем', async () => {
    getMock.mockRejectedValue({ status: 404, message: 'Not found', detail: 'Trip 77 not found' });
    renderPage();

    expect((await screen.findAllByText('Поход не найден или недоступен')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Trip 77 not found/)).toBeNull();
    // путь назад и «Повторить» на месте
    expect(screen.getByRole('button', { name: /назад к походам/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^повторить$/i })).toBeTruthy();
  });
});
