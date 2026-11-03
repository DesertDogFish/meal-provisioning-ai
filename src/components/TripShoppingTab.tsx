/**
 * Подзадача 26 аудита (2026-10-29): вкладка «Закупка на поход» — вынесена из
 * `TripDetailPage.tsx` (R8/R9). Сортируемая таблица (U26) + soft-disable
 * позиции (Фаза 13 п.5, Fix-2 п.5) + бейдж фактической цены из чека (Fix-7).
 * Компонент презентационный: строки и итоги приходят из `deriveTripView`.
 */
import { ArrowUpDown, ShoppingBasket } from 'lucide-react';
import TabHeader from './TabHeader';
import { EmptyState } from './EmptyState';
import ExclusionCheckbox from './ExclusionCheckbox';
import InfoTip from './InfoTip';
import { formatAmount } from '../utils/calculations';
import { formatRub, formatUnitPrice } from '../utils/format' // cleanup-п.9: shim formatRub удалён;
import type { SortDir } from '../utils/rowSort';
import type { TripView } from '../utils/tripDerived';
import type { ShoppingSortField } from '../types/tripDetail';

export interface TripShoppingTabProps {
  /** отсортированные строки закупки (U26) — из deriveTripView().sortedShopping */
  rows: TripView['sortedShopping'];
  sortSpec: { field: ShoppingSortField; dir: SortDir };
  /** клик по заголовку: то же поле — смена направления, другое — asc */
  onSortField: (field: ShoppingSortField) => void;
  /** ключи исключений для чекбоксов */
  excluded: ReadonlySet<string>;
  onToggleExcluded: (key: string) => void;
  /** navigation-п.3: CTA пустого состояния — переключить этап на «Меню ①» */
  onGoToMenu?: () => void;
}

export function TripShoppingTab({
  rows, sortSpec, onSortField, excluded, onToggleExcluded, onGoToMenu,
}: TripShoppingTabProps) {
  return (
    <div className="space-y-3 max-w-4xl">
      {/* Fix-5 (п.2): единая шапка вкладки — тот же TabHeader, что на остальных.
          bugs-trip-shopping-stage пп.1–2: этап ② — «предварительная закупка» без
          пугающих предупреждений: «Итого: N ₽» и «⚠️ нет цен» из шапки убраны
          (итог и отсутствующие цены живут в KPI сводки TripSummaryPanel),
          добавлена подсказка про исключение позиций «уже есть дома». */}
      <TabHeader
        title="Предварительная закупка"
        subtitle={
          <span className="keep-pair">
            позиций: {rows.length}
            <InfoTip
              label="Про исключение позиций"
              text="Продукты и товары, которые уже есть дома, можно исключить из закупки: снимите галочку «В расчёт» — строка останется в списке (полупрозрачной), но перестанет учитываться в сумме и не попадёт в список магазина."
            />
          </span>
        }
      />
      {/* navigation-п.3: пустая закупка — не «пустая таблица без слов», а выход на ① */}
      {rows.length === 0 && (
        <EmptyState
          icon={<ShoppingBasket size={30} />}
          title="Закупка пуста"
          hint="Добавьте приёмы пищи в меню — список закупки соберётся автоматически."
          ctaLabel="К меню ①"
          onCta={onGoToMenu}
          testId="shopping-empty"
        />
      )}
      {rows.length > 0 && (
      <div className="rounded-xl overflow-hidden mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Fix-6 (п.23): без внутреннего скролла — как в чеклисте, полная высота */}
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--elev)' }}>
            <tr>
              {/* Фаза 13 (п.5): чекбокс soft-disable — исключить из расчёта, не удаляя.
                  UX-осмотр 31.10 (п.10): колонка была БЕЗ подписи (пустой th с
                  aria-label) — смысл галочки не читался. Теперь заголовок виден,
                  а легенда раскрыта в InfoTip. */}
              <th
                className="px-4 py-3 font-medium"
                style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}
                data-testid="shopping-check-col"
              >
                <span className="keep-pair">
                  В расчёт
                  <InfoTip
                    label="Что означает галочка"
                    text="Галочка — позиция участвует в закупке и в сумме «Итого». Снимите, чтобы исключить её из расчёта, не удаляя из списка: строка останется (полупрозрачной), но считаться перестанет."
                  />
                </span>
              </th>
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
                      {/* BL-10 (01.11.2026): цена из чека — с единицей, иначе
                          «350» читается как сумма позиции, а не как ₽/кг */}
                      {item.actualUnitPrice != null && (
                        <span
                          className="text-xs ml-1 keep-num"
                          data-testid={`shopping-unit-price-${item.ingredientId}`}
                          style={{ color: 'var(--muted)' }}
                        >
                          {formatUnitPrice(item.actualUnitPrice, item.unit)}
                        </span>
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
      )}
    </div>
  );
}

export default TripShoppingTab;
