import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import InfoTip from './InfoTip';
import FreeAmountInput from './FreeAmountInput';
import { Button } from './Button';
import { KebabMenu } from './KebabMenu';
import { useConfirm } from './ConfirmDialog';
import { isActualLessThanNeeded, neededAsActual, type ActualAmount } from '../utils/checkUnits';
import { formatAmount } from '../utils/calculations';
import { checklistRowKey, type ChecklistGroup } from '../utils/checklist';
import type { ChecklistActual } from '../utils/tripStaging';

/**
 * Подзадача 6 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): вкладка «Чеклист»
 * вынесена из `TripDetailPage.tsx` (1372 строки — нарушение R8) в отдельный
 * компонент. Поведение сохранено один в один (ключ отметки = позиция + потребность,
 * предзаполнение «беру» расчётным количеством, подсветка «взяли меньше»).
 *
 * Сценарий «телефон в магазине» (подзадачи 6/7):
 *  - тач-таргеты ≥44×44px: чекбокс и тап по всей строке переключают «взято»;
 *  - липкая шапка с прогрессом «Взято N из M» и массовыми действиями — видна всегда;
 *  - фильтр «только не взятое» (в магазине смотрят, что осталось);
 *  - группы по категориям сворачиваются;
 *  - «Отметить всё» / «Снять всё» — ОПАСНЫЕ действия, только через ConfirmDialog.
 *
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 5): первый экран —
 * рабочий: шапка чеклиста (прогресс + «Осталось · N» + «Отметить всё» с kebab
 * «Снять всё») идёт сразу под полосой похода; строка ≥64px под большой палец,
 * чекбокс 24px и визуально активный; «беру [значение] [UnitChip]» в той же
 * строке справа; юнит-стек заменён UnitChip (bottom-sheet единиц).
 *
 * Хранилище — прежнее (`utils/tripStaging.ts`, долг R1/R2): НОВЫХ localStorage-
 * сущностей компонент не заводит (AGENTS.md §12), он полностью управляется
 * пропсами из страницы.
 */
export interface ChecklistTabProps {
  /** группы чеклиста (категория → позиции), собранные `buildChecklist` */
  groups: ChecklistGroup[];
  /** ключи отмеченных позиций: `<ingredientId>@<needed*1000>` */
  bought: Set<string>;
  /** введённый факт «сколько реально беру» по ingredientId */
  actualQty: Record<string, ChecklistActual>;
  /** переключить отметку «взято» у одной позиции */
  onToggleRow: (key: string) => void;
  /** записать фактическое количество (общий стейдж с чеком) */
  onCommitActualQty: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  /** массовая отметка: true — «взято» всем, false — снять всё */
  onSetAll: (on: boolean) => void;
}

export function ChecklistTab({
  groups, bought, actualQty, onToggleRow, onCommitActualQty, onSetAll,
}: ChecklistTabProps) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allKeys = useMemo(
    () => groups.flatMap(g => g.rows.map(checklistRowKey)),
    [groups],
  );
  const boughtCount = allKeys.filter(k => bought.has(k)).length;
  const total = allKeys.length;
  const percent = total > 0 ? Math.round((boughtCount / total) * 100) : 0;
  const leftCount = total - boughtCount;

  const visibleGroups = useMemo(() => {
    if (!onlyMissing) return groups;
    return groups
      .map(g => ({ ...g, rows: g.rows.filter(r => !bought.has(checklistRowKey(r))) }))
      .filter(g => g.rows.length > 0);
    // `bought` — Set, пересоздаётся родителем при каждом изменении: зависимость корректна
  }, [groups, onlyMissing, bought]);

  const toggleGroup = (category: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  /** Подзадача 7: массовые действия — только после подтверждения. */
  const askSetAll = async (on: boolean) => {
    const ok = await confirm(on
      ? {
        title: 'Отметить всё как купленное?',
        message: `Все ${total} поз. чеклиста получат отметку «взято». Отметка открывает ввод чека во вкладке «Закупка и чеки».`,
        confirmLabel: 'Отметить всё',
        cancelLabel: 'Отмена',
        tone: 'warning',
      }
      : {
        title: 'Снять все отметки?',
        message: `${boughtCount} поз. вернутся в состояние «не взято» — отметки, сделанные в магазине, будут потеряны. Ввод чека снова закроется.`,
        confirmLabel: 'Снять всё',
        cancelLabel: 'Отмена',
        tone: 'danger',
      });
    // R10: по логу видно, кто и что сделал с чеклистом (и что действие отменили)
    console.info('[checklist] массовое действие', { on, total, bought: boughtCount, confirmed: ok });
    if (ok) onSetAll(on);
  };

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Липкая шапка: прогресс и массовые действия видны при любом скролле списка.
          30.10.2026 (подзадача 5): две строки — прогресс и тулбар действий;
          «Снять всё» ушло в kebab (случайный сброс отметок исключён). */}
      <div className="checklist-sticky rounded-xl">
        <div className="checklist-head">
          <span className="checklist-head__count keep-num" data-testid="checklist-progress-count">
            {boughtCount} из {total}
          </span>
          <div
            className="flex-1 min-w-[6rem] h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-3)' }}
            role="progressbar"
            aria-valuenow={boughtCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`Взято ${boughtCount} из ${total}`}
            data-testid="checklist-progress"
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percent}%`, background: 'var(--wave-400)' }}
            />
          </div>
          <span className="keep-num chip-delta ok" style={{ padding: '3px 8px' }}>{percent}%</span>
          <span className="keep-pair">
            <InfoTip text="Отметка «взято» привязана к количеству: измените потребность (добавите продукт) — отметка слетит, позицию нужно переподтвердить. В поле «беру» уже подставлено расчётное количество — поправьте, если берёте иначе (на развес, россыпью или упаковками другого объёма)." />
          </span>
        </div>
        <div className="checklist-toolbar">
          <Button
            variant={onlyMissing ? 'soft' : 'ghost'}
            icon={<Filter size={15} />}
            aria-pressed={onlyMissing}
            data-testid="checklist-only-missing"
            onClick={() => setOnlyMissing(v => !v)}
          >
            Осталось · {leftCount}
          </Button>
          <Button
            variant="soft"
            data-testid="checklist-all"
            onClick={() => void askSetAll(true)}
            aria-label="Отметить всё купленным"
            disabled={total === 0 || boughtCount === total}
          >
            Отметить всё
          </Button>
          <KebabMenu
            label="Массовые действия чеклиста"
            testId="checklist-kebab"
            items={[
              {
                id: 'none',
                label: 'Снять всё',
                danger: true,
                testId: 'checklist-none',
                onSelect: () => { void askSetAll(false); },
              },
            ]}
          />
        </div>
      </div>

      {total === 0 && (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }} data-testid="checklist-empty">
          В закупке нет позиций — добавьте приёмы пищи или продукты к дню/походу.
        </div>
      )}
      {total > 0 && visibleGroups.length === 0 && (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }} data-testid="checklist-all-bought">
          Всё взято 🎉 Снимите фильтр «только не взятое», чтобы увидеть весь список.
        </div>
      )}

      {visibleGroups.map(group => {
        const isCollapsed = collapsed.has(group.category);
        const groupBought = group.rows.filter(r => bought.has(checklistRowKey(r))).length;
        return (
          <div key={group.category} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <button
              type="button"
              className="checklist-group-toggle"
              onClick={() => toggleGroup(group.category)}
              aria-expanded={!isCollapsed}
              data-testid={`checklist-group-${group.category}`}
            >
              {isCollapsed ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              <span className="flex-1 min-w-0 truncate">{group.category}</span>
              <span className="keep-num cap" style={{ color: 'var(--text-3)' }}>
                {groupBought}/{group.rows.length}
              </span>
            </button>
            {!isCollapsed && group.rows.map(row => {
              // Fix-5 (п.9): ключ отметки включает количество — потребность
              // изменилась (добавили ещё) ⇒ галочка слетает автоматически.
              const boughtKey = checklistRowKey(row);
              const isBought = bought.has(boughtKey);
              // Fix-5 (п.21) + Fix-7 (п.22) + Fix-8 (п.6): свободный ввод
              // «сколько реально берём». Сохранённый факт переживает изменение
              // потребности (люди/состав) — пользовательский ввод не стирается;
              // пока факта нет — поле ПРЕДЗАПОЛНЕНО расчётным количеством.
              const storedActual = actualQty[row.ingredientId] ?? null;
              const actual = storedActual ?? neededAsActual(row.buyAmount, row.unit);
              // Fix-6 (п.9): куплено МЕНЬШЕ нужного — подсветка предупреждением
              const underfilled = isBought && actual != null
                ? isActualLessThanNeeded(actual, row.needed, row.unit, row.pieceWeightG)
                : null;
              const packHintStr = row.packsToBuy != null && row.packSize
                ? `нужно ${formatAmount(row.needed, row.unit)} ≈ ${row.packsToBuy} × ${formatAmount(row.packSize, row.unit)}`
                : `нужно ${formatAmount(row.needed, row.unit)}`;
              // 30.10.2026 (подзадача 5): взята позиция — строка говорит, СКОЛЬКО
              // взяли (мок: «взяли 6,625 л»); не взята — сколько нужно.
              const tookStr = actual != null ? `${formatAmount(actual.amount, actual.unit)}` : '';
              return (
                <div
                  key={row.ingredientId}
                  className="checklist-row flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  data-testid={`checklist-row-${row.ingredientId}`}
                  style={{
                    borderTop: '1px solid var(--border)',
                    opacity: isBought && !underfilled ? 0.6 : 1,
                    background: underfilled ? 'color-mix(in srgb, var(--amber-500) 10%, transparent)' : undefined,
                  }}
                  onClick={() => onToggleRow(boughtKey)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleRow(boughtKey); } }}
                  aria-label={`${isBought ? 'Взято' : 'Отметить взятым'}: ${row.name}`}
                >
                  <input
                    type="checkbox"
                    checked={isBought}
                    onChange={() => onToggleRow(boughtKey)}
                    onClick={(e) => e.stopPropagation()}
                    data-testid={`bought-checkbox-${row.ingredientId}`}
                    aria-label={`Взято: ${row.name}`}
                    className="checklist-check cursor-pointer shrink-0"
                    style={{ accentColor: 'var(--w2)' }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold" style={{ color: 'var(--text)', textDecoration: isBought ? 'line-through' : 'none' }}>
                      {row.name}
                    </span>
                    <span className="block cap" style={{ color: underfilled ? 'var(--amber-300)' : 'var(--muted)' }}>
                      {underfilled
                        ? `⚠ взяли меньше, чем нужно · ${packHintStr}`
                        : isBought
                          ? `взяли ${tookStr}`
                          : packHintStr}
                    </span>
                  </span>
                  {/* Fix-6 (п.8): свободные единицы — «беру 300 г» даже если учтён в штуках.
                      30.10.2026 (подзадача 5/9): единица — UnitChip (bottom-sheet). */}
                  <span className="checklist-amount shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <FreeAmountInput
                      value={actual}
                      baseUnit={row.unit}
                      pieceWeightG={row.pieceWeightG}
                      onChange={(v) => onCommitActualQty(row.ingredientId, v, row.needed)}
                      ariaLabel={`Сколько реально берёте: ${row.name}`}
                      testId={`actual-qty-${row.ingredientId}`}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Подзадача 7: брендовый диалог подтверждения массовых действий */}
      {confirmDialog}
    </div>
  );
}

export default ChecklistTab;
