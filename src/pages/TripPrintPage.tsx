import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { api, getRecipes, getTripRecipes } from '../api/client';
import {
  calculateMenuByDays, calculateShoppingList, calculateDayShopping,
  calculatePersonSummary, formatAmount, realTripPeople, getEffectivePeople,
  dayScopedExclusions, isRowExcluded, findPriceForDate,
} from '../utils/calculations';
import { formatRub } from '../utils/formatRub';
import { loadActualPrices, loadExcluded, loadBought, loadActualQty, factIsFresh, type ChecklistActual } from '../utils/tripStaging';
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits';
import { getManualItems, type TripManualItem } from '../api/tripManualItems';
import { mergeManualIntoShopping, manualForDay, manualForTrip } from '../utils/manualItems';
import { buildEffectiveRecipesMap } from '../utils/recipeEdits'; // Fix-6 (п.22/25)
import { buildChecklist, type ChecklistProductInfo } from '../utils/checklist';
import { categoryName } from '../utils/format';
import { totalFromUnit, roundMoney } from '../utils/checkInput';
import type { IngredientPrice, MealType } from '../types';

/**
 * Fix-4 (список 26.10, п.6): печатная версия похода — «красивый PDF» вместо
 * убогого чека. Маршрут /trips/:id/print (без Layout): документ открывается
 * в новой вкладке и сам предлагает диалог печати (в нём — «Сохранить как PDF»).
 *
 * Разделы (каждый — отдельная страница, .print-page):
 *  1. Меню по дням — СТРАНИЦА НА ДЕНЬ: приёмы, составы (с правками), позиции дня.
 *  2. Закупка — сводка по продуктам: категории, упаковки (чеклист), план/факт ₽.
 *  3. Деньги и выводы — итоги план/факт/Δ, на человека, на человеко-приём,
 *     разбивка по дням «кто сколько должен» (день / люди / сумма / на человека).
 *
 * Данные — тот же клиентский конвейер, что на странице похода (единый источник
 * цифр): trip + snowshot-рецепты + цены + серверные правки состава + ручные
 * позиции + стейдж фактов/исключений/отметок чеклиста.
 */

// Fix-6 (п.3): цвета групп приёмов — те же оттенки, что у бейджей в приложении
const MEAL_PRINT_STYLE: Record<MealType, { bg: string; border: string; color: string }> = {
  BREAKFAST: { bg: '#FDF3D9', border: '#E7D3A0', color: '#8A6100' },
  LUNCH:     { bg: '#DDF2EE', border: '#A8DAD1', color: '#0F7A6E' },
  DINNER:    { bg: '#E4E9F7', border: '#B9C4E4', color: '#3B4E8C' },
  SNACK:     { bg: '#FBE7DD', border: '#EFC3AC', color: '#B14A17' },
};

const MEAL_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин', SNACK: 'Перекус',
};

interface Trip {
  id: string; name: string; startDate: string; endDate: string;
  defaultPeople: number; notes?: string;
  days?: Array<{ id: string; dayDate: string; peopleOverride?: number; meals?: unknown[] }>;
}

const fmtDate = (iso: string, opts?: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', opts ?? { day: 'numeric', month: 'long' });

export default function TripPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [menu, setMenu] = useState<ReturnType<typeof calculateMenuByDays>>([]);
  const [shopping, setShopping] = useState<Array<{
    ingredientId: string; ingredientName: string; unit: string;
    totalAmount: number; plannedCost?: number; actualCost?: number; excluded: boolean; manual?: boolean;
    /** Fix-6 (п.5): чек по позиции ВВЕДЁН — план в отчёте больше не нужен */
    hasFact?: boolean;
  }>>([]);
  const [checklist, setChecklist] = useState<ReturnType<typeof buildChecklist>>([]);
  const [days, setDays] = useState<Array<{
    dayDate: string; people: number; planned: number; actual: number;
  }>>([]);
  const [kpi, setKpi] = useState({
    totalPlanned: 0, totalActual: 0, perPerson: 0, perPersonMeal: 0,
    personMeals: 0, realPeople: 1,
  });
  const [boughtCount, setBoughtCount] = useState(0);
  const [boughtKeys, setBoughtKeys] = useState<Set<string>>(new Set());
  const [actualQty, setActualQty] = useState<Record<string, ChecklistActual>>({});
  const [manualByDay, setManualByDay] = useState<Record<string, TripManualItem[]>>({});
  const [tripManual, setTripManual] = useState<TripManualItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tripKey = String(id);
        const [tripData, recipesData, tripRecipesData, pricesData, editsData, manualData, productsData] = await Promise.all([
          api.get<Trip>(`/trips/${id}`),
          getRecipes(),
          getTripRecipes(tripKey).catch(() => []),
          api.get<IngredientPrice[]>(`/trips/${id}/prices`),
          getTripEdits(tripKey).catch(() => [] as TripIngredientEdit[]),
          getManualItems(tripKey).catch(() => [] as TripManualItem[]),
          api.get<unknown>('/admin/products', { params: { size: '1000' } }).catch(() => null),
        ]);
        if (cancelled) return;
        const recipesMap = new Map([...recipesData, ...tripRecipesData].map((r) => [String(r.id), r]));
        const excluded = loadExcluded(tripKey);
        const overrides = loadActualPrices(tripKey);
        const bought = loadBought(tripKey);
        const actualQtyData = loadActualQty(tripKey);

        // --- Меню с overlay серверных правок состава (Fix-2 п.3/U30) ---
        const snapshotOfMap = new Map<string, string>();
        for (const r of tripRecipesData) {
          const so = (r as { snapshotOf?: string | number | null }).snapshotOf;
          if (so != null) snapshotOfMap.set(String(r.id), String(so));
        }
        // Fix-6 (п.22/25): правки состава — в самом источнике расчётов (меню и закупка)
        const effectiveRecipesMap = buildEffectiveRecipesMap(recipesMap, editsData as never, snapshotOfMap);
        const menuDays = calculateMenuByDays(tripData as never, effectiveRecipesMap);

        // --- Закупка: блюда + ручные позиции, факт из стейджа ---
        const manualPriceOf = (ingId: string): number | undefined => {
          const rows = pricesData.filter(pr => String(pr.ingredientId) === String(ingId));
          return rows.length ? findPriceForDate(rows as never, tripData.endDate)?.pricePerUnit : undefined;
        };
        const base = mergeManualIntoShopping(
          calculateShoppingList(tripData as never, effectiveRecipesMap, pricesData, dayScopedExclusions(excluded)),
          manualData,
          manualPriceOf,
        );
        const shoppingRows = base.map(item => {
          const planned = item.estimatedCost ?? undefined;
          const plannedUnit = planned != null && item.totalAmount > 0 ? planned / item.totalAmount : undefined;
          // Fix-7 (п.17): устаревшие факты (потребность менялась) в отчёт не попадают
          const ovRaw = overrides[String(item.ingredientId)];
          const ov = factIsFresh(ovRaw, item.totalAmount) ? ovRaw : undefined;
          const actualUnit = ov?.price ?? plannedUnit;
          return {
            ingredientId: String(item.ingredientId),
            ingredientName: item.ingredientName,
            unit: item.unit,
            totalAmount: item.totalAmount,
            plannedCost: planned,
            actualCost: roundMoney(totalFromUnit(actualUnit, item.totalAmount)) ?? planned,
            excluded: excluded.has(String(item.ingredientId)),
            manual: (item as { manual?: boolean }).manual,
            hasFact: ov?.price != null,
          };
        });

        // --- Чеклист (категории/упаковки) из НЕисключённых позиций ---
        const productInfo = new Map<string, ChecklistProductInfo>();
        for (const r of [...recipesData, ...tripRecipesData]) {
          for (const ri of (r.ingredients ?? []) as unknown as Array<Record<string, unknown>>) {
            const ing = ((ri as { ingredient?: Record<string, unknown> }).ingredient ?? ri) as unknown as { id?: string | number; packSize?: number; roundToPacks?: boolean; category?: string };
            if (ing?.id != null && !productInfo.has(String(ing.id))) {
              productInfo.set(String(ing.id), { packSize: ing.packSize, roundToPacks: ing.roundToPacks, category: categoryName(ing) });
            }
          }
        }
        const prodList = Array.isArray(productsData) ? productsData : ((productsData as { content?: Array<Record<string, unknown>> } | null)?.content ?? []);
        for (const p of prodList as Array<Record<string, unknown>>) {
          productInfo.set(String(p.id), {
            packSize: p.packSize as number, roundToPacks: p.roundToPacks as boolean, category: categoryName(p),
          });
        }
        const checklistGroups = buildChecklist(
          shoppingRows.filter(r => !r.excluded).map(r => ({
            ingredientId: r.ingredientId, ingredientName: r.ingredientName, unit: r.unit, totalAmount: r.totalAmount,
          })),
          productInfo,
        );

        // --- По дням: план/факт и люди (для «кто сколько должен») ---
        const dayRows = calculateDayShopping(tripData as never, effectiveRecipesMap, pricesData)
          .map(d => {
            const merged = mergeManualIntoShopping(
              d.items,
              manualForDay(manualData, (tripData.days ?? []).find(x => x.dayDate === d.dayDate)?.id ?? ''),
            );
            let planned = 0, actual = 0;
            for (const it of merged) {
              if (isRowExcluded(excluded, d.dayDate, it.ingredientId)) continue;
              const p = it.estimatedCost ?? 0;
              const ovDay = overrides[String(it.ingredientId)];
              const unit = factIsFresh(ovDay, it.totalAmount) ? ovDay!.price : undefined;
              planned += p;
              actual += unit != null ? unit * it.totalAmount : p;
            }
            const tripDay = (tripData.days ?? []).find(x => x.dayDate === d.dayDate);
            const people = tripDay ? getEffectivePeople(tripData as never, tripDay as never) : tripData.defaultPeople;
            return { dayDate: d.dayDate, people, planned, actual };
          });

        const included = shoppingRows.filter(r => !r.excluded);
        const totalPlanned = included.reduce((a, r) => a + (r.plannedCost ?? 0), 0);
        const totalActual = included.reduce((a, r) => a + (r.actualCost ?? 0), 0);
        const realPeople = realTripPeople(tripData as never);
        const { tripSummary } = calculatePersonSummary(tripData as never, effectiveRecipesMap, pricesData, realPeople, excluded, manualData, manualPriceOf);

        // ручные позиции для меню-страниц
        const byDay: Record<string, TripManualItem[]> = {};
        for (const d of tripData.days ?? []) byDay[d.id] = manualForDay(manualData, d.id);

        setTrip(tripData);
        setMenu(menuDays);
        setShopping(shoppingRows);
        setChecklist(checklistGroups);
        setDays(dayRows);
        setKpi({
          totalPlanned, totalActual,
          perPerson: totalActual / Math.max(1, realPeople),
          perPersonMeal: totalActual / Math.max(1, tripSummary.totalPersonMeals || 1),
          personMeals: tripSummary.totalPersonMeals,
          realPeople,
        });
        setBoughtCount([...bought].length);
        setBoughtKeys(bought);
        setActualQty(actualQtyData);
        setManualByDay(byDay);
        setTripManual(manualForTrip(manualData));
      } catch (err) {
        console.error('Print view failed:', err);
        if (!cancelled) setError('Не удалось подготовить печатную версию');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Fix-5 (п.13): НЕ открываем диалог печати автоматически — только по кнопке.
  // «Не надо автоматом открывать мне печать, пока я не хочу печатать».

  if (loading) {
    return <div className="p-8 text-center" style={{ color: 'var(--text-2)' }}>Готовим документ…</div>;
  }
  if (error || !trip) {
    return <div className="p-8 text-center" style={{ color: 'var(--danger, #ef4444)' }}>{error || 'Поход не найден'}</div>;
  }

  const included = shopping.filter(r => !r.excluded);
  // Fix-6 (п.5): «если чек утверждён — план просто засоряет вывод».
  // allFact — все позиции с чеком: плановые колонки не показываем вовсе.
  const anyFact = included.some(r => r.hasFact);
  const allFact = included.length > 0 && included.every(r => r.hasFact);
  const realPeopleLabel = Number.isInteger(kpi.realPeople) ? String(kpi.realPeople) : kpi.realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  // Fix-7 (п.27): ОДИНАКОВЫЕ ширины колонок во всех категорийных таблицах
  // закупки (Фрукты/Супы/… не «пляшут» друг относительно друга)
  const printCols = (
    <colgroup>
      <col />
      <col style={{ width: '15%' }} />
      <col style={{ width: '15%' }} />
      {!allFact && <col style={{ width: '16%' }} />}
      {(anyFact || allFact) && <col style={{ width: '17%' }} />}
    </colgroup>
  );

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      {/* Панель управления — на печати скрыта */}
      <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid #d8dee3' }}>
        <button
          onClick={() => window.close()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"
          style={{ border: '1px solid #c7d0d6', borderRadius: 999, color: '#10202b', background: '#fff' }}
          aria-label="Закрыть"
        >
          <ArrowLeft size={16} /> Закрыть
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold"
          style={{ border: 'none', borderRadius: 999, color: '#fff8f0', background: 'linear-gradient(135deg,#FFC46B 0%,#F2842B 52%,#E85D1F 100%)' }}
          aria-label="Печать или сохранение в PDF"
        >
          <Printer size={16} /> Печать / Сохранить PDF
        </button>
        <span className="text-xs" style={{ color: '#5b6b76' }}>
          В диалоге печати выберите «Сохранить как PDF». Ориентация — книжная, поля — минимальные.
        </span>
      </div>

      <div className="print-doc mx-auto" style={{ maxWidth: 820, padding: '32px 28px', color: '#10202b', fontFamily: 'Manrope, system-ui, sans-serif' }}>
        {/* Шапка документа */}
        <header style={{ borderBottom: '3px solid #E85D1F', paddingBottom: 16, marginBottom: 8 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{trip.name}</h1>
          <p className="print-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {fmtDate(trip.startDate)} — {fmtDate(trip.endDate, { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}людей: {realPeopleLabel}
            {' · '}дней: {trip.days?.length ?? 0}
            {' · '}приёмов пищи (с людьми): {kpi.personMeals}
          </p>
          {trip.notes && <p className="print-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{trip.notes}</p>}
        </header>

        {/* ===== Раздел 1: МЕНЮ ПО ДНЯМ — страница на день ===== */}
        {menu.map((day, i) => {
          const tripDay = trip.days?.[i];
          const dayManual = tripDay ? (manualByDay[tripDay.id] ?? []) : [];
          const dayRow = days.find(d => d.dayDate === day.dayDate);
          return (
            <section key={day.dayDate} className="print-page" style={{ paddingTop: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 4px', color: '#0F7A6E' }}>
                {fmtDate(day.dayDate, { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <p className="print-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
                {day.effectivePeople} чел. · {day.meals.length} приёмов
                {dayRow ? ` · план ${formatRub(dayRow.planned)}${dayRow.actual !== dayRow.planned ? `, факт ${formatRub(dayRow.actual)}` : ''}` : ''}
              </p>
              {/* Fix-6 (п.3): меню СГРУППИРОВАНО по приёмам — «Завтрак», «Обед»,
                  «Ужин», «Перекус» с цветными заголовками (как бейджи в приложении);
                  внутри группы — приёмы в две колонки */}
              {(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const)
                .filter(mt => day.meals.some(m => m.mealType === mt))
                .map(mt => {
                  const style = MEAL_PRINT_STYLE[mt];
                  return (
                    <div key={mt} style={{ breakInside: 'avoid', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 6px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 999,
                          background: style.bg, border: `1px solid ${style.border}`, color: style.color,
                          textTransform: 'uppercase', letterSpacing: '.06em',
                        }}>
                          {MEAL_LABELS[mt]}
                        </span>
                        <span style={{ flex: 1, height: 1, background: '#dfe5e9' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
                        {day.meals.filter(m => m.mealType === mt).map((meal, mi) => (
                          <div key={mi} style={{ marginBottom: 10 }}>
                            <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700 }}>
                              {meal.recipeName}
                              <span className="print-muted" style={{ fontWeight: 400, fontSize: 12 }}> · {meal.servings} порц.</span>
                            </p>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#28384a' }}>
                              {meal.ingredients.map((ing, ii) => (
                                <li key={ii}>
                                  {ing.name} — {formatAmount(ing.amount, ing.unit)}
                                  {(ing as { added?: boolean }).added && <span style={{ color: '#0F7A6E', fontWeight: 700 }}> (+добавлено)</span>}
                                  {(ing as { substitutedFrom?: string }).substitutedFrom && (
                                    <span className="print-muted"> (замена: {(ing as { substitutedFrom?: string }).substitutedFrom})</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              {dayManual.length > 0 && (
                <div style={{ marginTop: 6, breakInside: 'avoid' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#435663' }}>Дополнительно на день:</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                    {dayManual.map(mi => (
                      <li key={mi.id}>{mi.ingredientName} — {formatAmount(mi.amount, mi.unit)}{mi.note ? ` (${mi.note})` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {day.meals.length === 0 && dayManual.length === 0 && (
                <p className="print-muted" style={{ fontSize: 12 }}>Нет приёмов пищи.</p>
              )}
            </section>
          );
        })}

        {/* Карточка «на весь поход» — ручные позиции без дня */}
        {tripManual.length > 0 && (
          <section className="print-page" style={{ paddingTop: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: '#0F7A6E' }}>На весь поход</h2>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
              {tripManual.map(mi => (
                <li key={mi.id}>{mi.ingredientName} — {formatAmount(mi.amount, mi.unit)}{mi.note ? ` (${mi.note})` : ''}</li>
              ))}
            </ul>
          </section>
        )}

        {/* ===== Раздел 2: ЗАКУПКА — продукты и деньги ===== */}
        <section className="print-page" style={{ paddingTop: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px', color: '#0F7A6E' }}>Закупка: продукты и деньги</h2>
          <p className="print-muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
            Упаковки округлены вверх (излишек остаётся на следующий поход). Отмечено «взято»: {boughtCount}.
          </p>
          {checklist.map(group => (
            <div key={group.category} style={{ breakInside: 'avoid', marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '.04em', color: '#435663' }}>
                {group.category}
              </h3>
              <table style={{ tableLayout: 'fixed' }}>
                {printCols}
                <thead>
                  <tr>
                    <th>Продукт</th>
                    <th style={{ textAlign: 'right' }}>Нужно</th>
                    {/* Fix-5 (п.12/21): сколько реально взяли — из чеклиста/чека */}
                    <th style={{ textAlign: 'right' }}>Взяли</th>
                    {/* Fix-6 (п.5/21): план — только пока чеки не закрыты; народный нейминг */}
                    {!allFact && <th style={{ textAlign: 'right' }}>Думали ₽</th>}
                    {(anyFact || allFact) && <th style={{ textAlign: 'right' }}>Заплатили ₽</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(row => {
                    const src = included.find(r => r.ingredientId === row.ingredientId);
                    // факт-количество: свободный ввод чеклиста («300 г») → расчёт (упаковки/нужно).
                    // Fix-7 (п.17): устаревший факт (потребность менялась) игнорируется.
                    // Fix-7 (п.26): «Взяли» — ВСЕГДА с единицей («0,05 кг», а не «0,05»);
                    // legacy-записи без единицы переводятся в единицы продукта.
                    const actRaw = actualQty[row.ingredientId];
                    const act = factIsFresh(actRaw, row.needed) ? actRaw : undefined;
                    const tookStr = act
                      ? (act.unit
                        ? `${act.amount.toLocaleString('ru-RU')} ${act.unit}`
                        : formatAmount(act.amount, row.unit))
                      : (row.packsToBuy != null && row.packSize
                        ? formatAmount(row.packsToBuy * row.packSize, row.unit)
                        : formatAmount(row.needed, row.unit));
                    const isBought = boughtKeys.has(`${row.ingredientId}@${Math.round(row.needed * 1000)}`);
                    return (
                      <tr key={row.ingredientId}>
                        <td>{isBought ? '✓ ' : ''}{row.name}</td>
                        <td style={{ textAlign: 'right' }}>{formatAmount(row.needed, row.unit)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{tookStr}</td>
                        {!allFact && (
                          <td style={{ textAlign: 'right' }}>
                            {src?.plannedCost != null ? formatRub(src.plannedCost) : '—'}
                          </td>
                        )}
                        {(anyFact || allFact) && (
                          <td style={{ textAlign: 'right', fontWeight: src?.hasFact ? 700 : 400 }}>
                            {src?.hasFact && src?.actualCost != null
                              ? formatRub(src.actualCost)
                              : <span className="print-muted">—</span>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {shopping.some(r => r.excluded) && (
            <p className="print-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Исключено из закупки: {shopping.filter(r => r.excluded).map(r => r.ingredientName).join(', ')}.
            </p>
          )}
        </section>

        {/* ===== Раздел 3: ДЕНЬГИ И ВЫВОДЫ ===== */}
        <section className="print-page" style={{ paddingTop: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px', color: '#0F7A6E' }}>Деньги: итоги и кто сколько должен</h2>
          <table style={{ marginBottom: 14 }}>
            <tbody>
              {/* Fix-6 (п.5): чеки закрыты полностью — план не выводим: «Заплатили» и всё */}
              {!allFact && (
                <tr>
                  <td>Думали (план на поход)</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatRub(kpi.totalPlanned)}</td>
                </tr>
              )}
              {anyFact && (
                <tr>
                  <td>Заплатили (по введённым чекам)</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatRub(kpi.totalActual)}</td>
                </tr>
              )}
              {anyFact && !allFact && (
                <tr>
                  <td>Расхождение</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: kpi.totalActual > kpi.totalPlanned ? '#C24E12' : '#0F7A6E' }}>
                    {kpi.totalPlanned > 0 ? `${kpi.totalActual > kpi.totalPlanned ? '+' : ''}${Math.round(kpi.totalActual - kpi.totalPlanned).toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                </tr>
              )}
              {!anyFact && !allFact && (
                <tr><td>Итого (план)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatRub(kpi.totalPlanned)}</td></tr>
              )}
              <tr><td>На одного человека ({realPeopleLabel} чел.)</td><td style={{ textAlign: 'right', fontWeight: 800 }}>{formatRub(kpi.perPerson)}</td></tr>
              <tr><td>На один приём пищи ({kpi.personMeals} приёмов с людьми)</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{formatRub(kpi.perPersonMeal)}</td></tr>
            </tbody>
          </table>

          <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 4px', color: '#435663' }}>По дням (если состав группы менялся)</h3>
          <table>
            <thead>
              <tr>
                <th>День</th>
                <th style={{ textAlign: 'right' }}>Людей</th>
                {!allFact && <th style={{ textAlign: 'right' }}>Думали ₽</th>}
                {anyFact && <th style={{ textAlign: 'right' }}>Заплатили ₽</th>}
                <th style={{ textAlign: 'right' }}>На человека в день</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => (
                <tr key={d.dayDate}>
                  <td>{fmtDate(d.dayDate, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td style={{ textAlign: 'right' }}>{d.people}</td>
                  {!allFact && <td style={{ textAlign: 'right' }}>{formatRub(d.planned)}</td>}
                  {anyFact && <td style={{ textAlign: 'right' }}>{formatRub(d.actual)}</td>}
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatRub((anyFact ? d.actual : d.planned) / Math.max(1, d.people))}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #d8dee3' }}>
                <td style={{ fontWeight: 800 }}>Итого</td>
                <td />
                {!allFact && <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatRub(kpi.totalPlanned)}</td>}
                {anyFact && <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatRub(kpi.totalActual)}</td>}
                <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatRub(kpi.perPerson)}</td>
              </tr>
            </tbody>
          </table>
          <p className="print-muted" style={{ fontSize: 11, marginTop: 10 }}>
            Справедливое деление при разном составе по дням: сложите «на человека в день» только за дни участия.
            Документ подготовлен приложением «Провиант» {new Date().toLocaleDateString('ru-RU')}.
          </p>
        </section>
      </div>
    </div>
  );
}
