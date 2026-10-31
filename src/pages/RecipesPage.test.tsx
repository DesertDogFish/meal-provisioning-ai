/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecipesPage from './RecipesPage';
import { ToastProvider } from '../components/ToastProvider';
import { AuthProvider } from '../components/AuthProvider'; // cleanup-п.7: роль из контекста

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
  getRecipes: vi.fn(),
  humanize: (n: number, u: string) => `${n} ${u}`,
  formatMoney: (v: number) => String(v),
  UNIT_LABELS: { KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' },
}));

import { api, getRecipes } from '../api/client';

const recipeStub = {
  id: 'r1',
  name: 'Уха из рыбных консервов',
  mealType: 'LUNCH',
  category: 'Супы',
  cookMinutes: 25,
  baseServings: 1,
  caloriesPerServing: 400,
  ingredients: [],
};

// U37: страница читает ?edit= через useSearchParams — нужен роутер-контекст
const renderPage = (route = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <ToastProvider>
          <RecipesPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  // cleanup-п.7: AuthProvider грузит /auth/me только при наличии токена
  localStorage.setItem('accessToken', 'mock-access-token-1');
  (getRecipes as any).mockResolvedValue([recipeStub]);
  (api.del as any).mockResolvedValue(null);
  (api.get as any).mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve({ role: 'ADMIN' });
    if (path === '/trips') return Promise.resolve([]);
    return Promise.resolve({ content: [], totalElements: 0 });
  });
});

describe('RecipesPage — админ-режим каталога', () => {
  it('ADMIN видит кнопку создания и действия на карточке', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Создать блюдо' })).toBeTruthy();
    await screen.findByText('Уха из рыбных консервов');
    expect(screen.getByLabelText('Редактировать Уха из рыбных консервов')).toBeTruthy();
    expect(screen.getByLabelText('Удалить Уха из рыбных консервов')).toBeTruthy();
  });

  it('USER не видит админ-действий', async () => {
    (api.get as any).mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ role: 'USER' });
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByText('Уха из рыбных консервов');
    expect(screen.queryByRole('button', { name: 'Создать блюдо' })).toBeNull();
    expect(screen.queryByLabelText('Редактировать Уха из рыбных консервов')).toBeNull();
  });

  it('кнопка создания открывает редактор', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Создать блюдо' }));
    expect(await screen.findByLabelText('Название')).toBeTruthy();
  });

  it('удаление: брендовый диалог подтверждения + DELETE (Fix-6 п.7; клиентской проверки использования нет)', async () => {
    renderPage();
    await screen.findByText('Уха из рыбных консервов');
    fireEvent.click(screen.getByLabelText('Удалить Уха из рыбных консервов'));
    // Fix-6 (п.7): window.confirm заменён брендовым alertdialog с последствиями
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Удалить блюдо «Уха из рыбных консервов»?');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить блюдо' }));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/admin/recipes/r1'));
    // U16: список походов клиентом больше не запрашивается — изоляцию гарантирует сервер
    expect(api.get).not.toHaveBeenCalledWith('/trips');
  });

  it('U16: рецепт, используемый в походах, всё равно удаляется — походы живут на снапшотах', async () => {
    renderPage();
    await screen.findByText('Уха из рыбных консервов');
    fireEvent.click(screen.getByLabelText('Удалить Уха из рыбных консервов'));
    // Fix-6 (п.7): подтверждение — в брендовом диалоге
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить блюдо' }));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/admin/recipes/r1'));
    expect(screen.queryByText(/используется в походах/)).toBeNull();
  });
});

describe('RecipesPage — ?edit= (U37, список 26.10)', () => {
  it('переход из похода сразу открывает редактор нужного блюда', async () => {
    renderPage('/recipes?edit=r1');
    // редактор открылся сам, без ручного поиска и клика по карандашу
    expect(await screen.findByLabelText('Название')).toBeTruthy();
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Уха из рыбных консервов');
  });

  it('edit по trip-scoped id (суффикс ::t) находит базовое блюдо', async () => {
    renderPage('/recipes?edit=r1::ttrip9');
    expect(await screen.findByLabelText('Название')).toBeTruthy();
  });

  it('несуществующий id — редактор не открывается, показана ошибка', async () => {
    renderPage('/recipes?edit=nope');
    await screen.findByText('Уха из рыбных консервов');
    expect(screen.queryByLabelText('Название')).toBeNull();
  });
});

// Fix-8 (п.5): «кнопка "В меню" почему-то с переносом строки между В и меню» —
// кнопка не должна переносить текст (whitespace-nowrap) и сжиматься соседями (shrink-0).
describe('RecipesPage — кнопка «В меню» на карточке (Fix-8 п.5)', () => {
  it('«В меню» — без переноса строки (whitespace-nowrap + shrink-0)', async () => {
    renderPage();
    await screen.findByText('Уха из рыбных консервов');
    const btn = screen.getByTestId('recipe-to-menu-r1');
    expect(btn.className).toContain('whitespace-nowrap');
    expect(btn.className).toContain('shrink-0');
    // текст — единая строка без разрывов
    expect(btn.textContent?.trim()).toBe('В меню похода…');
  });
});

// navigation-п.1: «В меню похода…» переносит выбранное блюдо в deep-link (?recipe=)
describe('RecipesPage — «В меню похода…» переносит блюдо (navigation-п.1)', () => {
  function LocationProbe() {
    const loc = useLocation();
    return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
  }

  it('после выбора похода/дня navigate ведёт на ?stage=menu&addMeal=<dayId>&recipe=<id>', async () => {
    (api.get as any).mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ role: 'ADMIN' });
      if (path === '/trips') return Promise.resolve([
        { id: 't1', name: 'Алтай', startDate: '2026-07-10', endDate: '2026-07-11', defaultPeople: 2,
          days: [{ id: 'd1', dayDate: '2026-07-10', meals: [] }] },
      ]);
      return Promise.resolve([]);
    });
    render(
      <MemoryRouter initialEntries={['/recipes']}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/recipes" element={<RecipesPage />} />
              <Route path="/trips/:id" element={<LocationProbe />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText('Уха из рыбных консервов');
    fireEvent.click(screen.getByTestId('recipe-to-menu-r1'));
    fireEvent.click(await screen.findByTestId('menu-sheet-trip-t1'));
    fireEvent.click(await screen.findByTestId('menu-sheet-day-d1'));
    await waitFor(() => {
      const loc = screen.getByTestId('loc').textContent ?? '';
      expect(loc).toContain('/trips/t1');
      expect(loc).toContain('stage=menu');
      expect(loc).toContain('addMeal=d1');
      expect(loc).toContain('recipe=r1');
    });
  });
});

/** Navigation-п.5: /recipes?view=<id> открывает карточку рецепта (deep-link из похода) */
describe('RecipesPage — ?view= (navigation-п.5)', () => {
  it('открывает карточку блюда по id', async () => {
    renderPage('/recipes?view=r1');
    expect(await screen.findByRole('dialog', { name: 'Блюдо: Уха из рыбных консервов' })).toBeTruthy();
  });

  it('неизвестный id — тост «не найдено», карточка не открывается', async () => {
    renderPage('/recipes?view=r-gone');
    expect(await screen.findByText(/не найдено/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
