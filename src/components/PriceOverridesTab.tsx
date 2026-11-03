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
 * (мобильные строки); чистая view-модель — ChecksModel. Здесь — только
 * компоновка этапа.
 *
 * bugs-trip-checks-stage пп.1–2,5 (владелец 03.11.2026): этап ④ — только
 * фактическая стоимость. WhoOwesBlock («кто сколько должен») убран — он живёт
 * в отчёте (TripReportPage) и переедет на экран «Поход готов»
 * (tasks/trip-workflow-redesign.md). Липкая полоса «План · Факт · Δ» убрана;
 * внизу таблицы — один «Итог» = сумма введённых чеков (enteredFactsTotal).
 */
import { useMemo } from 'react';
import { Receipt } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import type { ChecklistActual, ActualPriceDraft } from '../utils/tripStaging';
import type { ActualAmount } from '../utils/checkUnits';
import type { TripView } from '../utils/tripDerived';
import type { Trip } from '../types/tripDetail';
import {
  buildCheckRows, groupCheckRows, dayPlanFacts, enteredFactsTotal, type CheckRow,
} from './ChecksModel';
import { ChecksTable } from './ChecksTable';
import { ChecksMobile } from './ChecksMobile';

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
    view, excluded, boughtSet, actualQty,
    onCommitActualTotal, onToggleExcluded, onToggleBought, onCommitTook,
    onGoToShopping, onGoToStore,
  } = props;

  // Строки/группы/дни/итоги — из общей view-модели (без своих расчётов и запросов)
  const rows = useMemo(() => buildCheckRows(view), [view]);
  const groups = useMemo(() => groupCheckRows(rows, view), [rows, view]);
  const dayFacts = useMemo(() => dayPlanFacts(view), [view]);
  // bugs-trip-checks-stage п.5: один «Итог» — сумма введённых чеков;
  // null, пока чеков нет («нет данных», план за факт не выдаётся)
  const enteredTotal = useMemo(() => enteredFactsTotal(rows), [rows]);

  // Fix-6 (п.8): вес штуки — из общего productInfo (рецепты + справочник)
  const pieceWeightById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const [id, info] of view.productInfo) m.set(String(id), info.pieceWeightG ?? null);
    return m;
  }, [view]);

  // Fix-3 (п.2): чек вводим только после подтверждения закупки в чеклисте
  const canEnterCheck = boughtSet.size > 0;

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
        enteredTotal={enteredTotal}
        onCommitActualTotal={onCommitActualTotal}
        onCommitTook={onCommitTook}
        onToggleExcluded={onToggleExcluded}
      />
      )}
    </div>
  );
}
