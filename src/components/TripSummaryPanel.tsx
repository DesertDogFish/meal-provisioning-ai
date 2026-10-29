/**
 * Подзадача 26 аудита (2026-10-29): KPI-карточки и полоса «Готовность похода» —
 * вынесены из `TripDetailPage.tsx` (R8/R9). Компонент презентационный: цифры
 * приходят из `deriveTripView` (utils/tripDerived) через props страницы.
 *
 * Fix-3 (п.2) + Fix-4 (п.9): готовность — СКВОЗНАЯ, видна на каждой вкладке:
 * цепочка «меню → закупка → чеки».
 */
import { ChevronRight, FileDown } from 'lucide-react';
import InfoTip from './InfoTip';
import { Button } from './Button';
import { formatRub } from '../utils/formatRub'; // Фаза 13: итоги — целые рубли
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
}

export function TripSummaryPanel({
  trip, tripSummary, realPeople, readiness, boughtInList, checklistTotal, factCount, factsTotal,
}: TripSummaryPanelProps) {
  return (
    <>
      {/* Summary cards — Fix-6 (п.16): тонкие строки вместо крупных плиток */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" style={{ maxWidth: '52rem' }}>
        <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Дней</span>
          <span className="stat-value keep-num text-lg font-bold">{trip.days?.length || 0}</span>
        </div>
        <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Приёмов пищи</span>
          <span className="stat-value keep-num text-lg font-bold">{trip.days?.reduce((a, d) => a + (d.meals?.length || 0), 0) || 0}</span>
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

      {/* Готовность похода — сквозная полоса на каждой вкладке */}
      <div className="readiness-chain rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Fix-6 (п.10/17/п.28-диаграмма): тонкий степпер — шаги маршрута со стрелками:
            Меню → Закупка → Чек → Готов; подсказки про «отметьте покупки» убраны
            (шум), CTA без слова «черновик». */}
        {/* Fix-7 (п.16): стрелка ПЕРЕД первым шагом («Меню собрано») убрана —
            шевроны только между шагами маршрута */}
        {[
          { text: `Меню ${readiness.menu === 'done' ? 'собрано' : 'пустое'}`, ok: readiness.menu === 'done' },
          { text: `Закупка: взято ${boughtInList} из ${checklistTotal}`, ok: readiness.shopping === 'done' },
          { text: `Чек: введено ${factCount} из ${factsTotal}`, ok: readiness.checks === 'done' },
        ].map((st, i) => (
          <span key={st.text} className="inline-flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={13} style={{ color: 'var(--line-strong)' }} aria-hidden />}
            <span className="px-2 py-0.5 text-xs font-bold rounded-full whitespace-nowrap"
              style={st.ok
                ? { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' }
                : { background: 'var(--elev)', color: 'var(--muted)' }}
            >
              {st.ok ? '✓ ' : '○ '}{st.text}
            </span>
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
    </>
  );
}

export default TripSummaryPanel;
