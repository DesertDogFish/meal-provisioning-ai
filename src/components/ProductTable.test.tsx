// Component-тесты ProductTable (PLAN.md Фаза 10, P0 п.2)
// Покрывают: сортировку, фильтрацию, empty state, отображение дубликатов/упаковок/цен.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ProductTable, filterAndSortProducts, EMPTY_FILTERS } from './ProductTable';
import type { ProductRow, ProductFilters } from './ProductTable';

const mk = (over: Partial<ProductRow>): ProductRow => ({
  id: Math.random().toString(36).slice(2),
  name: 'Продукт',
  unit: 'KG',
  category: '1',
  categoryName: 'Категория',
  usageRecipes: 0,
  bindingStatus: 'UNBOUND',
  ...over,
});

const products: ProductRow[] = [
  mk({ id: 'a', name: 'Гречка', categoryName: 'Крупы', usageRecipes: 2, currentPrice: { value: 89, currency: 'RUB', source: 'OFF' } }),
  mk({ id: 'b', name: 'Соль', categoryName: 'Специи', usageRecipes: 0, unit: 'KG', packSize: undefined }),
  mk({ id: 'c', name: 'Тушёнка', categoryName: 'Мясо', unit: 'PCS', pieceWeightG: 325, usageRecipes: 5, bindingStatus: 'BOUND', code: '4600000000001' }),
  mk({ id: 'd', name: 'Лапша', categoryName: 'Крупы', unit: 'PACK', packSize: 5, currentPrice: { value: 45, currency: 'RUB', source: 'MANUAL' } }),
];

const filters = (over: Partial<ProductFilters> = {}): ProductFilters => ({
  ...EMPTY_FILTERS,
  ...over,
});

beforeEach(() => cleanup());

describe('filterAndSortProducts (чистая функция)', () => {
  it('без фильтров возвращает все продукты, сортировка по имени asc', () => {
    const res = filterAndSortProducts(products, filters(), 'name', 'asc');
    expect(res.map(p => p.name)).toEqual(['Гречка', 'Лапша', 'Соль', 'Тушёнка']);
  });

  it('поиск по названию регистронезависимый и по подстроке', () => {
    const res = filterAndSortProducts(products, filters({ query: 'туш' }), 'name', 'asc');
    expect(res.map(p => p.id)).toEqual(['c']);
  });

  it('поиск по штрихкоду (code)', () => {
    const res = filterAndSortProducts(products, filters({ query: '4600' }), 'name', 'asc');
    expect(res.map(p => p.id)).toEqual(['c']);
  });

  it('фильтр по нескольким категориям', () => {
    const res = filterAndSortProducts(products, filters({ categories: ['Крупы'] }), 'name', 'asc');
    expect(res.map(p => p.id).sort()).toEqual(['a', 'd']);
  });

  it('фильтр по единице измерения', () => {
    const res = filterAndSortProducts(products, filters({ unit: 'PCS' }), 'name', 'asc');
    expect(res.map(p => p.id)).toEqual(['c']);
  });

  it('фильтр HAS_PRICE / NO_PRICE', () => {
    expect(filterAndSortProducts(products, filters({ priceStatus: 'HAS_PRICE' }), 'name', 'asc').map(p => p.id).sort())
      .toEqual(['a', 'd']);
    expect(filterAndSortProducts(products, filters({ priceStatus: 'NO_PRICE' }), 'name', 'asc').map(p => p.id).sort())
      .toEqual(['b', 'c']);
  });

  it('фильтр BOUND / UNBOUND', () => {
    expect(filterAndSortProducts(products, filters({ bindingStatus: 'BOUND' }), 'name', 'asc').map(p => p.id))
      .toEqual(['c']);
    expect(filterAndSortProducts(products, filters({ bindingStatus: 'UNBOUND' }), 'name', 'asc')).toHaveLength(3);
  });

  it('фильтр USED / UNUSED', () => {
    expect(filterAndSortProducts(products, filters({ usageStatus: 'USED' }), 'name', 'asc')).toHaveLength(2);
    expect(filterAndSortProducts(products, filters({ usageStatus: 'UNUSED' }), 'name', 'asc').map(p => p.id))
      .toEqual(['b', 'd']);
  });

  it('сортировка по цене: продукты без цены — как 0; desc разворачивает', () => {
    const asc = filterAndSortProducts(products, filters(), 'price', 'asc');
    expect(asc[0].currentPrice).toBeUndefined(); // без цены → 0 → первый
    const desc = filterAndSortProducts(products, filters(), 'price', 'desc');
    expect(desc.map(p => p.currentPrice?.value ?? 0)).toEqual([89, 45, 0, 0]);
  });

  it('сортировка по использованию (usage) desc', () => {
    const res = filterAndSortProducts(products, filters(), 'usage', 'desc');
    expect(res.map(p => p.usageRecipes)).toEqual([5, 2, 0, 0]);
  });

  it('комбинация фильтров: query + unit', () => {
    const res = filterAndSortProducts(products, filters({ query: 'тушёнка', unit: 'PCS' }), 'name', 'asc');
    expect(res.map(p => p.id)).toEqual(['c']);
    const none = filterAndSortProducts(products, filters({ query: 'тушёнка', unit: 'KG' }), 'name', 'asc');
    expect(none).toHaveLength(0);
  });

  it('не мутирует входной массив', () => {
    const src = [...products];
    filterAndSortProducts(src, filters(), 'name', 'desc');
    expect(src.map(p => p.id)).toEqual(products.map(p => p.id));
  });
});

describe('ProductTable (рендер и взаимодействия)', () => {
  const baseProps = {
    filters: filters(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResetFilters: vi.fn(),
  };

  beforeEach(() => {
    baseProps.onEdit.mockReset();
    baseProps.onDelete.mockReset();
    baseProps.onResetFilters.mockReset();
  });

  const renderTable = (over = {}) =>
    render(<ProductTable products={products} {...baseProps} {...over} />);

  it('рендерит все строки', () => {
    renderTable();
    expect(screen.getByText('Гречка')).toBeTruthy();
    expect(screen.getByText('Тушёнка')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(products.length + 1); // + thead
  });

  it('сортировка по клику на «Продукт»: сначала asc (стрелка ↑), повторный клик — desc (↓)', () => {
    renderTable();
    const th = screen.getByText(/Продукт/);
    // дефолт: sortKey=name, asc
    expect(th.textContent).toContain('↑');
    const namesAsc = screen.getAllByText(/^(Гречка|Лапша|Соль|Тушёнка)$/).map(el => el.textContent);
    expect(namesAsc).toEqual(['Гречка', 'Лапша', 'Соль', 'Тушёнка']);

    fireEvent.click(th);
    const namesDesc = screen.getAllByText(/^(Гречка|Лапша|Соль|Тушёнка)$/).map(el => el.textContent);
    expect(namesDesc).toEqual(['Тушёнка', 'Соль', 'Лапша', 'Гречка']);
    expect(screen.getByText(/Продукт/).textContent).toContain('↓');
  });

  it('клик по другой колонке меняет ключ сортировки и ставит asc', () => {
    renderTable();
    fireEvent.click(screen.getByText(/В рецептах/));
    expect(screen.getByText(/В рецептах/).textContent).toContain('↑');
    // Порядок строк: usage asc → Соль(0), Лапша(0), Гречка(2), Тушёнка(5)
    const rows = screen.getAllByTestId('product-row').map(el => el.textContent || '');
    const order = rows.map(t => ['Соль', 'Лапша', 'Гречка', 'Тушёнка'].findIndex(n => t!.startsWith(n)));
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('empty state: «Ничего не найдено» + кнопка сброса вызывает onResetFilters', () => {
    renderTable({ filters: filters({ query: 'нет-такого' }) });
    expect(screen.getByText('Ничего не найдено')).toBeTruthy();
    fireEvent.click(screen.getByText('Сбросить фильтры'));
    expect(baseProps.onResetFilters).toHaveBeenCalledTimes(1);
  });

  it('чип «нет цены» для продуктов без цены, форматирование цены с источником', () => {
    renderTable();
    // Соль и Тушёнка без цены → 2 чипа «нет цены»
    expect(screen.getAllByText('нет цены')).toHaveLength(2);
    expect(screen.getByText(/89 RUB/)).toBeTruthy();
    expect(screen.getByText('OFF')).toBeTruthy();
    expect(screen.getByText('ручная')).toBeTruthy();
  });

  it('колонка «Упаковка»: packSize или «развес»; чип упаковки у названия только с packSize', () => {
    renderTable();
    expect(screen.getAllByText('развес')).toHaveLength(3);
    expect(screen.getByText('уп. 5 PACK')).toBeTruthy();
    // чипов уп. у названия — ровно один (только у Лапши)
    expect(screen.getAllByText(/уп\. \d+/)).toHaveLength(1);
  });

  it('дубликаты по имени в разных единицах отображаются как отдельные строки (PCS vs KG)', () => {
    const dup = [
      mk({ id: 'x1', name: 'Сухари', unit: 'KG' }),
      mk({ id: 'x2', name: 'Сухари', unit: 'PCS' }),
    ];
    renderTable({ products: dup });
    expect(screen.getAllByText('Сухари')).toHaveLength(2);
  });

  it('кнопки «Правка»/«Удалить» вызывают колбэки с нужным продуктом', () => {
    renderTable();
    fireEvent.click(screen.getAllByTitle('Правка')[0]);
    expect(baseProps.onEdit).toHaveBeenCalledTimes(1);
    expect(baseProps.onEdit.mock.calls[0][0].name).toBe('Гречка');

    fireEvent.click(screen.getAllByTitle('Удалить')[3]);
    expect(baseProps.onDelete).toHaveBeenCalledTimes(1);
    expect(baseProps.onDelete.mock.calls[0][0].id).toBe('c'); // Тушёнка при сортировке name asc: а,d,b,c
  });
});
