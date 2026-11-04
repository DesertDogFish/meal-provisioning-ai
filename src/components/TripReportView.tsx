import { useMemo } from 'react';
import { Share2, Printer } from 'lucide-react';

import type { TripView } from '../utils/tripDerived';
import type { Trip } from '../types/tripDetail';
import { formatRub, formatQty } from '../utils/format';
import { pluralize } from '../utils/pluralize';
import { mealsWord, mealTypeLabels, daysCountLabel } from '../utils/text';

import { WhoOwesBlock } from './WhoOwesBlock';
import { useToast } from './ToastProvider';
import { Button } from './Button';

/**
 * trip-workflow-redesign п.5 (R8): тело отчёта похода — ОДИН компонент на два
 * экрана: этап ⑤ «Поход готов» внутри страницы похода (?stage=ready) и… только
 * его: одинокая страница /trips/:id/report удалена, роут — редирект на ⑤
 * (ReportRedirect, шаринг-ссылки не ломаются).
 * Цифры — те же view-модели deriveTripView, что и вкладки: отчёт не может
 * разойтись с этапами. «Поделиться» — Web Share API с фолбэком «скопировать
 * текст», «PDF» — прежний печатный маршрут (TripPrintPage не трогаем).
 */
export interface TripReportViewProps {
  trip: Trip;
  view: TripView;
}

export function TripReportView({ trip, view }: TripReportViewProps) {
  const { showSuccess, showError } = useToast();

  /** Текст итога для «Поделиться» (мок: «отдаёт текст итога в мессенджер»). */
  const shareText = useMemo(() => {
    const days = trip.days?.length || 0;
    const meals = view.menuByDays.reduce((a, d) => a + d.meals.length, 0);
    const lines = [
      `Поход «${trip.name}» ${new Date(trip.startDate).toLocaleDateString('ru-RU')} — ${new Date(trip.endDate).toLocaleDateString('ru-RU')}`,
      `${daysCountLabel(days)} · ${meals} ${mealsWord(meals)} · ${view.realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} чел.`,
      `Закупка: ${formatRub(view.tripSummary.totalCost)} · по ${formatRub(view.tripSummary.costPerDefaultPerson)} на человека`,
      '',
      'Кто сколько должен (поровну):',
      ...Array.from({ length: Math.max(1, Math.round(view.realPeople)) }, (_, i) =>
        `  ${i + 1}. ${formatRub(view.tripSummary.costPerDefaultPerson)}`),
    ];
    return lines.join('\n');
  }, [trip, view]);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: trip?.name, text: shareText });
        return;
      }
      throw new Error('no-share');
    } catch {
      // Фолбэк: скопировать текст итога (e2e проверяет именно его)
      try {
        await navigator.clipboard.writeText(shareText);
        showSuccess('Текст итога скопирован — вставьте в мессенджер');
      } catch {
        showError('Не удалось поделиться: скопируйте текст вручную');
      }
    }
  };

  const days = trip.days?.length || 0;
  const mealsCount = view.menuByDays.reduce((a, d) => a + d.meals.length, 0);
  const factTotal = view.shoppingTotalFinal;

  return (
    <div className="space-y-4" data-testid="trip-report-view">
      <header className="space-y-2">
        <h2 className="text-2xl md:text-3xl font-extrabold" style={{ color: 'var(--text)' }}>{trip.name}</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }} data-testid="report-summary-line">
          {new Date(trip.startDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} — {new Date(trip.endDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · {view.realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} чел. · {days} {pluralize(days, ['день', 'дня', 'дней'])} · {mealsCount} {mealsWord(mealsCount)} · факт {formatRub(factTotal)} · {formatRub(view.tripSummary.costPerDefaultPerson)}/чел
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Share2 size={16} />} onClick={() => void share()} data-testid="report-share">
            Поделиться итогом
          </Button>
          <Button variant="soft" icon={<Printer size={16} />} onClick={() => window.open(`/trips/${trip.id}/print`, '_blank')} data-testid="report-pdf">
            PDF
          </Button>
        </div>
      </header>

      <WhoOwesBlock variant="report" totalActual={factTotal} realPeople={view.realPeople} />

      {/* Меню по дням: одна колонка, день → приёмы списком (мок mock-06) */}
      <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} data-testid="report-menu">
        {view.menuByDays.map(day => (
          <div key={day.dayDate} style={{ borderTop: '1px solid var(--border)' }}>
            <div className="px-4 py-3" style={{ background: 'var(--elev)' }}>
              <b className="uppercase tracking-wide" style={{ color: 'var(--w1)', fontSize: 'var(--fs-small)' }}>
                {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}{day.effectivePeople} чел.
              </b>
            </div>
            {day.meals.map((meal, mi) => (
              <div key={`${meal.recipeId}-${mi}`} className="px-4 py-3 grid grid-cols-[6rem_minmax(0,1fr)] gap-3" style={{ borderTop: '1px dashed var(--line)' }}>
                <span className="cap font-bold" style={{ color: 'var(--text-2)' }}>{mealTypeLabels[meal.mealType]}</span>
                <span className="min-w-0">
                  <b style={{ color: 'var(--text)' }}>{meal.recipeName}</b>
                  <span className="keep-num" style={{ color: 'var(--text-2)' }}> · {meal.servings} порц.</span>
                  <span className="block cap" style={{ color: 'var(--text-2)' }}>
                    {meal.ingredients.map(ing => `${ing.name} ${formatQty(ing.amount, ing.unit)}`).join(' · ')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* Закупка итого */}
      <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} data-testid="report-shopping">
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--elev)' }}>
          <b style={{ color: 'var(--text)' }}>Закупка</b>
          <span className="keep-num cap" style={{ color: 'var(--text-2)' }}>{view.checklistRowIds.length} поз.</span>
        </div>
        {view.sortedShopping.map(row => (
          <div key={String(row.ingredientId)} className="px-4 py-2 flex items-baseline justify-between gap-3" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="min-w-0 truncate" style={{ color: 'var(--text)' }}>{row.ingredientName}</span>
            <span className="keep-num shrink-0" style={{ color: 'var(--text-2)' }}>
              {formatQty(row.totalAmount, row.unit)} · <b style={{ color: 'var(--amber-300)' }}>{formatRub(row.effectiveCost ?? row.estimatedCost ?? 0)}</b>
            </span>
          </div>
        ))}
        <div className="px-4 py-3 flex items-baseline justify-between" style={{ borderTop: '1px solid var(--border)', background: 'var(--elev)' }}>
          <b style={{ color: 'var(--text)' }}>Итого</b>
          <b className="keep-num" style={{ color: 'var(--amber-300)' }}>{formatRub(factTotal)}</b>
        </div>
      </section>
    </div>
  );
}

export default TripReportView;
