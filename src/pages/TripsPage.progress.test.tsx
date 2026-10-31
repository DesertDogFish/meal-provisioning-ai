/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripsPage from './TripsPage';
import { ToastProvider } from '../components/ToastProvider';
import { AuthProvider } from '../components/AuthProvider';
import { setBought } from '../utils/tripStaging';

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.8, критерий): «открытие
 * списка = ≤2 запроса независимо от числа походов». Прогресс карточек приходит
 * в ответе GET /trips (TripServerProgress), клиент НЕ дёргает per-trip роуты
 * и НЕ считает deriveTripView; локальный стейдж «взято» лишь уточняет этап
 * shopping → store (сервер про localStorage не знает).
 */

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
}));

import { api } from '../api/client';

const tripsFixture = [
  {
    id: 't1', userId: '1', name: 'Поход один', startDate: '2026-07-01', endDate: '2026-07-03',
    defaultPeople: 2, days: [{ id: 'd1', dayDate: '2026-07-01', meals: [{}, {}] }],
    progress: { stage: 'shopping', meals: 2, checklistTotal: 5, facts: 0, factsTotal: 5, totalCost: 1000, costPerPerson: 500 },
  },
  {
    id: 't2', userId: '1', name: 'Поход два', startDate: '2026-08-01', endDate: '2026-08-02',
    defaultPeople: 3, days: [{ id: 'd2', dayDate: '2026-08-01', meals: [{}] }],
    progress: { stage: 'checks', meals: 1, checklistTotal: 3, facts: 2, factsTotal: 3, totalCost: 900, costPerPerson: 300 },
  },
];

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
    return Promise.reject({ status: 404, detail: `unexpected ${path}` });
  });
});

describe('TripsPage — прогресс из ответа списка (cleanup-п.8)', () => {
  it('ровно ОДИН запрос данных: GET /trips (никаких per-trip N+1)', async () => {
    renderPage();
    await screen.findByTestId('trip-progress-t1');
    const dataCalls = (api.get as any).mock.calls.filter((c: any[]) => c[0] !== '/auth/me');
    expect(dataCalls).toEqual([['/trips']]);
  });

  it('карточка ② «Закупка»: этап и позиции из серверного прогресса', async () => {
    renderPage();
    const row = await screen.findByTestId('trip-progress-t1');
    expect(row.textContent).toContain('Закупка');
    expect(row.textContent).toContain('5 поз.');
  });

  it('карточка ④ «Чеки»: facts/factsTotal из серверного прогресса', async () => {
    renderPage();
    const row = await screen.findByTestId('trip-progress-t2');
    expect(row.textContent).toContain('Чеки');
    expect(row.textContent).toContain('2/3');
  });

  it('локальные отметки «взято» уточняют этап shopping → store (2/5)', async () => {
    setBought('t1', new Set(['i1@1000', 'i2@2000']));
    renderPage();
    const row = await screen.findByTestId('trip-progress-t1');
    expect(row.textContent).toContain('Магазин');
    expect(row.textContent).toContain('2/5');
  });
});
