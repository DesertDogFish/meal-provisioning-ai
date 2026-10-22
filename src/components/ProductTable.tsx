import { useMemo, useState } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import type { UnitOfMeasure } from '../types';
import { humanizeUnit } from '../utils/text';

export interface ProductRow {
  id: string;
  name: string;
  unit: UnitOfMeasure;
  category: string;
  categoryId?: string;
  code?: string;
  packSize?: number;
  roundToPacks?: boolean;
  kcalPer100g?: number;
  pieceWeightG?: number;
  categoryName: string;
  currentPrice?: {
    value: number;
    currency: string;
    source: string;
  };
  usageRecipes: number;
  bindingStatus: string;
}

export type ProductSortKey = 'name' | 'category' | 'unit' | 'price' | 'usage';

export interface ProductFilters {
  query: string;
  categories: string[];       // categoryName список выбранных
  unit: string;               // '' | UnitOfMeasure
  priceStatus: string;        // '' | HAS_PRICE | NO_PRICE
  bindingStatus: string;      // '' | BOUND | UNBOUND
  usageStatus: string;        // '' | USED | UNUSED
}

export const EMPTY_FILTERS: ProductFilters = {
  query: '',
  categories: [],
  unit: '',
  priceStatus: '',
  bindingStatus: '',
  usageStatus: '',
};

/**
 * Фильтрация + сортировка списка продуктов (чистая функция — тестируется напрямую).
 */
export function filterAndSortProducts(
  products: ProductRow[],
  filters: ProductFilters,
  sortKey: ProductSortKey,
  sortDir: 'asc' | 'desc',
): ProductRow[] {
  let result = [...products];

  if (filters.query) {
    const q = filters.query.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.code && p.code.toLowerCase().includes(q))
    );
  }

  if (filters.categories.length > 0) {
    result = result.filter(p => filters.categories.includes(p.categoryName));
  }

  if (filters.unit) {
    result = result.filter(p => p.unit === filters.unit);
  }

  if (filters.priceStatus === 'HAS_PRICE') {
    result = result.filter(p => p.currentPrice);
  } else if (filters.priceStatus === 'NO_PRICE') {
    result = result.filter(p => !p.currentPrice);
  }

  if (filters.bindingStatus === 'BOUND') {
    result = result.filter(p => p.bindingStatus === 'BOUND');
  } else if (filters.bindingStatus === 'UNBOUND') {
    result = result.filter(p => p.bindingStatus === 'UNBOUND');
  }

  if (filters.usageStatus === 'USED') {
    result = result.filter(p => p.usageRecipes > 0);
  } else if (filters.usageStatus === 'UNUSED') {
    result = result.filter(p => p.usageRecipes === 0);
  }

  result.sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    switch (sortKey) {
      case 'name':
        aVal = a.name;
        bVal = b.name;
        break;
      case 'category':
        aVal = a.categoryName;
        bVal = b.categoryName;
        break;
      case 'unit':
        aVal = a.unit;
        bVal = b.unit;
        break;
      case 'price':
        aVal = a.currentPrice?.value || 0;
        bVal = b.currentPrice?.value || 0;
        break;
      case 'usage':
        aVal = a.usageRecipes;
        bVal = b.usageRecipes;
        break;
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return result;
}

interface ProductTableProps {
  products: ProductRow[];
  filters: ProductFilters;
  onEdit: (product: ProductRow) => void;
  onDelete: (product: ProductRow) => void;
  onResetFilters: () => void;
}

/**
 * Таблица продуктов: сортируемые колонки, empty state, чип дубль-статуса.
 * Сортировка живёт внутри компонента, фильтрация — снаружи (через props.filters).
 */
export function ProductTable({ products, filters, onEdit, onDelete, onResetFilters }: ProductTableProps) {
  const [sortKey, setSortKey] = useState<ProductSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: ProductSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(
    () => filterAndSortProducts(products, filters, sortKey, sortDir),
    [products, filters, sortKey, sortDir],
  );

  const sortIndicator = (key: ProductSortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const formatPrice = (price?: { value: number; currency: string; source: string }) => {
    if (!price) return <span className="chip-delta fire">нет цены</span>;
    return (
      <span style={{ color: 'var(--text)' }}>
        {price.value.toLocaleString('ru-RU')} {price.currency}
        <span className="chip-delta dim" style={{ marginLeft: '8px' }}>
          {price.source === 'OFF' ? 'OFF' : 'ручная'}
        </span>
      </span>
    );
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--muted)' }}>Ничего не найдено</p>
        <button onClick={onResetFilters} className="ghost-btn mt-4">Сбросить фильтры</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--elev)' }}>
            <th
              className="text-left px-4 py-3 font-bold cursor-pointer"
              style={{ color: 'var(--muted)', fontSize: '11px' }}
              onClick={() => handleSort('name')}
            >
              Продукт{sortIndicator('name')}
            </th>
            <th
              className="text-left px-4 py-3 font-bold cursor-pointer"
              style={{ color: 'var(--muted)', fontSize: '11px' }}
              onClick={() => handleSort('category')}
            >
              Категория{sortIndicator('category')}
            </th>
            <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Ед.</th>
            <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Упаковка</th>
            <th
              className="text-left px-4 py-3 font-bold cursor-pointer"
              style={{ color: 'var(--muted)', fontSize: '11px' }}
              onClick={() => handleSort('price')}
            >
              Цена{sortIndicator('price')}
            </th>
            <th
              className="text-right px-4 py-3 font-bold cursor-pointer"
              style={{ color: 'var(--muted)', fontSize: '11px' }}
              onClick={() => handleSort('usage')}
            >
              В рецептах{sortIndicator('usage')}
            </th>
            <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(product => (
            <tr key={product.id} data-testid="product-row" style={{ borderTop: "1px solid var(--border)" }}>
              <td className="px-4 py-3">
                <b style={{ color: 'var(--text)' }}>{product.name}</b>
                {product.packSize && (
                  <span className="chip-delta dim" style={{ marginLeft: '8px' }}>
                    уп. {product.packSize} {humanizeUnit(product.unit)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="chip-delta" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
                  {product.categoryName}
                </span>
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{humanizeUnit(product.unit)}</td>
              <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                {product.packSize || 'развес'}
              </td>
              <td className="px-4 py-3">
                {formatPrice(product.currentPrice)}
              </td>
              <td className="px-4 py-3 text-right" style={{ color: 'var(--text)' }}>
                {product.usageRecipes}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onEdit(product)}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: 'var(--muted)' }}
                    title="Правка"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(product)}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: 'var(--muted)' }}
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
