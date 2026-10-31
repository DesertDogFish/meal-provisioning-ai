/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): десктоп-таблицы
 * этапа ④ «Чеки и итог», выделенные из PriceOverridesTab (R8/R9 — презентация
 * отдельно от данных). Строки — props из общей view-модели (ChecksModel),
 * мутации (факт-цена, «взяли», исключение) — колбэки страницы похода.
 */
import { formatAmount } from '../utils/calculations';
import { formatRub } from '../utils/format';
import { NumberField } from './NumberField';
import InfoTip from './InfoTip';
import FreeAmountInput from './FreeAmountInput';
import { neededAsActual, type ActualAmount } from '../utils/checkUnits';
import { enteredCheckTotal } from '../utils/checkInput';
import type { ChecklistActual } from '../utils/tripStaging';
import {
  calculateDelta, formatDelta, getDeltaChipClass,
  type CheckRow, type CheckGroup, type DayPlanFact,
} from './ChecksModel';

export interface ChecksTableProps {
  groups: CheckGroup[];
  dayFacts: DayPlanFact[];
  /** люди по дням для таблицы «по дням» не нужны — только план/факт */
  excluded: Set<string>;
  actualMap: Record<string, ChecklistActual>;
  pieceWeightById: Map<string, number | null>;
  canEnterCheck: boolean;
  totalPlanned: number;
  totalActual: number;
  onCommitActualTotal: (row: CheckRow, total: number | null) => void;
  onCommitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  onToggleExcluded: (ingredientId: string) => void;
}

export function ChecksTable(props: ChecksTableProps) {
  const {
    groups, dayFacts, excluded, actualMap, pieceWeightById, canEnterCheck,
    totalPlanned, totalActual, onCommitActualTotal, onCommitTook, onToggleExcluded,
  } = props;
  const totalDelta = calculateDelta(totalPlanned, totalActual);

  return (
    <>
      {/* Десктоп: таблица закупки (группы по категориям, как в чеклисте) */}
      <div className="check-table-mobile-hide rounded-xl overflow-hidden max-w-5xl mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Fix-7 (п.18): table-layout fixed + colgroup — заголовки ровно над полями */}
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 32 }} />
            <col />
            <col style={{ width: 84 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 78 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="px-2 py-3" title="Снять галочку, чтобы исключить продукт из расчёта (не удаляя его)"></th>
              <th className="text-left px-2 py-3 font-bold" data-label="Продукт" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Продукт</th>
              <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>
                <span className="keep-pair">
                  Нужно
                  <InfoTip text="Сколько нужно по расчёту меню (с учётом правок состава, исключений и продуктов, добавленных к дню/походу)." />
                </span>
              </th>
              <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>
                <span className="keep-pair">
                  Взяли
                  <InfoTip text="Сколько реально куплено — в любых единицах (г, кг, шт, уп). Одно хранилище с чеклистом: ввели там — видно здесь, и наоборот. Попадает в отчёт." />
                </span>
              </th>
              <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>
                <span className="keep-pair">
                  Думали ₽
                  <InfoTip text="Плановая стоимость позиции: нужное количество × цена справочника на дату." />
                </span>
              </th>
              <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>
                <span className="keep-pair">
                  Заплатили ₽
                  <InfoTip text="Сумма из чека за позицию — сколько реально заплатили за купленное количество. Цена за единицу и распределение на всех посчитаются автоматически." />
                </span>
              </th>
              <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>
                <span className="keep-pair">
                  Отклонение
                  <InfoTip text="(Заплатили − Думали) ÷ Думали × 100%." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <GroupRows
                key={group.category}
                category={group.category}
                items={group.items}
                excluded={excluded}
                actualMap={actualMap}
                pieceWeightById={pieceWeightById}
                canEnterCheck={canEnterCheck}
                onCommitActualTotal={onCommitActualTotal}
                onCommitTook={onCommitTook}
                onToggleExcluded={onToggleExcluded}
              />
            ))}
          </tbody>
        </table>

        {/* Sticky итог — народный нейминг (Fix-6 п.21) */}
        <div className="sticky-totals">
          <span className="keep-pair" style={{ color: 'var(--text)' }}>
            Думали: <b className="keep-num">{formatRub(totalPlanned)}</b>
          </span>
          <span className="keep-pair" style={{ color: 'var(--text)' }}>
            Заплатили: <b className="keep-num" style={{ color: 'var(--w1)' }}>{formatRub(totalActual)}</b>
          </span>
          <span className={`chip-delta keep-num ${getDeltaChipClass(totalDelta)}`}>
            {formatDelta(totalDelta)}
          </span>
          <span className="keep-pair cap" style={{ color: 'var(--muted)' }}>
            разница: <span className="keep-num">{formatRub(totalActual - totalPlanned)}</span>
          </span>
          {excluded.size > 0 && (
            <span className="keep-pair cap" style={{ color: 'var(--muted)' }}>
              без <span className="keep-num">{excluded.size} искл.</span>
            </span>
          )}
        </div>
      </div>

      {/* По дням: план/факт — только десктоп */}
      <div className="check-table-mobile-hide rounded-xl overflow-hidden max-w-3xl mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>День</th>
              <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}><span className="keep-pair">Думали ₽</span></th>
              <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}><span className="keep-pair">Заплатили ₽</span></th>
              <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>Отклонение</th>
            </tr>
          </thead>
          <tbody>
            {dayFacts.map(day => {
              const delta = calculateDelta(day.plannedCost, day.actualCost);
              return (
                <tr key={day.dayDate} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="row-title px-4 py-3" data-label="">
                    <b style={{ color: 'var(--text)' }}>
                      {new Date(day.dayDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                    </b>
                  </td>
                  <td className="keep-num px-4 py-3 text-right" data-label="Думали ₽" style={{ color: 'var(--text)' }}>
                    {formatRub(day.plannedCost)}
                  </td>
                  <td className="keep-num px-4 py-3 text-right" data-label="Заплатили ₽" style={{ color: 'var(--w1)' }}>
                    {formatRub(day.actualCost)}
                  </td>
                  <td className="px-4 py-3 text-right" data-label="Отклонение">
                    <span className={`chip-delta keep-num ${getDeltaChipClass(delta)}`}>
                      {formatDelta(delta)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface GroupRowsProps {
  category: string;
  items: CheckRow[];
  excluded: Set<string>;
  actualMap: Record<string, ChecklistActual>;
  pieceWeightById: Map<string, number | null>;
  canEnterCheck: boolean;
  onCommitActualTotal: (row: CheckRow, total: number | null) => void;
  onCommitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  onToggleExcluded: (ingredientId: string) => void;
}

function GroupRows(props: GroupRowsProps) {
  const {
    category, items, excluded, actualMap, pieceWeightById, canEnterCheck,
    onCommitActualTotal, onCommitTook, onToggleExcluded,
  } = props;
  return (
    <>
      {/* Fix-6 (п.25/23): категория — заметная плашка-строка, формат как в чеклисте */}
      <tr>
        <td colSpan={7} data-label="" className="cell-group px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide"
            style={{ background: 'var(--elev)', color: 'var(--text)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {category}
        </td>
      </tr>
      {items.map(item => {
        const isExcluded = excluded.has(item.ingredientId);
        // Fix-7 (п.22): «Взяли» предзаполняется ожидаемым количеством;
        // Fix-8 (п.6): сохранённый ввод переживает смену потребности
        const storedTook = actualMap[String(item.ingredientId)] ?? null;
        const tookValue = storedTook ?? neededAsActual(item.totalAmount, item.unit);
        // Fix-10 (п.1): «Заплатили» по умолчанию ПУСТО — только введённый чек
        const actualTotal = enteredCheckTotal(item.enteredUnitPrice, item.totalAmount);
        const actualCostView = actualTotal ?? item.actualCost;
        const delta = calculateDelta(item.plannedCost, actualCostView);
        return (
          <tr key={item.ingredientId} style={{ borderBottom: '1px solid var(--border)', opacity: isExcluded ? 0.45 : 1 }}>
            <td className="cell-check px-2 py-2.5 text-center" data-label="">
              <input
                type="checkbox"
                checked={!isExcluded}
                onChange={() => onToggleExcluded(item.ingredientId)}
                aria-label={isExcluded ? `Включить в расчёт: ${item.ingredientName}` : `Исключить из расчёта: ${item.ingredientName}`}
                title={isExcluded ? 'Включить в расчёт' : 'Исключить из расчёта (не удаляя)'}
                className="cursor-pointer"
                style={{ accentColor: 'var(--w2)' }}
              />
            </td>
            <td className="row-title px-2 py-2.5" data-label="">
              <b style={{ color: 'var(--text)' }}>{item.ingredientName}</b>
              {item.manual && (
                <span className="chip-delta dim" style={{ marginLeft: 6, fontSize: 10 }}>к походу</span>
              )}
              {isExcluded && (
                <span className="chip-delta dim" style={{ marginLeft: 6, fontSize: 10 }}>искл.</span>
              )}
            </td>
            <td className="keep-num px-2 py-2.5 text-right" data-label="Нужно" style={{ color: 'var(--muted)' }}>
              {formatAmount(item.totalAmount, item.unit)}
            </td>
            <td className="px-2 py-2.5 text-right" data-label="Взяли">
              <FreeAmountInput
                value={tookValue}
                baseUnit={item.unit}
                pieceWeightG={pieceWeightById.get(String(item.ingredientId)) ?? null}
                onChange={v => onCommitTook(String(item.ingredientId), v, item.totalAmount)}
                ariaLabel={`Сколько реально куплено: ${item.ingredientName}`}
                testId={`qty-input-${item.ingredientId}`}
              />
            </td>
            <td className="keep-num px-2 py-2.5 text-right" data-label="Думали ₽" style={{ color: 'var(--text)' }}>
              {isExcluded ? '—' : formatRub(item.plannedCost)}
            </td>
            <td className="px-2 py-2.5 text-right" data-label="Заплатили ₽">
              {/* Fix-10 (п.3): sm — одной высоты с «Взяли» в этой строке */}
              <NumberField
                value={actualTotal}
                size="sm"
                stepRef={item.plannedCost}
                placeholder="факт, ₽"
                disabled={!canEnterCheck}
                onCommit={v => onCommitActualTotal(item, v)}
                testId={`actual-input-${item.ingredientId}`}
                ariaLabel={`Сумма из чека (₽): ${item.ingredientName}, куплено ${formatAmount(item.totalAmount, item.unit)}`}
              />
            </td>
            <td className="px-2 py-2.5 text-right" data-label="Отклонение">
              <span className={`chip-delta keep-num ${getDeltaChipClass(delta)}`}>
                {formatDelta(delta)}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

export default ChecksTable;
