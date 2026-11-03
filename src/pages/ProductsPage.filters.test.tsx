/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductsPage from './ProductsPage';
import { ToastProvider } from '../components/ToastProvider';

/**
 * bugs-products-catalog п.4: фильтр по категориям — UI-контрол в FilterSheet.
 * Логика фильтрации (filterAndSortProducts) уже существовала, но state
 * selectedCategories никогда не заполнялся: контрола не было ни в тулбаре,
 * ни в шите. Здесь — компонентный тест страницы: выбор категории оставляет
 * только её продукты, «Сбросить» очищает категорию.
 */

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
}));

import { api } from '../api/client';

const productsFixture = {
  content: [
    { id: 'a', name: 'Гречка', unit: 'KG', categoryName: 'Крупы', usageRecipes: 2, bindingStatus: 'UNBOUND' },
    { id: 'b', name: 'Соль', unit: 'KG', categoryName: 'Специи', usageRecipes: 0, bindingStatus: 'UNBOUND' },
    { id: 'c', name: 'Тушёнка', unit: 'PCS', categoryName: 'Мясо', usageRecipes: 5, bindingStatus: 'UNBOUND' },
    { id: 'd', name: 'Лапша', unit: 'PACK', categoryName: 'Крупы', usageRecipes: 0, bindingStatus: 'UNBOUND' },
  ],
};

const categoriesFixture = [
  { id: 'c1', name: 'Крупы', slug: 'krupy', sortOrder: 1 },
  { id: 'c2', name: 'Специи', slug: 'specii', sortOrder: 2 },
  { id: 'c3', name: 'Мясо', slug: 'myaso', sortOrder: 3 },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <ProductsPage />
      </ToastProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  localStorage.clear();
  (api.get as any).mockImplementation((path: string) => {
    if (path.startsWith('/admin/products')) return Promise.resolve(productsFixture);
    if (path.startsWith('/product-categories')) return Promise.resolve(categoriesFixture);
    if (path === '/prices') return Promise.resolve([]);
    return Promise.reject({ status: 404, detail: `unexpected ${path}` });
  });
});

describe('ProductsPage — фильтр по категориям (bugs-products-catalog п.4)', () => {
  it('в фильтрах есть селект «Категория» со списком категорий справочника', async () => {
    renderPage();
    await screen.findByText('Гречка');
    const trigger = screen.getByRole('combobox', { name: 'Фильтр по категориям' });
    expect(trigger.textContent).toContain('Категория');
    fireEvent.click(trigger);
    expect(await screen.findByRole('option', { name: /Крупы/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Специи/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Мясо/ })).toBeTruthy();
  });

  it('выбор категории оставляет только её продукты; повторный клик снимает выбор', async () => {
    renderPage();
    await screen.findByText('Гречка');
    fireEvent.click(screen.getByRole('combobox', { name: 'Фильтр по категориям' }));
    fireEvent.click(await screen.findByRole('option', { name: /Крупы/ }));

    await waitFor(() => {
      expect(screen.queryByText('Соль')).toBeNull();
      expect(screen.queryByText('Тушёнка')).toBeNull();
    });
    expect(screen.getByText('Гречка')).toBeTruthy();
    expect(screen.getByText('Лапша')).toBeTruthy();

    // мультиселект не закрывается после выбора — повторный клик по опции снимает выбор
    fireEvent.click(screen.getByRole('option', { name: /Крупы/ }));
    await waitFor(() => expect(screen.getByText('Соль')).toBeTruthy());
    expect(screen.getByText('Тушёнка')).toBeTruthy();
  });

  it('кнопка «Сбросить» видна при выбранной категории и очищает её', async () => {
    renderPage();
    await screen.findByText('Гречка');
    expect(screen.queryByRole('button', { name: 'Сбросить фильтры' })).toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: 'Фильтр по категориям' }));
    fireEvent.click(await screen.findByRole('option', { name: /Мясо/ }));
    await waitFor(() => expect(screen.queryByText('Гречка')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    await waitFor(() => expect(screen.getByText('Гречка')).toBeTruthy());
    expect(screen.getByText('Соль')).toBeTruthy();
  });
});

// BUG-002 (tasks/bugs-page-headers.md п.2): шапка страницы — hero-блок с арт-слоем.
describe('ProductsPage — BUG-002: hero-шапка', () => {
  it('шапка — page-hero: арт-слой aria-hidden, h1 «Продукты» внутри блока', async () => {
    renderPage();
    const hero = await screen.findByTestId('page-hero');
    const art = hero.querySelector('.page-hero__art');
    expect(art).toBeTruthy();
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(hero).toContainElement(screen.getByRole('heading', { level: 1 }));
  });
});
