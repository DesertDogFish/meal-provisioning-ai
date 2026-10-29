/**
 * Подзадача 26 аудита (2026-10-29): вкладка «Закупка по дням» — вынесена из
 * `TripDetailPage.tsx` (R8/R9). Карточки дней (факт-цены и исключения уже
 * применены в `deriveTripView`) + карточка позиций «На весь поход» (U40).
 * Компонент презентационный.
 */
import TabHeader from './TabHeader';
import ExclusionCheckbox from './ExclusionCheckbox';
import { formatAmount } from '../utils/calculations';
import { formatRub } from '../utils/formatRub';
import { manualForTrip } from '../utils/manualItems';
import type { TripManualItem } from '../api/tripManualItems';
import type { TripView } from '../utils/tripDerived';

export interface TripDayShoppingTabProps {
  /** дни с пересчитанными позициями (U27: алфавит; п.6: факт-цены) */
  dayShopping: TripView['dayShopping'];
  /** U40: ручные позиции — «на весь поход» показываются отдельной карточкой */
  manualItems: TripManualItem[];
  /** плановая цена ручной позиции из trip-срезов цен (Fix-5 п.11) */
  priceOf: (ingredientId: string) => number | undefined;
  excluded: ReadonlySet<string>;
  onToggleExcluded: (key: string) => void;
}

export function TripDayShoppingTab({
  dayShopping, manualItems, priceOf, excluded, onToggleExcluded,
}: TripDayShoppingTabProps) {
  const tripManual = manualForTrip(manualItems);
  return (
    <div className="space-y-3 max-w-3xl">
      {/* Fix-5 (п.2): на «по дням» теперь тоже есть заголовок — вкладки выглядят одинаково */}
      <TabHeader
        title="Закупка по дням"
        subtitle={`Итого за поход: ${formatRub(dayShopping.reduce((a, d) => a + d.dayCost, 0))} · ${dayShopping.length} дн.`}
      />
      {dayShopping.map(day => (
        <div key={day.dayDate} className="rounded-xl overflow-hidden mob-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{day.items.length} продуктов</p>
            </div>
            <div className="text-right">
              {/* п.6: день считается с фактическими ценами и без исключённых позиций (dayShopping.effectiveCost/dayCost) */}
              <p className="font-bold" style={{ color: 'var(--text)' }}>{formatRub(day.dayCost)}</p>
              {day.hasMissingPrices && <p className="text-xs" style={{ color: 'var(--fire)' }}>есть без цены</p>}
            </div>
          </div>
          <div className="px-4 py-2">
            {day.items.map(item => (
              <div key={item.ingredientId} className="flex items-center justify-between py-1.5 text-sm" style={{ opacity: item.excluded ? 0.45 : 1 }}>
                <span className="flex items-center gap-2" style={{ color: 'var(--text)', textDecoration: item.excluded ? 'line-through' : 'none' }}>
                  <ExclusionCheckbox ingredientId={item.ingredientId} dayDate={day.dayDate} excluded={excluded} onToggle={onToggleExcluded} />
                  {item.ingredientName}
                </span>
                <div className="flex items-center gap-4">
                  <span style={{ color: 'var(--muted)' }}>{formatAmount(item.totalAmount, item.unit)}</span>
                  <span className="w-20 text-right" style={{ color: 'var(--text)' }}>
                    {item.hasPrice ? formatRub(item.effectiveCost ?? item.estimatedCost) : <span className="text-xs" style={{ color: 'var(--fire)' }}>—</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Fix-6 (п.14): позиции «к походу» (аптечка, топливо…) не относятся ни к
          одному дню — отдельная карточка в конце, чтобы суммы дней и итог сходились */}
      {tripManual.length > 0 && (
        <div className="rounded-xl overflow-hidden mob-scroll" style={{ background: 'var(--surface)', border: '1px dashed var(--line-strong)' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text)' }}>На весь поход</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Не привязаны к дням · учтены в итоговой сумме похода
              </p>
            </div>
            <p className="font-bold" style={{ color: 'var(--text)' }}>
              {formatRub(tripManual.reduce((a, mi) => {
                const price = priceOf(mi.ingredientId);
                return a + (price != null ? price * mi.amount : 0);
              }, 0))}
            </p>
          </div>
          <div className="px-4 py-2">
            {tripManual.map(mi => {
              const price = priceOf(mi.ingredientId);
              return (
                <div key={mi.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span style={{ color: 'var(--text)' }}>{mi.ingredientName}{mi.note ? ` · ${mi.note}` : ''}</span>
                  <div className="flex items-center gap-4">
                    <span style={{ color: 'var(--muted)' }}>{formatAmount(mi.amount, mi.unit)}</span>
                    <span className="w-20 text-right" style={{ color: 'var(--text)' }}>
                      {price != null ? formatRub(price * mi.amount) : <span className="text-xs" style={{ color: 'var(--fire)' }}>—</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default TripDayShoppingTab;
