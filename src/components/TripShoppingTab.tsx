/**
 * Подзадача 26 аудита (2026-10-29): вкладка «Закупка на поход» — вынесена из
 * `TripDetailPage.tsx` (R8/R9). Сортируемая таблица (U26) + soft-disable
 * позиции (Фаза 13 п.5, Fix-2 п.5) + бейдж фактической цены из чека (Fix-7).
 * Компонент презентационный: строки и итоги приходят из `deriveTripView`.
 */
import { ArrowUpDown } from 'lucide-react';
import TabHeader from './TabHeader';
import ExclusionCheckbox from './ExclusionCheckbox';
import { formatAmount } from '../utils/calculations';
import { formatRub } from '../utils/formatRub';
import type { SortDir } from '../utils/rowSort';
import type { TripView } from '../utils/tripDerived';
import type { ShoppingSortField } from '../types/tripDetail';

export interface TripShoppingTabProps {
  /** отсортированные строки закупки (U26) — из deriveTripView().sortedShopping */
  rows: TripView['sortedShopping'];
  sortSpec: { field: ShoppingSortField; dir: SortDir };
  /** клик по заголовку: то же поле — смена направления, другое — asc */
  onSortField: (field: ShoppingSortField) => void;
  /** «Итого» — единый источник с KPI шапки (shoppingTotalFinal) */
  total: number;
  /** сколько позиций исключено (soft-disable) */
  excludedCount: number;
  /** Fix-7 (п.28): позиции без плановой цены и без введённого чека */
  hasMissingPrices: boolean;
  missingIngredients: string[];
  /** ключи исключений для чекбоксов */
  excluded: ReadonlySet<string>;
  onToggleExcluded: (key: string) => void;
}

export function TripShoppingTab({
  rows, sortSpec, onSortField, total, excludedCount, hasMissingPrices,
  missingIngredients, excluded, onToggleExcluded,
}: TripShoppingTabProps) {
  return (
    <div className="space-y-3 max-w-4xl">
      {/* Fix-5 (п.2): единая шапка вкладки — тот же TabHeader, что на остальных */}
      <TabHeader
        title="Закупка на поход"
        subtitle={
          <>
            Итого: {formatRub(total)}{excludedCount > 0 ? ` (без ${excludedCount} искл.)` : ''}
            {' · '}позиций: {rows.length}
            {hasMissingPrices && (
              <span style={{ color: 'var(--fire)' }}> · ⚠️ нет цен: {missingIngredients.join(', ')}</span>
            )}
          </>
        }
      />
      <div className="rounded-xl overflow-hidden mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Fix-6 (п.23): без внутреннего скролла — как в чеклисте, полная высота */}
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--elev)' }}>
            <tr>
              {/* Фаза 13 (п.5): чекбокс soft-disable — исключить из расчёта, не удаляя */}
              <th className="px-4 py-3 font-medium" style={{ color: 'var(--muted)' }} aria-label="В расчёт" />
              {/* U26: сортируемые заголовки — клик переключает asc/desc */}
              {([
                { field: 'ingredientName' as ShoppingSortField, label: 'Продукт', align: 'left' },
                { field: 'totalAmount' as ShoppingSortField, label: 'Количество', align: 'right' },
                { field: 'effectiveCost' as ShoppingSortField, label: 'Стоимость', align: 'right' },
              ]).map(col => (
                <th
                  key={col.field}
                  className={`text-${col.align} px-4 py-3 font-medium`}
                  style={{ color: 'var(--muted)' }}
                  aria-sort={sortSpec.field === col.field ? (sortSpec.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => onSortField(col.field)}
                    className={`inline-flex items-center gap-1 transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                    style={{ color: sortSpec.field === col.field ? 'var(--w1)' : 'var(--muted)', fontWeight: sortSpec.field === col.field ? 700 : 500 }}
                    aria-label={`Сортировать по: ${col.label}`}
                  >
                    {col.label}
                    <ArrowUpDown size={12} style={{ opacity: sortSpec.field === col.field ? 1 : 0.45 }} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody style={{ borderTop: '1px solid var(--border)' }}>
            {rows.map(item => (
              <tr key={item.ingredientId} style={{ borderTop: '1px solid var(--border)', opacity: item.excluded ? 0.45 : 1 }}>
                <td className="cell-check px-4 py-3" data-label="">
                  <ExclusionCheckbox ingredientId={item.ingredientId} excluded={excluded} onToggle={onToggleExcluded} />
                </td>
                <td className="row-title px-4 py-3" data-label="" style={{ color: 'var(--text)', textDecoration: item.excluded ? 'line-through' : 'none' }}>{item.ingredientName}</td>
                <td className="keep-num px-4 py-3 text-right" data-label="Количество" style={{ color: 'var(--muted)' }}>{formatAmount(item.totalAmount, item.unit)}</td>
                <td className="keep-num px-4 py-3 text-right" data-label="Стоимость">
                  {item.hasPrice ? (
                    <span style={{ color: 'var(--text)' }}>
                      {formatRub(item.effectiveCost)}
                      {/* п.6: явно показываем, что применена фактическая цена из чека */}
                      {/* Fix-7 (п.17/28): бейдж — по свежему факту чека (actualUnitPrice) */}
                      {item.actualUnitPrice != null && (
                        <span className="text-xs ml-1" style={{ color: 'var(--w2)' }} title="По введённому чеку">✓ чек</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--fire)' }}>нет цены</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TripShoppingTab;
