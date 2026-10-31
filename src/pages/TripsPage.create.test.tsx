/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripsPage from './TripsPage';
import { ToastProvider } from '../components/ToastProvider';
import { AuthProvider } from '../components/AuthProvider';

/**
 * Navigation-п.9: создание похода открывает поход (этап ① «Меню»), а не
 * возвращает в список — воркфлоу «создал → добавил первый приём» без ручного
 * поиска. Ответ POST /trips уже содержит id (real TripResponse и mock-паритет);
 * фолбэк без id — прежнее поведение (список + обновление). Отмена — остаёмся
 * в списке.
 */

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
}));

import { api } from '../api/client';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/trips']}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/trips/:id" element={<LocationProbe />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );

const fillAndSubmit = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Создать поход' }));
  await screen.findByLabelText('Название');
  fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Новый поход' } });
  // DateRange: нативные input#start-date/#end-date, значение ISO (паттерн TripForm.test)
  const dateInput = (id: string) => document.querySelector(`[id="${id}"]`) as HTMLInputElement;
  fireEvent.change(dateInput('start-date'), { target: { value: '2026-09-01' } });
  fireEvent.change(dateInput('end-date'), { target: { value: '2026-09-03' } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('accessToken', 'mock-access-token-1');
  (api.get as any).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve({ id: '1', email: 'a@b.c', role: 'ADMIN' });
    if (path === '/trips') return Promise.resolve([]);
    return Promise.reject({ status: 404, detail: `unexpected ${path}` });
  });
});

describe('TripsPage — создание похода открывает поход (navigation-п.9)', () => {
  it('после POST /trips — переход на /trips/<newId>?stage=menu и тост-подсказка', async () => {
    (api.post as any).mockResolvedValue({
      id: 't-new', name: 'Новый поход', startDate: '2026-09-01', endDate: '2026-09-03',
      defaultPeople: 4, days: [{ id: 'd1', dayDate: '2026-09-01', meals: [] }],
    });
    renderPage();
    await screen.findByText('У вас пока нет походов');
    await fillAndSubmit();
    await waitFor(() => {
      const loc = screen.getByTestId('loc').textContent ?? '';
      expect(loc).toBe('/trips/t-new?stage=menu');
    });
    expect(screen.getByText('Поход создан — добавьте первый приём пищи')).toBeTruthy();
  });

  it('числовой id из real-ответа приводится к строке в URL', async () => {
    (api.post as any).mockResolvedValue({ id: 42, name: 'Новый поход' });
    renderPage();
    await screen.findByText('У вас пока нет походов');
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/trips/42?stage=menu');
    });
  });

  it('фолбэк: ответ без id — остаёмся в списке, список перечитан', async () => {
    (api.post as any).mockResolvedValue({});
    renderPage();
    await screen.findByText('У вас пока нет походов');
    await fillAndSubmit();
    await waitFor(() => {
      expect(screen.getByText('Поход успешно создан')).toBeTruthy();
    });
    expect(screen.queryByTestId('loc')).toBeNull();
    // GET /trips: первичная загрузка + перечитка после создания
    const listCalls = (api.get as any).mock.calls.filter((c: any[]) => c[0] === '/trips');
    expect(listCalls.length).toBe(2);
  });

  it('отмена создания — остаёмся в списке (без запроса)', async () => {
    renderPage();
    await screen.findByText('У вас пока нет походов');
    fireEvent.click(screen.getByRole('button', { name: 'Создать поход' }));
    await screen.findByLabelText('Название');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByLabelText('Название')).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.queryByTestId('loc')).toBeNull();
  });
});
