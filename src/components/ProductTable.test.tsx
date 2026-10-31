// Component-тесты ProductTable (PLAN.md Фаза 10, P0 п.2)
// Покрывают: сортировку, фильтрацию, empty state, отображение дубликатов/упаковок/цен.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  // Источник цены: ROSSTAT — из локальной копии ЕМИСС, MANUAL — ввёл человек
  mk({ id: 'a', name: 'Гречка', categoryName: 'Крупы', usageRecipes: 2, currentPrice: { value: 89, currency: 'RUB', source: 'ROSSTAT' } }),
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
    expect(filterAndSortProducts(products, filters({ usageStatus: 'UNUSED' }), 'name', 'asc').map(p => p.id).sort())
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

  // navigation-п.6: «В рецептах: N» — <Link>, таблице нужен роутер-контекст
  const renderTable = (over = {}) =>
    render(<MemoryRouter><ProductTable products={products} {...baseProps} {...over} /></MemoryRouter>);

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
    expect(screen.getByText(/89 ₽/)).toBeTruthy();
    expect(screen.getByText('ЕМИСС')).toBeTruthy();
    expect(screen.getByText('ручная')).toBeTruthy();
  });

  it('колонка «Упаковка»: packSize или «развес»; чип упаковки у названия только с packSize', () => {
    renderTable();
    expect(screen.getAllByText('развес')).toHaveLength(3);
    expect(screen.getByText('уп. 5 уп')).toBeTruthy(); // P0-1: единицы локализованы (humanizeUnit)
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

describe('ProductTable: значок общей привязки ЕМИСС (KB-8 + счётчик, BL-23)', () => {
  const baseProps = {
    filters: filters(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResetFilters: vi.fn(),
  };
  const renderTable = (rows: ProductRow[]) =>
    render(<MemoryRouter><ProductTable products={rows} {...baseProps} /></MemoryRouter>);

  it('значка нет, если позиция ЕМИСС у продукта одна (0, null и undefined равнозначны)', () => {
    renderTable([
      mk({ id: 'solo', name: 'Гречка', emisCode: '101', emisSharedCount: 0 }),
      mk({ id: 'nul', name: 'Соль', emisCode: '102', emisSharedCount: null }),
      mk({ id: 'undef', name: 'Сахар', emisCode: '103' }),
      mk({ id: 'unbound', name: 'Вода' }),
    ]);
    expect(screen.queryAllByTestId('emis-shared-badge')).toHaveLength(0);
    expect(screen.queryAllByTestId('emis-shared-count')).toHaveLength(0);
  });

  it('счётчик показывает СКОЛЬКО ВСЕГО продуктов на позиции: emisSharedCount + 1', () => {
    renderTable([
      // бэкенд отдаёт число ДРУГИХ продуктов: 2 → на позиции всего 3 (включая этот)
      mk({ id: 'milk', name: 'Молоко сухое', emisCode: '1115', emisSharedCount: 2, priceSyncStatus: 'SYNCED' }),
      mk({ id: 'cream', name: 'Сливки сухие', emisCode: '1115', emisSharedCount: 2, priceSyncStatus: 'SYNCED' }),
      mk({ id: 'one', name: 'Спички', emisCode: '5701', emisSharedCount: 1, priceSyncStatus: 'NO_DATA' }),
    ]);
    const badges = screen.getAllByTestId('emis-shared-badge');
    expect(badges).toHaveLength(3);
    expect(screen.getAllByTestId('emis-shared-count').map(el => el.textContent)).toEqual(['3', '3', '2']);
  });

  it('подсказка и aria-label объясняют, что цена синхронизации придёт одна на всех', () => {
    renderTable([
      mk({ id: 'milk', name: 'Молоко сухое', emisCode: '1115', emisSharedCount: 16, priceSyncStatus: 'SYNCED' }),
    ]);
    const badge = screen.getByTestId('emis-shared-badge');
    expect(badge.getAttribute('title')).toContain('Позицию ЕМИСС используют 17 продуктов');
    expect(badge.getAttribute('title')).toContain('цена синхронизации придёт одна на всех');
    expect(badge.getAttribute('aria-label')).toBe('Позицию ЕМИСС используют 17 продуктов');
    expect(screen.getByTestId('emis-shared-count').textContent).toBe('17');
  });

  it('склонение счётчика: 2–4 → «продукта», 5+ → «продуктов» («1 продукт» не бывает: значок рисуется только при ≥2)', () => {
    renderTable([
      mk({ id: 'two', name: 'Бумага', emisCode: '6502', emisSharedCount: 1 }),   // всего 2
      mk({ id: 'four', name: 'Салфетки', emisCode: '6505', emisSharedCount: 3 }), // всего 4
      mk({ id: 'many', name: 'Крем', emisCode: '5311', emisSharedCount: 4 }),     // всего 5
    ]);
    // дефолтная сортировка — по имени asc: Бумага, Крем, Салфетки
    const titles = screen.getAllByTestId('emis-shared-badge').map(el => el.getAttribute('title') ?? '');
    expect(titles[0]).toContain('используют 2 продукта');
    expect(titles[1]).toContain('используют 5 продуктов');
    expect(titles[2]).toContain('используют 4 продукта');
    expect(screen.getAllByTestId('emis-shared-count').map(el => el.textContent)).toEqual(['2', '5', '4']);
  });

  it('значок живёт рядом с чипом статуса синхронизации и не подменяет его', () => {
    renderTable([
      mk({ id: 'milk', name: 'Молоко сухое', emisCode: '1115', emisName: 'Молоко сухое, кг',
        emisSharedCount: 1, priceSyncStatus: 'NO_DATA' }),
    ]);
    expect(screen.getByTestId('price-sync-status').textContent).toBe('нет данных');
    expect(screen.getByTestId('emis-shared-badge')).toBeTruthy();
  });
});

describe('ProductTable: «В рецептах: N» — ссылка на фильтр рецептов (navigation-п.6)', () => {
  const baseProps = {
    filters: filters(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onResetFilters: vi.fn(),
  };
  const renderTable = (rows: ProductRow[]) =>
    render(<MemoryRouter><ProductTable products={rows} {...baseProps} /></MemoryRouter>);

  it('N>0 — ссылка /recipes?ingredient=<id> (shareable deep-link)', () => {
    renderTable([mk({ id: 'p1', name: 'Гречка', usageRecipes: 3 })]);
    const link = screen.getByTestId('product-usage-link-p1');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/recipes?ingredient=p1');
    expect(link.textContent).toBe('3');
  });

  it('N=0 — НЕ ссылка (пустой результат не показываем)', () => {
    renderTable([mk({ id: 'p2', name: 'Соль', usageRecipes: 0 })]);
    expect(screen.queryByTestId('product-usage-link-p2')).toBeNull();
    expect(screen.getByTestId('product-usage-none-p2').textContent).toBe('0');
  });
});
