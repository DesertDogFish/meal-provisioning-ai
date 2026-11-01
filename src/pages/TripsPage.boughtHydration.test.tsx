/// <reference types="vitest/globals" />
/**
 * KB-15 (C, интеграционный): список походов на НОВОМ устройстве.
 *
 * До патча счётчик «взято» читался только из localStorage → у пользователя с
 * пустым кэшем карточка показывала «Закупка 5 поз.» / 0 отметок, хотя на сервере
 * они есть. Теперь после загрузки списка отметки гидрируются параллельно
 * (Promise.all) и счётчики перерисовываются.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripsPage from './TripsPage';
import { ToastProvider } from '../components/ToastProvider';
import { AuthProvider } from '../components/AuthProvider';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
}));

import { api } from '../api/client';

const tripsFixture = [{
  id: 't1', userId: '1', name: 'Поход один', startDate: '2026-07-01', endDate: '2026-07-03',
  defaultPeople: 2, days: [{ id: 'd1', dayDate: '2026-07-01', meals: [{}, {}] }],
  progress: { stage: 'shopping', meals: 2, checklistTotal: 5, facts: 0, factsTotal: 5, totalCost: 1000, costPerPerson: 500 },
}];

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <TripsPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('accessToken', 'mock-access-token-1');
  (api.get as any).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve({ id: '1', email: 'a@b.c', role: 'ADMIN' });
    if (path === '/trips') return Promise.resolve(tripsFixture);
    // отметки есть ТОЛЬКО на сервере (новое устройство, пустой LS)
    if (path === '/trips/t1/checklist-bought') {
      return Promise.resolve([
        { ingredientId: 'ing1', neededStamp: 1000 },
        { ingredientId: 'ing2', neededStamp: 2000 },
      ]);
    }
    return Promise.reject({ status: 404, detail: `unexpected ${path}` });
  });
  (api.put as any).mockResolvedValue([]);
});

describe('TripsPage — гидрация отметок «взято» с сервера (KB-15)', () => {
  it('пустой LS + серверные отметки → карточка показывает «Магазин 2/5»', async () => {
    renderPage();

    const row = await screen.findByTestId('trip-progress-t1');
    // до гидрации — этап ② «Закупка» без отметок
    await waitFor(() => expect(row.textContent).toContain('Магазин'));
    expect(row.textContent).toContain('2/5');
    expect(localStorage.getItem('trip-checklist-bought-t1')).toContain('ing1@1000');
    // серверный набор — источник истины: обратно ничего не досылаем
    expect(api.put).not.toHaveBeenCalled();
  });

  it('офлайн (сервер отметок недоступен) → список не падает и работает на локальном кэше', async () => {
    (api.get as any).mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ id: '1', email: 'a@b.c', role: 'ADMIN' });
      if (path === '/trips') return Promise.resolve(tripsFixture);
      return Promise.reject({ status: 503, detail: 'offline' });
    });

    renderPage();

    const row = await screen.findByTestId('trip-progress-t1');
    await waitFor(() => expect(row.textContent).toContain('Закупка'));
    expect(row.textContent).toContain('5 поз.');
  });
});
