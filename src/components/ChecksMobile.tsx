/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): мобильные компактные
 * строки чека, выделенные из PriceOverridesTab (R8/R9). «[✓] Сахар · взяли
 * 192,5 г → [стоимость ₽]»; детали (нужно/взяли/исключить) — раскрытие по тапу.
 * Данные — props из общей view-модели (ChecksModel).
 *
 * bugs-trip-checks-stage пп.3–4,6–7 (владелец 03.11.2026): «план N ₽» и бейдж
 * отклонения из строки удалены; словарь — «стоимость» вместо «факт»; строка без
 * введённого чека подсвечена .row-attention; под шапкой — липкий поиск
 * (общий ListSearch, R8 — тот же контрол, что в чеклисте ③ и таблице ④).
 */
import { useEffect, useRef, useState } from 'react';

import { formatAmount } from '../utils/calculations';
import { formatUnitPrice } from '../utils/format';
import { neededAsActual, type ActualAmount } from '../utils/checkUnits';
import { enteredCheckTotal } from '../utils/checkInput';
import { checklistRowKey } from '../utils/checklist';
import type { ChecklistActual } from '../utils/tripStaging';

import ListSearch from './ListSearch';
import FreeAmountInput from './FreeAmountInput';
import { NumberField } from './NumberField';
import type { CheckRow, CheckGroup } from './ChecksModel';

export interface ChecksMobileProps {
  groups: CheckGroup[];
  excluded: Set<string>;
  actualMap: Record<string, ChecklistActual>;
  pieceWeightById: Map<string, number | null>;
  canEnterCheck: boolean;
  boughtSet: Set<string>;
  factCount: number;
  factsTotal: number;
  onToggleBought: (key: string) => void;
  onCommitActualTotal: (row: CheckRow, total: number | null) => void;
  onCommitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  onToggleExcluded: (ingredientId: string) => void;
}

export function ChecksMobile(props: ChecksMobileProps) {
  const { groups, factCount, factsTotal } = props;
  // п.7: поиск скоупится на карточку — десктоп-таблица (ChecksTable) в DOM
  // одновременно и несёт те же data-search-id
  const cardRef = useRef<HTMLDivElement>(null);
  const searchItems = groups.flatMap(g => g.items.map(i => ({ id: i.ingredientId, text: i.ingredientName })));
  return (
    <div ref={cardRef} className="md:hidden max-w-3xl space-y-2" data-testid="checks-mobile">
      {/* п.22 (повторно, 07.11.2026): поиск стоит НАД карточкой и липнет к окну отдельной
          полосой, а не «внутри таблицы». Раньше он был первым ребёнком карточки и
          визуально читался как часть таблицы. */}
      <div className="checklist-sticky checks-search-bar" data-testid="checks-search-bar">
        <ListSearch
          items={searchItems}
          scope={cardRef}
          testId="checks-search"
          ariaLabel="Поиск по чеку"
          placeholder="Найти позицию в чеке…"
        />
      </div>
      <div className="checks-card rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--elev)' }}>
          <b style={{ color: 'var(--text)' }}>Ввести чек</b>
          <span className="keep-num cap" style={{ color: 'var(--text-2)' }}>{factCount} из {factsTotal}</span>
        </div>
        {groups.map(group => (
          <MobileGroupRows key={group.category} category={group.category} {...props} items={group.items} />
        ))}
        <p className="px-4 py-3 cap" style={{ color: 'var(--text-2)' }}>
          Тап по строке — ввести или поправить стоимость. Детали (нужно/взяли) — в раскрытии строки.
        </p>
      </div>
    </div>
  );
}

interface MobileGroupRowsProps extends ChecksMobileProps {
  category: string;
  items: CheckRow[];
}

function MobileGroupRows(props: MobileGroupRowsProps) {
  const {
    category, items, excluded, actualMap, pieceWeightById, canEnterCheck,
    boughtSet, onToggleBought, onCommitActualTotal, onCommitTook, onToggleExcluded,
  } = props;
  return (
    <>
      <div className="px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide"
           style={{ background: 'var(--elev)', color: 'var(--text)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {category}
      </div>
      {items.map(item => (
        <MobileCheckRow
          key={item.ingredientId}
          item={item}
          excluded={excluded.has(item.ingredientId)}
          tookValue={actualMap[String(item.ingredientId)] ?? neededAsActual(item.totalAmount, item.unit)}
          pieceWeightG={pieceWeightById.get(String(item.ingredientId)) ?? null}
          canEnterCheck={canEnterCheck}
          bought={boughtSet.has(checklistRowKey({ ingredientId: String(item.ingredientId), needed: item.totalAmount }))}
          onToggleBought={() => onToggleBought(checklistRowKey({ ingredientId: String(item.ingredientId), needed: item.totalAmount }))}
          onCommitActualTotal={onCommitActualTotal}
          onCommitTook={onCommitTook}
          onToggleExcluded={onToggleExcluded}
        />
      ))}
    </>
  );
}

interface MobileCheckRowProps {
  item: CheckRow;
  excluded: boolean;
  tookValue: ActualAmount | null;
  pieceWeightG: number | null;
  canEnterCheck: boolean;
  bought: boolean;
  onToggleBought: () => void;
  onCommitActualTotal: (row: CheckRow, total: number | null) => void;
  onCommitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  onToggleExcluded: (ingredientId: string) => void;
}

function MobileCheckRow(props: MobileCheckRowProps) {
  const {
    item, excluded, tookValue, pieceWeightG, canEnterCheck,
    onCommitActualTotal, onCommitTook,
  } = props;
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);

  // «Нажал + стоимость → сразу печатаю»: фокусируем поле после его появления
  // (autoFocus у только что смонтированного input в WebView срабатывал не всегда).
  useEffect(() => {
    if (!entering) return;
    const id = window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-testid="actual-input-${item.ingredientId}"]`);
      el?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [entering, item.ingredientId]);

  const actualTotal = enteredCheckTotal(item.enteredUnitPrice, item.totalAmount);
  // п.6: чек по позиции ещё не введён — строка требует внимания
  const needsAttention = !excluded && actualTotal == null;
  return (
    <div style={{ opacity: excluded ? 0.45 : 1 }} data-testid={`checkline-${item.ingredientId}`}>
      {/* KB-31 (UX-осмотр 31.10, п.4): строка больше НЕ <button>. Раньше внешняя
          кнопка-строка содержала <input type=checkbox> и <button class="fact-add">
          — невалидный DOM (interactive внутри interactive), warning
          validateDOMNesting и клики на stopPropagation вместо структуры.
          Теперь: контейнер <div class="checkline"> + кнопка-раскрытие
          .checkline__toggle, чья хит-зона растянута на всю строку (::after в
          index.css), а чекбокс и ввод факта — СОСЕДИ с .checkline__hit
          (position:relative + z-index) поверх этой хит-зоны. Тап по строке
          по-прежнему раскрывает детали, но DOM валиден и клавиатура честная. */}
      <div className={`checkline${needsAttention ? ' row-attention' : ''}`} data-search-id={item.ingredientId}>
        <div className="checkline__top">
          {/* Владелец 07.11.2026: чекбокс «взято» из строки чека убран — он дублировал
              отметку в этапе ③ и мешал вводу суммы. Зачёркивание теперь только у позиций
              с введённой стоимостью (см. ниже). */}

          <button
            type="button"
            className="checkline__toggle"
            aria-expanded={open}
            aria-controls={`checkline-details-${item.ingredientId}`}
            aria-label={`Подробности позиции: ${item.ingredientName}`}
            data-testid={`checkline-toggle-${item.ingredientId}`}
            onClick={() => setOpen(v => !v)}
          >
            <span className="checkline__name" style={{ textDecoration: actualTotal != null ? 'line-through' : 'none' }}>
              {item.ingredientName}
            </span>
          </button>
          <span className="checkline__qty keep-num">
            {tookValue ? formatAmount(tookValue.amount, tookValue.unit) : formatAmount(item.totalAmount, item.unit)}
          </span>
        </div>
        <div className="checkline__fact">
          {/* пп.3–4: «план N ₽» и бейдж отклонения удалены — только стоимость */}
          <span className="checkline__hit inline-flex items-center gap-2">
            {/* Владелец 07.11.2026: никаких кнопок −/+ и никакого второго поля в
                деталях. Тап по «+ стоимость» сразу открывает ввод здесь же. */}
            {actualTotal != null || entering ? (
              <NumberField
                value={actualTotal}
                size="sm"
                noSteppers
                inputType="text"
                autoFocus={entering && actualTotal == null}
                stepRef={item.plannedCost}
                placeholder="стоимость, ₽"
                disabled={!canEnterCheck}
                onCommit={v => { onCommitActualTotal(item, v); setEntering(false); }}
                testId={`actual-input-${item.ingredientId}`}
                ariaLabel={`Сумма из чека (₽): ${item.ingredientName}`}
              />
            ) : (
              <button
                type="button"
                className="fact-add"
                disabled={!canEnterCheck}
                data-testid={`fact-add-${item.ingredientId}`}
                aria-label={`Ввести сумму из чека: ${item.ingredientName}`}
                onClick={() => setEntering(true)}
              >
                + стоимость, ₽
              </button>
            )}
          </span>
        </div>
      </div>
      {open && (
        <div
          className="checkline__details space-y-2"
          id={`checkline-details-${item.ingredientId}`}
          data-testid={`checkline-details-${item.ingredientId}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--text-2)' }}>
              нужно <b className="keep-num">{formatAmount(item.totalAmount, item.unit)}</b>
            </span>
            {/* BL-10: введённая сумма чека = цена за единицу — подписываем единицу */}
            {item.enteredUnitPrice != null && (
              <span
                className="cap keep-num"
                data-testid={`fact-unit-price-mobile-${item.ingredientId}`}
                style={{ color: 'var(--muted)' }}
              >
                по чеку: <b style={{ color: 'var(--text-2)' }}>{formatUnitPrice(item.enteredUnitPrice, item.unit)}</b>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="cap" style={{ color: 'var(--muted)' }}>взяли</span>
              <FreeAmountInput
                value={tookValue}
                baseUnit={item.unit}
                pieceWeightG={pieceWeightG}
                onChange={v => onCommitTook(String(item.ingredientId), v, item.totalAmount)}
                ariaLabel={`Сколько реально куплено: ${item.ingredientName}`}
                testId={`qty-input-${item.ingredientId}`}
              />
            </span>
          </div>
          {/* Владелец 07.11.2026: галка «в расчёте / исключить» из чеков убрана совсем —
              исключение позиции живёт в этапе ② «Проверка» (ExclusionCheckbox). */}
        </div>
      )}
    </div>
  );
}

export default ChecksMobile;
