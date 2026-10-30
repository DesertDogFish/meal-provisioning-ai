import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Share2, Printer } from 'lucide-react';
import PageLoader from '../components/PageLoader';
import { Button } from '../components/Button';
import { useToast } from '../components/ToastProvider';
import { api, getRecipes, getTripRecipes } from '../api/client';
import { getManualItems, type TripManualItem } from '../api/tripManualItems';
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits';
import { loadActualPrices, loadExcluded, loadBought } from '../utils/tripStaging';
import { deriveTripView } from '../utils/tripDerived';
import { formatRub, formatQty } from '../utils/format';
import { pluralize } from '../utils/pluralize';
import { mealsWord } from '../utils/text';
import { mealTypeLabels } from '../components/TripMealCard';
import type { Trip, Recipe, Price } from '../types/tripDetail';

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 7): in-app отчёт
 * `/trips/:id/report` — финал воркфлоу на телефоне. Без Layout: одна колонка —
 * шапка похода, меню по дням (день → приёмы списком, без двухколоночной сетки
 * на <768px), закупка итого, «кто сколько должен» крупно. Кнопки «Поделиться»
 * (Web Share API с фолбэком «скопировать текст») и «PDF» (открывает существующий
 * print-маршрут — он остаётся для десктопа/печати, `TripPrintPage` не трогаем).
 *
 * Данные — те же view-модели `deriveTripView`, что и на странице похода:
 * цифры отчёта не могут разойтись с цифрами вкладок.
 */
export default function TripReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [view, setView] = useState<ReturnType<typeof deriveTripView> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [tripData, recipesData, pricesData, tripRecipesData, manualData, editsData] = await Promise.all([
          api.get<Trip>(`/trips/${id}`),
          getRecipes(),
          api.get<Price[]>(`/trips/${id}/prices`).catch(() => [] as Price[]),
          getTripRecipes(String(id)).catch(() => [] as Recipe[]),
          getManualItems(String(id)).catch(() => [] as TripManualItem[]),
          getTripEdits(String(id)).catch(() => [] as TripIngredientEdit[]),
        ]);
        const recipesMap = new Map<string, Recipe>(
          [...recipesData, ...tripRecipesData].map(r => [String(r.id), r]),
        );
        const v = deriveTripView({
          trip: tripData as any,
          recipes: recipesData as any,
          tripRecipes: tripRecipesData as any,
          recipesMap: recipesMap as any,
          tripEdits: editsData,
          prices: pricesData as any,
          manualItems: manualData,
          products: [],
          draftOverrides: loadActualPrices(String(id)),
          shoppingExcluded: loadExcluded(String(id)),
          checklistBought: loadBought(String(id)),
          sortSpec: { field: 'ingredientName', dir: 'asc' },
        });
        if (cancelled) return;
        setTrip(tripData);
        setView(v);
      } catch (e: any) {
        if (!cancelled) setError(e?.detail || 'Не удалось загрузить отчёт');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /** Текст итога для «Поделиться» (мок: «отдаёт текст итога в мессенджер»). */
  const shareText = useMemo(() => {
    if (!trip || !view) return '';
    const days = trip.days?.length || 0;
    const meals = view.menuByDays.reduce((a, d) => a + d.meals.length, 0);
    const lines = [
      `Поход «${trip.name}» ${new Date(trip.startDate).toLocaleDateString('ru-RU')} — ${new Date(trip.endDate).toLocaleDateString('ru-RU')}`,
      `${days} ${pluralize(days, ['день', 'дня', 'дней'])} · ${meals} ${pluralize(meals, ['приём', 'приёма', 'приёмов'])} · ${view.realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} чел.`,
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
    } catch (e: any) {
      // Фолбэк: скопировать текст итога (e2e проверяет именно его)
      try {
        await navigator.clipboard.writeText(shareText);
        showSuccess('Текст итога скопирован — вставьте в мессенджер');
      } catch {
        showError('Не удалось поделиться: скопируйте текст вручную');
      }
    }
  };

  if (loading) return <PageLoader />;
  if (error || !trip || !view) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: 'var(--fire)' }}>{error || 'Отчёт не найден'}</p>
        <Button variant="ghost" onClick={() => navigate('/trips')} className="mt-4">← Назад к походам</Button>
      </div>
    );
  }

  const days = trip.days?.length || 0;
  const mealsCount = view.menuByDays.reduce((a, d) => a + d.meals.length, 0);
  const factTotal = view.shoppingTotalFinal;

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4" data-testid="trip-report">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <Button variant="ghost" onClick={() => navigate(`/trips/${trip.id}`)} aria-label="Назад к походу">
              <ArrowLeft size={20} />
            </Button>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: 'var(--text)' }}>Отчёт по походу</h1>
          </div>
        </div>

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

        <section className="who-owes" data-testid="report-owe">
          <b style={{ color: 'var(--text)' }}>Итог: поровну</b>
          {Array.from({ length: Math.max(1, Math.round(view.realPeople)) }, (_, i) => (
            <div className="who-owes__row" key={i}>
              <span className="avatar-chip" aria-hidden>{i + 1}</span>
              <span className="flex-1">Участник {i + 1}</span>
              <b className="keep-num" style={{ color: 'var(--text)' }}>{formatRub(view.tripSummary.costPerDefaultPerson)}</b>
            </div>
          ))}
        </section>

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

        <p className="cap" style={{ color: 'var(--text-2)' }}>
          Одна колонка, без горизонтального скролла; «Поделиться» отдаёт текст итога в мессенджер, «PDF» — прежний печатный маршрут.
        </p>
      </div>
    </div>
  );
}
