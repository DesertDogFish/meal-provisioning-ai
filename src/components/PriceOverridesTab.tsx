/**
 * Этап ④ «Чеки и итог».
 *
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5, поглощает BL-26):
 * компонент БОЛЬШЕ НЕ грузит данные сам (trip/recipes/tripRecipes/prices/
 * manualItems/tripEdits//admin/products — всё уже загрузила страница через
 * useTripDetail) и НЕ считает закупку своей копией пайплайна. Строки чека —
 * из общей view-модели `deriveTripView` (utils/tripDerived → ChecksModel):
 * суммы этапов ② и ④ идентичны по построению (инвариант подтверждён юнит-тестом
 * ChecksModel.test.ts). Переход на этап ④ не делает сетевых запросов.
 *
 * Мутации факт-цен остаются в ④ (saveActualPrice + PUT price-overrides) —
 * через колбэки страницы, чтобы этап ② перерисовывался без дубля событий
 * (общий стейдж tripStaging рассылает событие, страница синхронизирует view).
 *
 * Декомпозиция (R8/R9): презентация — ChecksTable (десктоп), ChecksMobile
 * (мобильные строки), WhoOwesBlock («кто сколько должен», общий с отчётом);
 * чистая view-модель — ChecksModel. Здесь — только компоновка этапа.
 */
import { useMemo } from 'react';
import { Receipt } from 'lucide-react';
import { formatRub } from '../utils/format';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import type { ChecklistActual, ActualPriceDraft } from '../utils/tripStaging';
import type { ActualAmount } from '../utils/checkUnits';
import type { TripView } from '../utils/tripDerived';
import type { Trip } from '../types/tripDetail';
import {
  buildCheckRows, groupCheckRows, dayPlanFacts, checkTotals,
  calculateDelta, formatDelta, getDeltaChipClass, type CheckRow,
} from './ChecksModel';
import { ChecksTable } from './ChecksTable';
import { ChecksMobile } from './ChecksMobile';
import { WhoOwesBlock, type WhoOwesDay } from './WhoOwesBlock';

export interface PriceOverridesTabProps {
  trip: Trip;
  /** общая view-модель страницы похода (deriveTripView) */
  view: TripView;
  /** черновики факт-цен (локальный стейдж поверх серверных оверрайдов) */
  draftOverrides: Record<string, ActualPriceDraft>;
  excluded: Set<string>;
  boughtSet: Set<string>;
  actualQty: Record<string, ChecklistActual>;
  /** фиксация факт-цены: сумма чека за позицию (колбэк страницы — staging + PUT) */
  onCommitActualTotal: (row: CheckRow, total: number | null) => Promise<void> | void;
  onToggleExcluded: (ingredientId: string) => void;
  onToggleBought: (key: string) => void;
  onCommitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
  /** navigation-п.3: CTA пустого состояния — переключить этап на «Закупка ②» */
  onGoToShopping?: () => void;
  /** navigation-п.3: кнопка в locked-ноте — переключить этап на «Магазин ③» */
  onGoToStore?: () => void;
}

export default function PriceOverridesTab(props: PriceOverridesTabProps) {
  const {
    trip, view, excluded, boughtSet, actualQty,
    onCommitActualTotal, onToggleExcluded, onToggleBought, onCommitTook,
    onGoToShopping, onGoToStore,
  } = props;

  // Строки/группы/дни/итоги — из общей view-модели (без своих расчётов и запросов)
  const rows = useMemo(() => buildCheckRows(view), [view]);
  const groups = useMemo(() => groupCheckRows(rows, view), [rows, view]);
  const dayFacts = useMemo(() => dayPlanFacts(view), [view]);
  const { totalPlanned, totalActual } = useMemo(() => checkTotals(rows), [rows]);

  // Fix-6 (п.8): вес штуки — из общего productInfo (рецепты + справочник)
  const pieceWeightById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const [id, info] of view.productInfo) m.set(String(id), info.pieceWeightG ?? null);
    return m;
  }, [view]);

  // «Кто сколько должен» по дням — люди дня из похода (override ?? default)
  const whoOwesDays = useMemo<WhoOwesDay[]>(() => dayFacts.map(day => ({
    dayDate: day.dayDate,
    people: trip.days?.find(d => d.dayDate === day.dayDate)?.peopleOverride ?? trip.defaultPeople ?? 1,
    actualCost: day.actualCost,
  })), [dayFacts, trip]);

  // Fix-3 (п.2): чек вводим только после подтверждения закупки в чеклисте
  const canEnterCheck = boughtSet.size > 0;
  const totalDelta = calculateDelta(totalPlanned, totalActual);

  return (
    <div className="space-y-4">
      {/* Fix-6 (п.17): одна строка, когда ввод чека закрыт; navigation-п.3 —
          с рабочей кнопкой выхода на этап ③ (больше не тупик) */}
      {!canEnterCheck && (
        <div className="note-box" style={{ color: 'var(--fire, #d97706)' }} data-testid="checks-locked-note">
          Суммы из чека можно вводить, когда на этапе «Магазин» отмечено хотя бы одно «взято».
          {onGoToStore && (
            <div className="pt-2">
              <Button variant="soft" className="min-h-[44px]" onClick={onGoToStore} data-testid="checks-to-store">
                К магазину ③
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Подзадача 6 (30.10): «Кто сколько должен» — СВЕРХУ этапа, виден без скролла */}
      <WhoOwesBlock totalActual={totalActual} realPeople={view.realPeople} days={whoOwesDays} />

      {/* Подзадача 6: липкая строка итогов «План · Факт · Δ» */}
      <div className="planfact-strip checklist-sticky max-w-3xl" data-testid="planfact-strip">
        <span className="keep-pair">План <b className="keep-num" style={{ color: 'var(--text)' }}>{formatRub(totalPlanned)}</b></span>
        <span className="keep-pair">Факт <b className="keep-num" style={{ color: 'var(--w1)' }}>{formatRub(totalActual)}</b></span>
        <span className={`chip-delta keep-num ${getDeltaChipClass(totalDelta)}`}>{formatDelta(totalDelta)}</span>
        {excluded.size > 0 && (
          <span className="keep-pair cap" style={{ color: 'var(--muted)' }}>
            без <span className="keep-num">{excluded.size} искл.</span>
          </span>
        )}
      </div>

      {/* navigation-п.3: нет позиций — пустое состояние с выходом на закупку ② */}
      {rows.length === 0 && (
        <EmptyState
          icon={<Receipt size={30} />}
          title="Нет позиций для чека"
          hint="Сначала соберите закупку: добавьте приёмы пищи в меню, затем отметьте «взято» в магазине."
          ctaLabel="К закупке ②"
          onCta={onGoToShopping}
          testId="checks-empty"
        />
      )}

      {/* Мобильные компактные строки чека (детали — раскрытие по тапу) */}
      {rows.length > 0 && (
      <ChecksMobile
        groups={groups}
        excluded={excluded}
        actualMap={actualQty}
        pieceWeightById={pieceWeightById}
        canEnterCheck={canEnterCheck}
        boughtSet={boughtSet}
        factCount={view.factCount}
        factsTotal={view.factsTotal}
        onToggleBought={onToggleBought}
        onCommitActualTotal={onCommitActualTotal}
        onCommitTook={onCommitTook}
        onToggleExcluded={onToggleExcluded}
      />
      )}

      {/* Десктоп: таблица чека + план/факт по дням */}
      {rows.length > 0 && (
      <ChecksTable
        groups={groups}
        dayFacts={dayFacts}
        excluded={excluded}
        actualMap={actualQty}
        pieceWeightById={pieceWeightById}
        canEnterCheck={canEnterCheck}
        totalPlanned={totalPlanned}
        totalActual={totalActual}
        onCommitActualTotal={onCommitActualTotal}
        onCommitTook={onCommitTook}
        onToggleExcluded={onToggleExcluded}
      />
      )}
    </div>
  );
}
