/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): мобильные компактные
 * строки чека, выделенные из PriceOverridesTab (R8/R9). «[✓] Сахар · взяли
 * 192,5 г · 13 ₽ → [факт ₽] · [бейдж −2%]»; детали (нужно/взяли/исключить) —
 * раскрытие по тапу. Данные — props из общей view-модели (ChecksModel).
 */
import { useState } from 'react';
import { formatAmount } from '../utils/calculations';
import { formatRub } from '../utils/format';
import { NumberField } from './NumberField';
import FreeAmountInput from './FreeAmountInput';
import { neededAsActual, type ActualAmount } from '../utils/checkUnits';
import { enteredCheckTotal } from '../utils/checkInput';
import { checklistRowKey } from '../utils/checklist';
import type { ChecklistActual } from '../utils/tripStaging';
import {
  calculateDelta, formatDelta, getDeltaChipClass,
  type CheckRow, type CheckGroup,
} from './ChecksModel';

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
  return (
    <div className="md:hidden rounded-xl overflow-hidden max-w-3xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} data-testid="checks-mobile">
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--elev)' }}>
        <b style={{ color: 'var(--text)' }}>Ввести чек</b>
        <span className="keep-num cap" style={{ color: 'var(--text-2)' }}>{factCount} из {factsTotal}</span>
      </div>
      {groups.map(group => (
        <MobileGroupRows key={group.category} category={group.category} {...props} items={group.items} />
      ))}
      <p className="px-4 py-3 cap" style={{ color: 'var(--text-2)' }}>
        Тап по строке — ввести или поправить факт. Детали (нужно/взяли/исключить) — в раскрытии строки.
      </p>
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
    item, excluded, tookValue, pieceWeightG, canEnterCheck, bought,
    onToggleBought, onCommitActualTotal, onCommitTook, onToggleExcluded,
  } = props;
  const [open, setOpen] = useState(false);
  const [entering, setEntering] = useState(false);
  const actualTotal = enteredCheckTotal(item.enteredUnitPrice, item.totalAmount);
  const actualCostView = actualTotal ?? item.actualCost;
  const delta = calculateDelta(item.plannedCost, actualCostView);
  return (
    <div style={{ opacity: excluded ? 0.45 : 1 }} data-testid={`checkline-${item.ingredientId}`}>
      <button
        type="button"
        className="checkline"
        aria-expanded={open}
        data-testid={`checkline-toggle-${item.ingredientId}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="checkline__top">
          <input
            type="checkbox"
            checked={bought}
            onChange={() => onToggleBought()}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Взято: ${item.ingredientName}`}
            className="checklist-check cursor-pointer shrink-0"
            style={{ accentColor: 'var(--w2)', width: 22, height: 22 }}
          />
          <span className="checkline__name" style={{ textDecoration: bought ? 'line-through' : 'none' }}>
            {item.ingredientName}
          </span>
          <span className="checkline__qty keep-num">
            {tookValue ? formatAmount(tookValue.amount, tookValue.unit) : formatAmount(item.totalAmount, item.unit)}
          </span>
        </span>
        <span className="checkline__fact">
          <span className="keep-pair">план <b className="keep-num" style={{ color: 'var(--text-2)' }}>{formatRub(item.plannedCost)}</b></span>
          <span aria-hidden>→</span>
          <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-2">
            {actualTotal != null ? (
              <NumberField
                value={actualTotal}
                size="sm"
                stepRef={item.plannedCost}
                placeholder="факт, ₽"
                disabled={!canEnterCheck}
                onCommit={v => onCommitActualTotal(item, v)}
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
                onClick={(e) => { e.stopPropagation(); setOpen(true); setEntering(true); }}
              >
                + факт, ₽
              </button>
            )}
          </span>
          <span className={`chip-delta keep-num ${getDeltaChipClass(delta)}`}>{formatDelta(delta)}</span>
        </span>
      </button>
      {open && (
        <div className="checkline__details space-y-2" data-testid={`checkline-details-${item.ingredientId}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--text-2)' }}>
              нужно <b className="keep-num">{formatAmount(item.totalAmount, item.unit)}</b>
            </span>
            <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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
          {actualTotal == null && entering && (
            <NumberField
              value={null}
              size="sm"
              stepRef={item.plannedCost}
              placeholder="факт, ₽"
              disabled={!canEnterCheck}
              onCommit={v => onCommitActualTotal(item, v)}
              testId={`actual-input-mobile-${item.ingredientId}`}
              ariaLabel={`Сумма из чека (₽): ${item.ingredientName}`}
            />
          )}
          <label className="keep-pair keep-pair-center cap cursor-pointer" style={{ color: 'var(--text-2)' }}>
            <input
              type="checkbox"
              checked={!excluded}
              onChange={() => onToggleExcluded(String(item.ingredientId))}
              aria-label={excluded ? `Включить в расчёт: ${item.ingredientName}` : `Исключить из расчёта: ${item.ingredientName}`}
              style={{ accentColor: 'var(--w2)' }}
            />
            В расчёте (исключить — снять галочку)
          </label>
        </div>
      )}
    </div>
  );
}

export default ChecksMobile;
