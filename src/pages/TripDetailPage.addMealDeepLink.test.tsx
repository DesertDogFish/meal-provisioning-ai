/**
 * Баг-тест (AGENTS §8, plan plans/2026-10-31-ux-audit-navigation.md п.1):
 * deep-link «В меню похода…» из каталога блюд терял выбранное блюдо —
 * `navigate('/trips/:id?stage=menu&addMeal=<dayId>')` не переносил рецепт,
 * и пользователь искал его повторно. Контракт: параметр `&recipe=<id>`
 * предвыбирает блюдо в AddMealModal (тип приёма — из mealType блюда),
 * оба параметра чистятся из URL после открытия; если блюдо не найдено
 * (удалено из каталога) — модалка открывается пустой с тостом-пояснением.
 *
 * RED: до фикса `recipe` игнорируется — блюдо не предвыбрано.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const TRIP = {
  id: '77', userId: 'u1', name: 'Алтай', startDate: '2026-07-10', endDate: '2026-07-11',
  defaultPeople: 4,
  days: [
    { id: 'd1', tripId: '77', dayDate: '2026-07-10', meals: [] },
    { id: 'd2', tripId: '77', dayDate: '2026-07-11', meals: [] },
  ],
};

const RECIPE = { id: 'r1', name: 'Уха', mealType: 'LUNCH', baseServings: 4, ingredients: [], caloriesPerServing: 400 };

const getMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(async () => ({ id: 'm1' })),
    put: vi.fn(),
    del: vi.fn(),
    onSessionLost: vi.fn(() => () => {}),
  },
  getRecipes: vi.fn(async () => [RECIPE]),
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

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc-search">{loc.search}</div>;
}

function renderPage(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route path="/trips/:id" element={<><TripDetailPage /><LocationProbe /></>} />
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

describe('Deep-link «В меню похода…» переносит блюдо (navigation-п.1)', () => {
  it('&recipe=r1 → модалка открыта, «Уха» предвыбрана, тип приёма «Обед», параметры вычищены из URL', async () => {
    renderPage('/trips/77?stage=menu&addMeal=d1&recipe=r1');

    // модалка добавления приёма открылась (по ?addMeal)
    expect(await screen.findByRole('dialog', { name: 'Добавить приём пищи' })).toBeTruthy();
    // блюдо предвыбрано — слот превью (рендерится только при selected) показывает «Уха»
    const preview = await screen.findByTestId('meal-preview');
    expect(preview.textContent).toContain('Уха');
    // тип приёма — из mealType блюда (LUNCH → «Обед»)
    const lunch = screen.getByRole('button', { name: 'Обед' });
    expect(lunch.getAttribute('aria-pressed')).toBe('true');
    // URL очищен: addMeal и recipe не остаются в адресе (shareable-ссылка одноразова)
    await waitFor(() => {
      const search = screen.getByTestId('loc-search').textContent ?? '';
      expect(search).not.toContain('addMeal');
      expect(search).not.toContain('recipe');
    });
  });

  it('блюдо удалено из каталога → модалка пустая + тост-пояснение', async () => {
    renderPage('/trips/77?stage=menu&addMeal=d1&recipe=r-gone');

    expect(await screen.findByRole('dialog', { name: 'Добавить приём пищи' })).toBeTruthy();
    // тост-пояснение (модалка открывается пустой, поиск доступен)
    expect(await screen.findByText(/не найдено/i)).toBeTruthy();
    // блюдо НЕ предвыбрано: слот превью пуст (подсказка), «Добавить» задизейблена
    await waitFor(() => expect(screen.getByTestId('meal-preview-hint')).toBeTruthy());
    expect(screen.queryByTestId('meal-preview')).toBeNull();
  });
});
