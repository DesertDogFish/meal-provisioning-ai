/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): десктоп-таблицы
 * этапа ④ «Чеки и итог», выделенные из PriceOverridesTab (R8/R9 — презентация
 * отдельно от данных). Строки — props из общей view-модели (ChecksModel),
 * мутации (факт-цена, «взяли», исключение) — колбэки страницы похода.
 *
 * bugs-trip-checks-stage пп.3–5,7 (владелец 03.11.2026): чек — только
 * фактическая стоимость. Колонки «План ₽» и «Отклонение» удалены (основная
 * таблица, таблица «по дням»); «Факт ₽» переименована в «Стоимость ₽»;
 * внизу — ОДИН «Итог» = сумма введённых чеков (пока чеков нет — «нет данных»,
 * план за факт не выдаётся). Строки без введённого чека подсвечены
 * .row-attention (п.6); над таблицей — липкий поиск ListSearch (п.7, общий
 * контрол с чеклистом ③ и мобильными строками).
 */
import { useRef } from 'react';

import { formatAmount } from '../utils/calculations';
import { formatRub, formatUnitPrice } from '../utils/format';
import { neededAsActual, type ActualAmount } from '../utils/checkUnits';
import { enteredCheckTotal } from '../utils/checkInput';
import type { ChecklistActual } from '../utils/tripStaging';

import { NumberField } from './NumberField';
import InfoTip from './InfoTip';
import FreeAmountInput from './FreeAmountInput';
import ListSearch from './ListSearch';
import type { CheckRow, CheckGroup, DayPlanFact } from './ChecksModel';

export interface ChecksTableProps {
  groups: CheckGroup[];
  dayFacts: DayPlanFact[];
  excluded: Set<string>;
  actualMap: Record<string, ChecklistActual>;
  pieceWeightById: Map<string, number | null>;
  canEnterCheck: boolean;
  /** п.5: сумма введённых чеков; null — пока ни один чек не введён («нет данных») */
  enteredTotal: number | null;
  onCommitActualTotal: (row: CheckRow, total: number | null) => void;
  onCommitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  onToggleExcluded: (ingredientId: string) => void;
}

export function ChecksTable(props: ChecksTableProps) {
  const {
    groups, dayFacts, excluded, actualMap, pieceWeightById, canEnterCheck,
    enteredTotal, onCommitActualTotal, onCommitTook, onToggleExcluded,
  } = props;
  // п.7: поиск скоупится на таблицу — мобильные строки (ChecksMobile) живут
  // в DOM одновременно и несут те же data-search-id
  const tableScope = useRef<HTMLDivElement>(null);
  const searchItems = groups.flatMap(g => g.items.map(i => ({ id: i.ingredientId, text: i.ingredientName })));

  return (
    <>
      {/* п.7: липкий поиск — при прокрутке списка контрол остаётся вверху */}
      <div className="check-table-mobile-hide checklist-sticky rounded-xl max-w-5xl px-3 py-2"
           style={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }}>
        <ListSearch
          items={searchItems}
          scope={tableScope}
          testId="checks-table-search"
          ariaLabel="Поиск по чеку"
          placeholder="Найти позицию в чеке…"
        />
      </div>

      {/* Десктоп: таблица закупки (группы по категориям, как в чеклисте) */}
      <div ref={tableScope} className="check-table-mobile-hide checks-card rounded-xl max-w-5xl mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Fix-7 (п.18): table-layout fixed + colgroup — заголовки ровно над полями */}
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {/* Владелец 07.11.2026: колонка-галка «исключить из расчёта» удалена. */}
            <col />
            <col style={{ width: 84 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
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
              {/* bugs-trip-checks-stage п.4: «Факт ₽» → «Стоимость ₽» */}
              <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>
                <span className="keep-pair">
                  Стоимость ₽
                  <InfoTip label="Что такое «Стоимость ₽»" text="Сумма из чека за позицию — сколько реально заплатили за купленное количество. Цена за единицу посчитается автоматически. Пока чек не введён, сумма не показывается: план за факт не выдаётся." />
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

        {/* bugs-trip-checks-stage п.5: ОДИН итог — сумма введённых чеков.
            План/дельта/«разница» удалены вместе с колонками; пока чеков нет —
            «нет данных» (план за факт не выдаётся, UX-осмотр 31.10 п.10). */}
        <div className="sticky-totals" data-testid="checks-sticky-totals">
          <span className="keep-pair" style={{ color: 'var(--text)' }}>
            Итог:{' '}
            {enteredTotal != null ? (
              <b className="keep-num" style={{ color: 'var(--w1)' }}>{formatRub(enteredTotal)}</b>
            ) : (
              <b className="keep-num" style={{ color: 'var(--muted)', fontWeight: 600 }}>нет данных</b>
            )}
          </span>

        </div>
      </div>

      {/* По дням: стоимость — только десктоп (пп.3–4: без плана и отклонения) */}
      <div className="check-table-mobile-hide checks-card rounded-xl max-w-3xl mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}>День</th>
              <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}><span className="keep-pair">Стоимость ₽</span></th>
            </tr>
          </thead>
          <tbody>
            {dayFacts.map(day => (
              <tr key={day.dayDate} data-testid={`dayfact-row-${day.dayDate}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="row-title px-4 py-3" data-label="">
                  <b style={{ color: 'var(--text)' }}>
                    {new Date(day.dayDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                  </b>
                </td>
                <td className="keep-num px-4 py-3 text-right" data-label="Стоимость ₽" style={{ color: 'var(--w1)' }}>
                  {day.hasFact
                    ? formatRub(day.actualCost)
                    : <span style={{ color: 'var(--muted)', fontWeight: 600 }}>нет данных</span>}
                </td>
              </tr>
            ))}
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
        <td colSpan={4} data-label="" className="cell-group px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide"
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
        // Fix-10 (п.1): «Стоимость» по умолчанию ПУСТА — только введённый чек
        const actualTotal = enteredCheckTotal(item.enteredUnitPrice, item.totalAmount);
        // п.6: чек по позиции ещё не введён — строка требует внимания
        const needsAttention = !isExcluded && actualTotal == null;
        return (
          <tr
            key={item.ingredientId}
            data-search-id={item.ingredientId}
            className={needsAttention ? 'row-attention' : undefined}
            style={{ borderBottom: '1px solid var(--border)', opacity: isExcluded ? 0.45 : 1 }}
          >

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
            <td className="px-2 py-2.5 text-right" data-label="Стоимость ₽">
              {/* Fix-10 (п.3): sm — одной высоты с «Взяли» в этой строке */}
              <NumberField
                value={actualTotal}
                size="sm"
                stepRef={item.plannedCost}
                placeholder="стоимость, ₽"
                disabled={!canEnterCheck}
                onCommit={v => onCommitActualTotal(item, v)}
                testId={`actual-input-${item.ingredientId}`}
                ariaLabel={`Сумма из чека (₽): ${item.ingredientName}, куплено ${formatAmount(item.totalAmount, item.unit)}`}
              />
              {/* BL-10 (01.11.2026): чек вводится СУММОЙ, а хранится ценой за
                  единицу — показываем её с единицей («350,00 ₽/кг»), иначе
                  цифра в price_overrides не читается (₽ или ₽/кг?). */}
              {item.enteredUnitPrice != null && (
                <div
                  className="keep-num pt-0.5"
                  data-testid={`fact-unit-price-${item.ingredientId}`}
                  style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)' }}
                >
                  {formatUnitPrice(item.enteredUnitPrice, item.unit)}
                </div>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export default ChecksTable;
