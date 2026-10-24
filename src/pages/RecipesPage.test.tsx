/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecipesPage from './RecipesPage';
import { ToastProvider } from '../components/ToastProvider';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
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

const renderPage = () =>
  render(
    <ToastProvider>
      <RecipesPage />
    </ToastProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(await screen.findByText('Создать блюдо')).toBeTruthy();
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
    expect(screen.queryByText('Создать блюдо')).toBeNull();
    expect(screen.queryByLabelText('Редактировать Уха из рыбных консервов')).toBeNull();
  });

  it('кнопка создания открывает редактор', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Создать блюдо'));
    expect(await screen.findByLabelText('Название')).toBeTruthy();
  });

  it('удаление: проверка использования + confirm + DELETE', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Уха из рыбных консервов');
    fireEvent.click(screen.getByLabelText('Удалить Уха из рыбных консервов'));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/admin/recipes/r1'));
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('удаление занятого рецепта не вызывает DELETE (409-логика на клиенте)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (api.get as any).mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve({ role: 'ADMIN' });
      if (path === '/trips') {
        return Promise.resolve([
          { id: 't1', days: [{ meals: [{ recipeId: 'r1' }] }] },
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByText('Уха из рыбных консервов');
    fireEvent.click(screen.getByLabelText('Удалить Уха из рыбных консервов'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/trips'));
    expect(api.del).not.toHaveBeenCalled();
    expect(await screen.findByText(/используется в походах/)).toBeTruthy();
  });
});
