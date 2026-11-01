/// <reference types="vitest/globals" />
/**
 * KB-15 (C, интеграционный): печать похода на НОВОМ устройстве.
 *
 * До патча документ собирался по локальному LS → на бумаге печаталось
 * «Отмечено «взято»: 0» и без ✓, хотя серверные отметки есть. Теперь
 * refreshBoughtFromServer(tripKey) выполняется ДО чтения loadBought и
 * построения view-модели (гидрация стартует параллельно загрузке бандла).
 */
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TripPrintPage from './TripPrintPage';

const tripFixture = {
  id: 't1', userId: 'u1', name: 'Печатный поход',
  startDate: '2026-07-01', endDate: '2026-07-01', defaultPeople: 1,
  days: [{ id: 'd1', tripId: 't1', dayDate: '2026-07-01', meals: [
    { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r1', sortOrder: 1 },
  ] }],
};

const recipesFixture = [{
  id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 1,
  ingredients: [{ ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG' } }],
}];

const pricesFixture = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
];

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn((url: string) => {
      if (url === '/trips/t1') return Promise.resolve(tripFixture);
      if (url === '/trips/t1/prices') return Promise.resolve(pricesFixture);
      if (url === '/admin/products') return Promise.resolve({ content: [] });
      if (url === '/trips/t1/price-overrides') return Promise.resolve([]);
      // отметки есть ТОЛЬКО на сервере (новое устройство, пустой LS)
      if (url === '/trips/t1/checklist-bought') {
        return Promise.resolve([{ ingredientId: 'i1', neededStamp: 1000 }]);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    }),
    put: vi.fn(async () => []),
    post: vi.fn(),
    del: vi.fn(),
  },
  getRecipes: vi.fn(async () => recipesFixture),
  getTripRecipes: vi.fn(async () => []),
}));
vi.mock('../api/tripEdits', () => ({ getTripEdits: vi.fn(async () => []) }));
vi.mock('../api/tripManualItems', () => ({ getManualItems: vi.fn(async () => []) }));
vi.mock('../api/shoppingExclusions', () => ({ getServerExclusions: vi.fn(async () => []) }));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/trips/t1/print']}>
      <Routes>
        <Route path="/trips/:id/print" element={<TripPrintPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('TripPrintPage — отметки «взято» с сервера (KB-15)', () => {
  it('пустой LS + серверная отметка → в документе «Отмечено «взято»: 1» и ✓ у продукта', async () => {
    renderPage();

    // /Гречка/ встречается дважды (ингредиенты меню дня и таблица закупки),
    // поэтому сужаем поиск до раздела «Закупка».
    const section = (await screen.findByText('Закупка: продукты и деньги')).closest('section') as HTMLElement;
    expect(section).not.toBeNull();

    // Строка-итог раздела «Закупка» считается из гидратированного набора
    expect(within(section).getByText(/Отмечено «взято»: 1\./)).toBeInTheDocument();

    // и ✓ в строке продукта (ключ '<id>@<needed*1000>' = i1@1000)
    const rows = within(section).getAllByRole('row');
    const row = rows.find(r => (r.textContent ?? '').includes('Гречка'));
    expect(row, 'в таблице закупки есть строка с «Гречка»').toBeDefined();
    const productCell = row!.querySelector('td');
    expect(productCell?.textContent).toContain('✓');
    expect(productCell?.textContent).toContain('Гречка');
  });
});
