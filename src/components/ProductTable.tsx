import { useMemo, useState } from 'react';
import { Edit2, Trash2, Share2 } from 'lucide-react';
import type { PriceSyncStatus, UnitOfMeasure } from '../types';
import { humanizeUnit, productsWord } from '../utils/text';
import { Button } from './Button';

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
    effectiveFrom?: string;
  };
  usageRecipes: number;
  /** BOUND/UNBOUND — выбран ли источник цены (привязка к позиции ЕМИСС). */
  bindingStatus: string;
  /** Код позиции локального справочника ЕМИСС (ingredients.emis_code, V26). */
  emisCode?: string | null;
  /** Название привязанной позиции ЕМИСС. */
  emisName?: string | null;
  /** Синхронизирована ли цена из ЕМИСС: NOT_LINKED / NO_DATA / SYNCED. */
  priceSyncStatus?: PriceSyncStatus | string;
  /**
   * KB-8: сколько ЕЩЁ глобальных продуктов привязано к той же позиции ЕМИСС
   * (ProductResponse.emisSharedCount = всего − 1). 0/null/undefined — позиция только у этого
   * продукта, значок не показываем; иначе значок рисуется со счётчиком «всего продуктов».
   */
  emisSharedCount?: number | null;
}

/**
 * Подпись колонки «Цена синхронизирована» (ProductResponse.priceSyncStatus):
 * SYNCED — действующая цена пришла из локальной копии ЕМИСС;
 * NO_DATA — продукт привязан, но цен позиции в копии нет (нужна синхронизация);
 * NOT_LINKED — источник цены не выбран, цену ведёт человек.
 */
export const PRICE_SYNC_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'dim' }> = {
  SYNCED: { label: 'да, из ЕМИСС', tone: 'ok' },
  NO_DATA: { label: 'нет данных', tone: 'warn' },
  NOT_LINKED: { label: 'не привязан', tone: 'dim' },
};

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
          {/* Источник цены: ROSSTAT — применила синхронизация ЕМИСС, MANUAL — ввёл человек,
              API — машинный источник (legacy-строки, V28). Значения 'OFF' больше нет. */}
          {price.source === 'ROSSTAT' ? 'ЕМИСС' : price.source === 'API' ? 'API' : 'ручная'}
        </span>
      </span>
    );
  };

  /**
   * Колонка «цена синхронизирована»: короткий ответ + подсказка с позицией ЕМИСС
   * и датой действующей цены (боль «даже цена не высвечивается»).
   */
  const formatSyncStatus = (product: ProductRow) => {
    const status = String(product.priceSyncStatus ?? (product.emisCode ? 'NO_DATA' : 'NOT_LINKED'));
    const meta = PRICE_SYNC_LABELS[status] ?? { label: status, tone: 'dim' as const };
    const tone =
      meta.tone === 'ok' ? { background: 'var(--success-soft)', color: 'var(--wave-300)' }
      : meta.tone === 'warn' ? { background: 'color-mix(in srgb, var(--amber-500) 14%, transparent)', color: 'var(--amber-300)' }
      : { background: 'color-mix(in srgb, var(--line-strong) 28%, transparent)', color: 'var(--muted)' };
    const title = product.emisName
      ? `ЕМИСС: ${product.emisName}${product.currentPrice?.effectiveFrom ? ` · цена от ${product.currentPrice.effectiveFrom}` : ''}`
      : 'Источник цены не выбран — цену ведёт человек';
    // KB-8: значок «привязка уже используется» — одна и та же позиция ЕМИСС у нескольких
    // продуктов законна (сухое молоко и сухие сливки → 1115), но цена синхронизации придёт
    // одна на всех, и админ должен это видеть, а не узнавать из цифр в походе.
    // Решение владельца 29.10.2026: значок НЕ сужаем (показываем на всех продуктах с общей
    // позицией), но добавляем СЧЁТЧИК — сколько всего продуктов сидит на этой позиции.
    // Бэкенд отдаёт число ДРУГИХ продуктов (ProductService.emisSharedWithOthers = всего − 1),
    // поэтому здесь +1: админу важно «нас тут трое», а не «кроме меня ещё двое».
    const shared = product.emisSharedCount ?? 0;
    const linkedTotal = shared + 1;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="chip-delta" style={tone} title={title} data-testid="price-sync-status">
          {meta.label}
        </span>
        {shared > 0 && (
          <span
            title={`Позицию ЕМИСС используют ${linkedTotal} ${productsWord(linkedTotal)} (включая этот): цена синхронизации придёт одна на всех`}
            aria-label={`Позицию ЕМИСС используют ${linkedTotal} ${productsWord(linkedTotal)}`}
            data-testid="emis-shared-badge"
            style={{
              color: 'var(--amber-300, var(--muted))',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <Share2 size={14} />
            <span
              data-testid="emis-shared-count"
              style={{ fontSize: 11, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
            >
              {linkedTotal}
            </span>
          </span>
        )}
      </span>
    );
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--muted)' }}>Ничего не найдено</p>
        <Button variant="ghost" size="sm" onClick={onResetFilters} className="mt-4">Сбросить фильтры</Button>
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
            <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>
              Цена синхронизирована
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
                <span className="chip-delta" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
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
              <td className="px-4 py-3">
                {formatSyncStatus(product)}
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
