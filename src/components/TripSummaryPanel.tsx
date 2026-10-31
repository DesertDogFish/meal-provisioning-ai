/**
 * Подзадача 26 аудита (2026-10-29): KPI-карточки и полоса «Готовность похода» —
 * вынесены из `TripDetailPage.tsx` (R8/R9). Компонент презентационный: цифры
 * приходят из `deriveTripView` (utils/tripDerived) через props страницы.
 *
 * Fix-3 (п.2) + Fix-4 (п.9): готовность — СКВОЗНАЯ, видна на каждой вкладке:
 * цепочка «меню → закупка → чеки».
 *
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 1): на <768px блок
 * 2×2 плиток + цепочку (~1100px служебной информации) заменяет ОДНА sticky-
 * полоса в одну строку: «4 дн · 13 приёмов · 1 630 ₽ · 435 ₽/чел» + мини-
 * степпер этапов. Тап по полосе раскрывает bottom-sheet с прежними KPI и
 * готовностью (данные те же — дублей состояния нет). Кнопка отчёта на
 * мобильном переезжает в этап ④ и в kebab шапки (props onOpenReport).
 */
import { useState } from 'react';
import { ChevronRight, ChevronDown, FileDown, Check } from 'lucide-react';
import InfoTip from './InfoTip';
import { Button } from './Button';
import BottomSheet from './BottomSheet';
import { STAGES, type StageId } from './StageTabBar';
import { formatRub } from '../utils/format' // cleanup-п.9: shim formatRub удалён; // Фаза 13: итоги — целые рубли
import { pluralize } from '../utils/pluralize';
import type { TripReadiness } from '../utils/readiness';
import type { Trip } from '../types/tripDetail';

export interface TripSummaryPanelProps {
  trip: Trip;
  /** totalCost/costPerDefaultPerson — из единого источника (shoppingTotalFinal) */
  tripSummary: { totalCost: number; costPerDefaultPerson: number };
  /** U33: реальное число людей (среднее по дням с учётом переопределений) */
  realPeople: number;
  readiness: TripReadiness;
  /** «Взято N из M» — отметки чеклиста */
  boughtInList: number;
  checklistTotal: number;
  /** «Чек: введено N из M» — позиции с фактической ценой */
  factCount: number;
  factsTotal: number;
  /** мобильный воркфлоу: текущий этап и статусы этапов для мини-степпера */
  stage?: StageId;
  done?: Record<StageId, boolean>;
  /**
   * transparency-п.2 (решение владельца 31.10 — «кликабельные чипы»): чипы
   * готовности = переключение этапа. С колбэком чип становится кнопкой;
   * без колбэка — прежний статичный вид (мобильный sheet тоже получает его).
   */
  onStage?: (s: StageId) => void;
  /** мобильный переход к отчёту (этап ④ / kebab шапки дублируют кнопку) */
  onOpenReport?: () => void;
}

export function TripSummaryPanel({
  trip, tripSummary, realPeople, readiness, boughtInList, checklistTotal, factCount, factsTotal,
  stage, done, onStage, onOpenReport,
}: TripSummaryPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const days = trip.days?.length || 0;
  const meals = trip.days?.reduce((a, d) => a + (d.meals?.length || 0), 0) || 0;

  /**
   * transparency-п.1: ОДИН словарь этапов во всём UI — каждый чип соответствует
   * своему этапу ①②③④ (STAGES из StageTabBar): «Меню собрано → Закупка: N поз. →
   * Магазин: взято N из M → Чек: введено N из M». Прежний чип «Закупка: взято…»
   * описывал этап ③ «Магазин» — исправлено.
   * transparency-п.2: чипы кликабельны (= переключение этапа), готовность этапа ② —
   * «в закупке есть позиции» (тот же критерий, что у `done.shopping` страницы).
   */
  const chipDefs: { id: StageId; text: string; ok: boolean }[] = [
    { id: 'menu', text: `Меню ${readiness.menu === 'done' ? 'собрано' : 'пустое'}`, ok: readiness.menu === 'done' },
    { id: 'shopping', text: `Закупка: ${checklistTotal} ${pluralize(checklistTotal, ['позиция', 'позиции', 'позиций'])}`, ok: checklistTotal > 0 },
    { id: 'store', text: `Магазин: взято ${boughtInList} из ${checklistTotal}`, ok: readiness.store === 'done' },
    { id: 'checks', text: `Чек: введено ${factCount} из ${factsTotal}`, ok: readiness.checks === 'done' },
  ];

  const readinessChips = (
    <>
      {chipDefs.map((st, i) => (
        <span key={st.id} className="inline-flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={13} style={{ color: 'var(--line-strong)' }} aria-hidden />}
          {onStage ? (
            <button
              type="button"
              className="px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap min-h-[32px]"
              style={st.ok
                ? { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' }
                : { background: 'var(--elev)', color: 'var(--muted)' }}
              data-testid={`stage-chip-${st.id}`}
              aria-current={stage === st.id ? 'step' : undefined}
              title={`Перейти к этапу «${STAGES.find(s => s.id === st.id)?.label}»`}
              onClick={() => { setSheetOpen(false); onStage(st.id); }}
            >
              {st.ok ? '✓ ' : '○ '}{st.text}
            </button>
          ) : (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap"
              style={st.ok
                ? { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' }
                : { background: 'var(--elev)', color: 'var(--muted)' }}
            >
              {st.ok ? '✓ ' : '○ '}{st.text}
            </span>
          )}
        </span>
      ))}
      <ChevronRight size={13} style={{ color: 'var(--line-strong)' }} aria-hidden />
      <span className="px-2 py-0.5 text-xs font-extrabold rounded-full whitespace-nowrap"
        style={readiness.ready
          ? { background: 'var(--success)', color: '#fff' }
          : { background: 'var(--elev)', color: 'var(--muted)' }}
      >
        {readiness.ready ? 'Поход готов ✓' : 'В процессе'}
      </span>
    </>
  );

  const kpiGrid = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2" style={{ maxWidth: '52rem' }}>
      <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Дней</span>
        <span className="stat-value keep-num text-lg font-bold">{days}</span>
      </div>
      <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Приёмов пищи</span>
        <span className="stat-value keep-num text-lg font-bold">{meals}</span>
      </div>
      <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          <span className="keep-pair">
            Стоимость
            <InfoTip text="Сумма всей закупки: план по ценам справочника, а после ввода чека — фактические суммы. Без исключённых позиций." />
          </span>
        </span>
        {/* Release-1.0: formatRub — целые рубли, неразрывный пробел; без «123,678 ₽» */}
        <span className="stat-value keep-num text-lg font-bold">{formatRub(tripSummary.totalCost)}</span>
      </div>
      <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          <span className="keep-pair">
            На человека
            <InfoTip text={`Общая стоимость ÷ людей в походе (${Math.round(realPeople * 10) / 10} чел. — среднее по дням с учётом переопределений). Столько платит каждый при равном делении.`} />
          </span>
        </span>
        <span className="stat-value keep-num text-lg font-bold">{formatRub(tripSummary.costPerDefaultPerson)}</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Мобильная компактная sticky-полоса (подзадача 1) */}
      <button
        type="button"
        className="trip-strip"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label="Сводка похода: раскрыть показатели и готовность"
        data-testid="trip-strip"
        onClick={() => setSheetOpen(true)}
      >
        <span className="trip-strip__kpis">
          <span className="keep-num">{days} дн</span>
          <span className="trip-strip__sep" aria-hidden>·</span>
          <span className="keep-num">{meals} {pluralize(meals, ['приём', 'приёма', 'приёмов'])}</span>
          <span className="trip-strip__sep" aria-hidden>·</span>
          <span className="trip-strip__sum keep-num">{formatRub(tripSummary.totalCost)}</span>
          <span className="trip-strip__sep" aria-hidden>·</span>
          <span className="keep-num">{formatRub(tripSummary.costPerDefaultPerson)}/чел</span>
        </span>
        <span className="mini-steps" aria-hidden>
          {STAGES.map((s) => (
            <span key={s.id} className={`mini-step ${done?.[s.id] ? 'done' : ''} ${stage === s.id ? 'active' : ''}`}>
              {done?.[s.id] ? <Check size={11} /> : s.num}
            </span>
          ))}
        </span>
        <ChevronDown size={16} className="chev" aria-hidden />
      </button>
      {sheetOpen && (
        <BottomSheet title="Сводка похода" onClose={() => setSheetOpen(false)} testId="trip-summary-sheet">
          <div className="space-y-3">
            {kpiGrid}
            <div className="readiness-chain rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5"
                 style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {readinessChips}
            </div>
            {onOpenReport && (
              <Button
                variant="soft"
                icon={<FileDown size={15} />}
                onClick={() => { setSheetOpen(false); onOpenReport(); }}
                data-testid="sheet-open-report"
              >
                Отчёт по походу
              </Button>
            )}
          </div>
        </BottomSheet>
      )}

      {/* Десктоп: прежний вид (KPI-строки + сквозная готовность) */}
      <div className="hidden md:block space-y-3">
        {kpiGrid}
        {/* Готовность похода — сквозная полоса на каждой вкладке */}
        <div className="readiness-chain rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5"
             style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Fix-6 (п.10/17/п.28-диаграмма): тонкий степпер — шаги маршрута со стрелками:
              Меню → Закупка → Чек → Готов; подсказки про «отметьте покупки» убраны
              (шум), CTA без слова «черновик». */}
          {readinessChips}
          <span className="ml-auto">
            <Button
              variant={readiness.ready ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => window.open(`/trips/${trip.id}/print`, '_blank')}
              aria-label={readiness.ready ? 'Сформировать отчёт' : 'Посмотреть отчёт'}
              title="Печатная версия: меню по дням, закупка, итоги — сохраняется в PDF"
              icon={<FileDown size={15} />}
            >
              {readiness.ready ? 'Сформировать отчёт' : 'Посмотреть отчёт'}
            </Button>
          </span>
        </div>
      </div>
    </>
  );
}

export default TripSummaryPanel;
