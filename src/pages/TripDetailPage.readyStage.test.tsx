/**
 * trip-workflow-redesign п.5: этап ⑤ «Поход готов» — пятый экран в ряду:
 * ?stage=ready рендерит контент отчёта (TripReportView с WhoOwesBlock),
 * stage-bar содержит 5 этапов. Оформление экрана — арт camp-ready.webp под
 * вуалью (утверждено владельцем 03.11.2026).
 */
/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const TRIP = {
  id: '77', userId: 'u1', name: 'У моря', startDate: '2026-07-10', endDate: '2026-07-12',
  defaultPeople: 4, menuApproved: true,
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

import TripDetailPage from './TripDetailPage';
import { ToastProvider } from '../components/ToastProvider';

function renderPage(url = '/trips/77?stage=ready') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route path="/trips/:id" element={<TripDetailPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
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

describe('TripDetailPage — этап ⑤ «Поход готов» (redesign п.5)', () => {
  it('?stage=ready рендерит отчёт с WhoOwesBlock внутри страницы похода', async () => {
    renderPage();
    const reportView = await screen.findByTestId('trip-report-view');
    expect(reportView).toBeTruthy();
    expect(reportView.textContent).toContain('Итог: поровну'); // WhoOwesBlock variant=report
  });

  it('stage-bar содержит 5 этапов, ⑤ активен на ?stage=ready', async () => {
    renderPage();
    await screen.findByTestId('trip-report-view');
    const bar = screen.getByRole('navigation', { name: /Этапы похода/ });
    expect(bar.querySelectorAll('[role="tab"], .stage-bar__btn, button')).toHaveLength(5);
    expect(screen.getByTestId('stage-bar-ready').getAttribute('aria-current')).toBe('page');
  });
});

describe('TripDetailPage — redesign п.6: дубли навигации удалены', () => {
  it('нет десктопного .seg-дубля этапов и kebab шапки (отчёт/печать живут на ⑤)', async () => {
    renderPage('/trips/77?stage=menu');
    await screen.findByTestId('stage-bar-menu');
    expect(screen.queryByTestId('desktop-stage-seg')).toBeNull();
    expect(screen.queryByTestId('trip-kebab')).toBeNull();
    expect(screen.queryByTestId('kebab-report')).toBeNull();
    expect(screen.queryByTestId('kebab-print')).toBeNull();
  });

  it('этапы на десктопе переключаются чипами сводки (stage-chip-* кликабельны)', async () => {
    renderPage('/trips/77?stage=menu');
    await screen.findByTestId('stage-bar-menu');
    expect(screen.getByTestId('stage-chip-store').tagName).toBe('BUTTON');
  });
});
