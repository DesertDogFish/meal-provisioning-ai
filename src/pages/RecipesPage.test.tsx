/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

// U37: страница читает ?edit= через useSearchParams — нужен роутер-контекст
const renderPage = (route = '/recipes') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <RecipesPage />
      </ToastProvider>
    </MemoryRouter>
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
