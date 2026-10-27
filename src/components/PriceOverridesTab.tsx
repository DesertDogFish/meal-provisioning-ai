import { Button } from './Button';
import { useState, useEffect, useMemo, useRef } from 'react';
import { unitFromTotal, enteredCheckTotal } from '../utils/checkInput'; // Fix-3 (п.5) + Fix-10 (п.1): ввод чека СУММОЙ; «Заплатили» пусто до ввода
import { syncServerExclusions } from '../api/shoppingExclusions';      // Fix-3 / R2
import { formatAmount, calculateShoppingList, calculateDayShopping, realTripPeople, dayScopedExclusions, findPriceForDate } from '../utils/calculations';
import { formatRub, categoryName } from '../utils/format'; // Release-1.0: единый формат чисел/единиц
import { compareRu } from '../utils/rowSort'; // U41: алфавитная сортировка
import { mealsWord } from '../utils/text';
import { NumberField } from './NumberField';
import { useToast } from './ToastProvider';
import InfoTip from '../components/InfoTip';
import FreeAmountInput from '../components/FreeAmountInput';
import { api, getRecipes, getTripRecipes } from '../api/client';
import { getManualItems, type TripManualItem } from '../api/tripManualItems'; // Fix-5 (п.11): ручные позиции в чеке
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits';   // Fix-6 (п.22): правки состава в чеке
import { buildEffectiveRecipesMap } from '../utils/recipeEdits';
import { mergeManualIntoShopping } from '../utils/manualItems';
import {
  ActualPriceDraft,
  loadActualPrices,
  saveActualPrice,
  loadExcluded,
  setExcluded as persistExcluded,
  loadBought,
  loadActualQty,
  setActualQty,
  type ChecklistActual,
  onTripStageChange,
} from '../utils/tripStaging';
import { neededAsActual, type ActualAmount } from '../utils/checkUnits';

/**
 * Вкладка «Закупка и чеки».
 *
 * Fix-6 (список 26.10): убрана дублирующая модалка «Ввести чек» — суммы
 * вводятся инлайн в той же таблице, сгруппированной по категориям (как чеклист),
 * без внутреннего скролла. Народный нейминг колонок: «Думали ₽» (план) и
 * «Заплатили ₽» (факт из чека), «Отклонение» вместо Δ. «Взяли» — из ОБЩЕГО
 * хранилища с чеклистом (ввёл один раз — видно везде). Подтабы — сегменты (.seg).
 */

interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  plannedUnitPrice?: number;
  actualUnitPrice?: number | null;
  plannedCost?: number;
  actualCost?: number;
  overridden: boolean;
  hasPlannedPrice: boolean;
  manual?: boolean;
}

interface DayShopping {
  dayDate: string;
  plannedCost: number;
  actualCost: number;
}

interface Props {
  tripId: string;
}

type TabType = 'total' | 'days' | 'person';

interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  days?: TripDay[];
}

interface TripDay {
  id: string;
  tripId: string;
  dayDate: string;
  peopleOverride?: number;
  meals?: TripMeal[];
}

interface TripMeal {
  id: string;
  tripDayId: string;
  mealType: string;
  recipeId: string;
  recipe?: any;
  peopleOverride?: number;
  sortOrder: number;
}

interface Recipe {
  id: string;
  name: string;
  mealType: string;
  baseServings: number;
  caloriesPerServing?: number;
  ingredients: any[];
}

interface Price {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
}

export default function PriceOverridesTab({ tripId }: Props) {
  const { showError } = useToast();
  // Release-1.0 (UI-consistency): сырые данные — в state, таблицы «Закупка» и «По дням»
  // ВЫВОДЯТСЯ из общих утилит (useMemo ниже). Чеки и исключения мгновенно отражаются
  // во всех суммах без ручного пересчёта и без расхождений между вкладками.
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('total');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Фаза 13 (п.4/5/6) + Fix-3/5/6: ОДИН общий стейдж для всех вкладок страницы —
  // фактические цены, исключения, отметки «взято» и фактические количества чеклиста.
  const [draftOverrides, setDraftOverrides] = useState<Record<string, ActualPriceDraft>>({});
  const [shoppingExcluded, setShoppingExcluded] = useState<Set<string>>(new Set());
  const [boughtSet, setBoughtSet] = useState<Set<string>>(new Set());
  const [actualMap, setActualMap] = useState<Record<string, ChecklistActual>>({});
  // Fix-5 (п.11) / Fix-6 (п.22): ручные позиции и правки состава — часть чека
  const [manualItems, setManualItems] = useState<TripManualItem[]>([]);
  const [tripEdits, setTripEdits] = useState<TripIngredientEdit[]>([]);

  // Серверные оверрайды (GET /trips/:id/price-overrides) — как фолбэк, если
  // локальный стейдж пуст (например, чек ввели в другой сессии на сервере).
  const serverOverridesRef = useRef<Record<string, ActualPriceDraft>>({});

  const syncStage = () => {
    setDraftOverrides(loadActualPrices(tripId));
    setShoppingExcluded(loadExcluded(tripId));
    setBoughtSet(loadBought(tripId));
    setActualMap(loadActualQty(tripId));
  };

  useEffect(() => {
    syncStage();
    return onTripStageChange(tripId, syncStage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  /** Сохранение фактической цены за единицу (сумма чека → цена).
   * Fix-8 (п.6): факт БОЛЬШЕ НЕ сбрасывается при изменении потребности
   * (люди/состав) — цена за единицу не зависит от количества, а сумма
   * пересчитывается от текущего «нужно» во всех потребителях. neededAt
   * не пишем (поле оставлено в типе только для legacy-записей). */
  const commitActualPrice = async (item: ShoppingItem, v: number | null, totalOverride?: number | null) => {
    if (v == null || Number.isNaN(v)) {
      saveActualPrice(tripId, item.ingredientId, null);
    } else {
      saveActualPrice(tripId, item.ingredientId, {
        price: v,
        total: totalOverride != null ? totalOverride : v * item.totalAmount,
      });
    }
    // Синхронизируем серверное хранилище оверрайдов (best effort: mock/офлайн не ломают UI)
    try {
      await api.put(`/trips/${tripId}/price-overrides/${item.ingredientId}`, {
        actualPrice: v,
        comment: v == null ? undefined : 'чек',
      });
    } catch { /* нет роута/прав — локальный стейдж уже сохранён */ }
  };

  /** Fix-3 (п.5): пользователь вводит СУММУ из чека («Заплатили ₽»). */
  const commitActualTotal = (item: ShoppingItem, total: number | null) => {
    if (total == null || Number.isNaN(total)) {
      void commitActualPrice(item, null);
      return;
    }
    const unit = unitFromTotal(total, item.totalAmount);
    if (unit == null) return; // нулевое количество — вводить некуда
    void commitActualPrice(item, unit, total);
  };

  /** Fix-6 (п.11): «Взяли» — ОДНО хранилище с чеклистом (ввёл там — видно здесь).
   * Fix-8 (п.6): значение переживает изменение потребности — это факт покупки. */
  const commitTook = (ingredientId: string, value: ActualAmount | null, _needed?: number) => {
    setActualQty(tripId, ingredientId, value);
    setActualMap(loadActualQty(tripId));
  };

  /** Фактические цены: общий стейдж (инлайн-поле) поверх серверных оверрайдов. */
  const effectiveOverrides = (): Record<string, ActualPriceDraft> => ({
    ...(serverOverridesRef.current || {}),
    ...draftOverrides,
  });

  /** Фаза 13 (п.5) + Fix-3/R2: soft-disable позиции (глобальный ключ) + серверная синхронизация. */
  const toggleExcluded = (ingredientId: string) => {
    const next = new Set(shoppingExcluded);
    if (next.has(ingredientId)) next.delete(ingredientId);
    else next.add(ingredientId);
    persistExcluded(tripId, next);
    setShoppingExcluded(next);
    void syncServerExclusions(tripId, next);
  };

  // Загрузка данных через API
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Фаза 13 (п.6): серверные price-overrides — фолбэк-источник фактических цен
      const serverOvs = await api
        .get<Array<{ ingredientId: string; actualPrice: number }>>(`/trips/${tripId}/price-overrides`)
        .catch(() => [] as Array<{ ingredientId: string; actualPrice: number }>);
      serverOverridesRef.current = Object.fromEntries(
        (serverOvs || []).map(o => [String(o.ingredientId), { price: o.actualPrice, total: 0 } as ActualPriceDraft])
      );

      const [tripData, recipesData, pricesData, tripRecipesData, manualData, editsData] = await Promise.all([
        api.get<Trip>(`/trips/${tripId}`),
        getRecipes(),
        // V20: цены похода — trip-scoped копии (план заморожен на момент планирования)
        api.get<Price[]>(`/trips/${tripId}/prices`),
        // V20 + Release-1.0: копии блюд похода через getTripRecipes — с нормализацией
        getTripRecipes(tripId).catch(() => [] as Recipe[]),
        // Fix-5 (п.11): ручные позиции видны в чеке наравне с блюдами
        getManualItems(tripId).catch(() => [] as TripManualItem[]),
        // Fix-6 (п.22/25): правки состава (EXTRA/SUBST/EXCLUDE/SCALE)
        getTripEdits(tripId).catch(() => [] as TripIngredientEdit[]),
      ]);

      setTrip(tripData);
      // V20: расчёт по объединённому набору: справочник (пикер) + копии блюд похода
      setAllRecipes([...recipesData, ...tripRecipesData]);
      setPrices(pricesData);
      setManualItems(manualData);
      setTripEdits(editsData);
    } catch (err) {
      console.error('Failed to load ', err);
      setError('Не удалось загрузить данные');
      showError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  // ===== Release-1.0 (UI-consistency): производные таблицы из ОБЩИХ утилит =====
  const recipesMap = useMemo(
    () => new Map(allRecipes.map(r => [String(r.id), r])),
    [allRecipes]
  );

  // Fix-6 (п.22/25): рецепты с применёнными правками состава — единый источник
  const effectiveRecipesMap = useMemo(() => {
    const snapshotOfMap = new Map<string, string>();
    for (const r of allRecipes) {
      const so = (r as any).snapshotOf;
      if (so != null) snapshotOfMap.set(String(r.id), String(so));
    }
    return buildEffectiveRecipesMap(recipesMap, tripEdits as any, snapshotOfMap);
  }, [recipesMap, tripEdits, allRecipes]);

  // Fix-6 (п.8): информация о продуктах (вес штуки) для свободных единиц «Взяли»
  const pieceWeightById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of allRecipes) {
      for (const ri of ((r as any).ingredients || [])) {
        const ing = ri?.ingredient ?? ri;
        const id = String(ri?.ingredientId ?? ing?.id ?? '');
        if (id && !m.has(id)) m.set(id, ing?.pieceWeightG ?? null);
      }
    }
    return m;
  }, [allRecipes]);

  const shoppingItems = useMemo<ShoppingItem[]>(() => {
    if (!trip) return [];
    const stage = { ...(serverOverridesRef.current || {}), ...draftOverrides };
    const manualPriceOf = (ingId: string): number | undefined => {
      const rows = (prices as Price[]).filter(pr => String(pr.ingredientId) === String(ingId));
      return rows.length ? findPriceForDate(rows as any, trip.endDate)?.pricePerUnit : undefined;
    };
    return mergeManualIntoShopping(
      calculateShoppingList(trip as any, effectiveRecipesMap as any, prices as any, dayScopedExclusions(shoppingExcluded)),
      manualItems,
      manualPriceOf,
    ).map(it => {
      const plannedCost = it.estimatedCost;
      const plannedUnitPrice = plannedCost != null && it.totalAmount > 0
        ? plannedCost / it.totalAmount
        : undefined;
      // Fix-8 (п.6): факт чека живёт при любом «нужно» — цена за единицу
      // применяется к текущему количеству (сумма пересчитывается автоматически)
      const ov = stage[String(it.ingredientId)];
      const actualUnitPrice = ov?.price ?? plannedUnitPrice;
      return {
        ingredientId: String(it.ingredientId),
        ingredientName: it.ingredientName,
        unit: it.unit,
        totalAmount: it.totalAmount,
        plannedUnitPrice,
        actualUnitPrice,
        plannedCost,
        actualCost: actualUnitPrice != null ? actualUnitPrice * it.totalAmount : plannedCost,
        overridden: ov != null,
        hasPlannedPrice: it.hasPrice,
        manual: (it as { manual?: boolean }).manual,
      };
    })
    // U41: чек и закупка — по алфавиту
    .sort((a, b) => compareRu(a.ingredientName, b.ingredientName));
  }, [trip, effectiveRecipesMap, prices, draftOverrides, shoppingExcluded, manualItems]);

  const dayShopping = useMemo<DayShopping[]>(() => {
    if (!trip) return [];
    const stage = { ...(serverOverridesRef.current || {}), ...draftOverrides };
    return calculateDayShopping(trip as any, effectiveRecipesMap as any, prices as any, shoppingExcluded).map(d => {
      let actual = 0;
      for (const it of d.items) {
        const planned = it.estimatedCost ?? 0;
        // Fix-8 (п.6): факт-цена применяется к текущему количеству дня
        const ovDraft = stage[String(it.ingredientId)];
        const ov = ovDraft?.price;
        actual += ov != null ? ov * it.totalAmount : planned;
      }
      return { dayDate: d.dayDate, plannedCost: d.dayCost, actualCost: actual };
    });
  }, [trip, effectiveRecipesMap, prices, shoppingExcluded, draftOverrides]);

  const calculateDelta = (planned?: number | null, actual?: number | null): number => {
    if (!planned || !actual || planned === 0) return 0;
    return ((actual - planned) / planned) * 100;
  };

  const formatDelta = (delta: number): string => {
    if (delta === 0) return '0%';
    return `${delta > 0 ? '+' : ''}${delta.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  };

  const getDeltaChipClass = (delta: number): string => {
    if (Math.abs(delta) < 0.001) return 'dim';
    return delta > 0 ? 'fire' : 'ok';
  };

  const totalPlanned = shoppingItems
    .filter(item => !shoppingExcluded.has(item.ingredientId))
    .reduce((sum, item) => sum + (item.plannedCost || 0), 0);
  const actualUnitOf = (item: ShoppingItem): number | undefined =>
    effectiveOverrides()[item.ingredientId]?.price ?? item.actualUnitPrice;
  const totalActual = shoppingItems
    .filter(item => !shoppingExcluded.has(item.ingredientId))
    .reduce((sum, item) => {
      const u = actualUnitOf(item);
      return sum + (u != null ? item.totalAmount * u : (item.actualCost || 0));
    }, 0);
  const totalDelta = calculateDelta(totalPlanned, totalActual);

  // ===== U41 + Fix-6: группы по категориям (как в чеклисте) =====
  const [productCats, setProductCats] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    api.get<any>('/admin/products', { params: { size: '1000' } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        const map: Record<string, string> = {};
        for (const p2 of list) map[String(p2.id)] = categoryName(p2) || 'Прочее';
        setProductCats(map);
      })
      .catch(() => { /* не-админ в real-режиме — останутся категории из рецептов */ });
    return () => { cancelled = true; };
  }, []);

  const categoryOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of allRecipes) {
      for (const ri of ((r as any).ingredients || [])) {
        const ing = ri?.ingredient ?? ri;
        const iid = String(ri?.ingredientId ?? ing?.id ?? '');
        const cat = categoryName(ing) || (typeof ri?.category === 'string' ? ri.category : '');
        if (iid && cat) m[iid] = cat;
      }
    }
    return { ...m, ...productCats };
  }, [allRecipes, productCats]);

  const checkGroups = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    for (const it of shoppingItems) {
      const cat = categoryOf[String(it.ingredientId)] || 'Прочее';
      const list = groups.get(cat) ?? [];
      list.push(it);
      groups.set(cat, list);
    }
    const cats = [...groups.keys()].sort((a, b) => {
      if (a === 'Прочее') return 1;
      if (b === 'Прочее') return -1;
      return compareRu(a, b);
    });
    return cats.map(c => ({ category: c, items: groups.get(c)! }));
  }, [shoppingItems, categoryOf]);

  // Fix-3 (п.2): чек вводим только после подтверждения закупки в чеклисте
  const canEnterCheck = boughtSet.size > 0;

  // Fix-5 (п.2): «на человека» — по реальному количеству людей
  const realPeople = trip ? Math.max(1, realTripPeople(trip as any)) : 1;
  const realPeopleLabel = Number.isInteger(realPeople) ? String(realPeople) : realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const totalPersonMeals = trip?.days?.reduce((acc: number, d: TripDay) =>
    acc + (d.meals?.reduce((mealAcc: number, m: TripMeal) => mealAcc + (m.peopleOverride || d.peopleOverride || trip.defaultPeople || 1), 0) || 0)
  , 0) || 1;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="note-box">Загрузка...</div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="space-y-4">
        <div className="note-box" style={{ color: 'var(--fire)' }}>
          {error || 'Поход не найден'}
        </div>
        <Button variant="ghost">Повторить</Button>
      </div>
    );
  }

  const segBtn = (id: TabType, label: string) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`seg-btn whitespace-nowrap ${activeTab === id ? 'active' : ''}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Fix-6 (п.17): информационная простыня убрана — подсказки живут в InfoTip
          у колонок. Остаётся только одна строка, когда ввод действительно закрыт. */}
      {!canEnterCheck && (
        <div className="note-box" style={{ color: 'var(--fire, #d97706)' }}>
          Суммы из чека можно вводить, когда во вкладке «Чеклист» отмечено хотя бы одно «взято».
        </div>
      )}

      {/* Fix-6 (п.26) + Fix-7 (п.20): подтабы — компактная группа по контенту,
          не растягивается во всю ширину */}
      <div className="seg max-w-full overflow-x-auto">
        {segBtn('total', 'Закупка')}
        {segBtn('days', 'По дням')}
        {segBtn('person', 'На человека')}
      </div>

      {/* Вкладка: Закупка (группы по категориям, как в чеклисте; без внутреннего скролла) */}
      {activeTab === 'total' && (
        <div className="rounded-xl overflow-hidden max-w-5xl mob-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Fix-7 (п.18): table-layout fixed + colgroup — заголовки колонок стоят
              ровно над полями ввода (единые ширины строк и шапки) */}
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 32 }} />
              <col />
              <col style={{ width: 84 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 78 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="px-2 py-3" title="Снять галочку, чтобы исключить продукт из расчёта (не удаляя его)"></th>
                <th className="text-left px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Продукт</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  Нужно
                  <InfoTip text="Сколько нужно по расчёту меню (с учётом правок состава, исключений и продуктов, добавленных к дню/походу)." />
                </th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  Взяли
                  <InfoTip text="Сколько реально куплено — в любых единицах (г, кг, шт, уп). Одно хранилище с чеклистом: ввели там — видно здесь, и наоборот. Попадает в отчёт." />
                </th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  Думали ₽
                  <InfoTip text="Плановая стоимость позиции: нужное количество × цена справочника на дату." />
                </th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  Заплатили ₽
                  <InfoTip text="Сумма из чека за позицию — сколько реально заплатили за купленное количество. Цена за единицу и распределение на всех посчитаются автоматически." />
                </th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  Отклонение
                  <InfoTip text="(Заплатили − Думали) ÷ Думали × 100%." />
                </th>
              </tr>
            </thead>
            <tbody>
              {checkGroups.map(group => (
                <GroupRows
                  key={group.category}
                  category={group.category}
                  items={group.items}
                  shoppingExcluded={shoppingExcluded}
                  actualMap={actualMap}
                  pieceWeightById={pieceWeightById}
                  canEnterCheck={canEnterCheck}
                  draftOverrides={draftOverrides}
                  calculateDelta={calculateDelta}
                  formatDelta={formatDelta}
                  getDeltaChipClass={getDeltaChipClass}
                  toggleExcluded={toggleExcluded}
                  commitActualTotal={commitActualTotal}
                  commitTook={commitTook}
                />
              ))}
            </tbody>
          </table>

          {/* Sticky итог — народный нейминг (Fix-6 п.21) */}
          <div className="sticky-totals">
            <span style={{ color: 'var(--text)' }}>
              Думали: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRub(totalPlanned)}</b>
            </span>
            <span style={{ color: 'var(--text)' }}>
              Заплатили: <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--w1)' }}>{formatRub(totalActual)}</b>
            </span>
            <span className={`chip-delta ${getDeltaChipClass(totalDelta)}`}>
              {formatDelta(totalDelta)}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
              разница: {formatRub(totalActual - totalPlanned)}
            </span>
            {shoppingExcluded.size > 0 && (
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>без {shoppingExcluded.size} искл.</span>
            )}
          </div>
        </div>
      )}

      {/* Вкладка: По дням */}
      {activeTab === 'days' && (
        <div className="rounded-xl overflow-hidden max-w-3xl mob-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>День</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Думали ₽</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Заплатили ₽</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Отклонение</th>
              </tr>
            </thead>
            <tbody>
              {dayShopping.map(day => {
                const delta = calculateDelta(day.plannedCost, day.actualCost);
                return (
                  <tr key={day.dayDate} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <b style={{ color: 'var(--text)' }}>
                        {new Date(day.dayDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                      </b>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatRub(day.plannedCost)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatRub(day.actualCost)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`chip-delta ${getDeltaChipClass(delta)}`}>
                        {formatDelta(delta)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Вкладка: На человека */}
      {activeTab === 'person' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <b style={{ color: 'var(--text)' }}>На одного человека</b>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
              {realPeopleLabel} чел. в походе
              <InfoTip text="Среднее число участников по дням (переопределения «людей на день» учитываются)." />
            </p>
            <div className="flex justify-between py-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Думали</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalPlanned / realPeople)}
              </b>
            </div>
            <div className="flex justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Заплатили</span>
              <b style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalActual / realPeople)}
              </b>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <b style={{ color: 'var(--text)' }}>На один приём пищи</b>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
              {totalPersonMeals} {mealsWord(totalPersonMeals)} за поход
              <InfoTip text="Сумма по всем дням: приёмы пищи × число людей." />
            </p>
            <div className="flex justify-between py-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Думали</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalPlanned / totalPersonMeals)}
              </b>
            </div>
            <div className="flex justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Заплатили</span>
              <b style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalActual / totalPersonMeals)}
              </b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Строки одной категории в таблице закупки                            */
/* ------------------------------------------------------------------ */

interface GroupRowsProps {
  category: string;
  items: ShoppingItem[];
  shoppingExcluded: Set<string>;
  actualMap: Record<string, ChecklistActual>;
  pieceWeightById: Map<string, number | null>;
  canEnterCheck: boolean;
  draftOverrides: Record<string, ActualPriceDraft>;
  calculateDelta: (planned?: number | null, actual?: number | null) => number;
  formatDelta: (delta: number) => string;
  getDeltaChipClass: (delta: number) => string;
  toggleExcluded: (ingredientId: string) => void;
  commitActualTotal: (item: ShoppingItem, total: number | null) => void;
  commitTook: (ingredientId: string, value: ActualAmount | null, needed?: number) => void;
}

function GroupRows(props: GroupRowsProps) {
  const {
    category, items, shoppingExcluded, actualMap, pieceWeightById, canEnterCheck,
    draftOverrides, calculateDelta, formatDelta, getDeltaChipClass,
    toggleExcluded, commitActualTotal, commitTook,
  } = props;
  return (
    <>
      {/* Fix-6 (п.25/23): категория — заметная плашкой-строкой, формат как в чеклисте */}
      <tr>
        <td colSpan={7} className="px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide"
            style={{ background: 'var(--elev)', color: 'var(--text)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          {category}
        </td>
      </tr>
      {items.map(item => {
        // Fix-8 (п.6): введённый факт цены НЕ сбрасывается при изменении
        // потребности (люди/состав) — он продолжает действовать для нового количества
        const rowDraft = draftOverrides[String(item.ingredientId)];
        const enteredUnit = rowDraft?.price ?? null;
        const excluded = shoppingExcluded.has(item.ingredientId);
        // Fix-7 (п.22): «Взяли» предзаполняется ожидаемым количеством (как в чеклисте);
        // Fix-8 (п.6): сохранённый ввод переживает смену потребности
        const storedTook = actualMap[String(item.ingredientId)] ?? null;
        const tookValue = storedTook ?? neededAsActual(item.totalAmount, item.unit);
        // Fix-10 (п.1): «Заплатили» по умолчанию ПУСТО — в поле только введённый
        // чек (план подсказывает плейсхолдер «думали X»); итоги/Δ — с плановым фолбэком
        const actualTotal = enteredCheckTotal(enteredUnit, item.totalAmount);
        const actualCostView = actualTotal ?? item.actualCost;
        const delta = calculateDelta(item.plannedCost, actualCostView);
        const deltaChipClass = getDeltaChipClass(delta);
        return (
          <tr key={item.ingredientId} style={{ borderBottom: '1px solid var(--border)', opacity: excluded ? 0.45 : 1 }}>
            <td className="px-2 py-2.5 text-center">
              <input
                type="checkbox"
                checked={!excluded}
                onChange={() => toggleExcluded(item.ingredientId)}
                aria-label={excluded ? `Включить в расчёт: ${item.ingredientName}` : `Исключить из расчёта: ${item.ingredientName}`}
                title={excluded ? 'Включить в расчёт' : 'Исключить из расчёта (не удаляя)'}
                className="cursor-pointer"
                style={{ accentColor: 'var(--w2)' }}
              />
            </td>
            <td className="px-2 py-2.5">
              <b style={{ color: 'var(--text)' }}>{item.ingredientName}</b>
              {item.manual && (
                <span className="chip-delta dim" style={{ marginLeft: 6, fontSize: 10 }}>к походу</span>
              )}
              {excluded && (
                <span className="chip-delta dim" style={{ marginLeft: 6, fontSize: 10 }}>искл.</span>
              )}
            </td>
            <td className="px-2 py-2.5 text-right" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {formatAmount(item.totalAmount, item.unit)}
            </td>
            <td className="px-2 py-2.5 text-right">
              <FreeAmountInput
                value={tookValue}
                baseUnit={item.unit}
                pieceWeightG={pieceWeightById.get(String(item.ingredientId)) ?? null}
                onChange={v => commitTook(String(item.ingredientId), v, item.totalAmount)}
                ariaLabel={`Сколько реально куплено: ${item.ingredientName}`}
                testId={`qty-input-${item.ingredientId}`}
              />
            </td>
            <td className="px-2 py-2.5 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {excluded ? '—' : formatRub(item.plannedCost)}
            </td>
            <td className="px-2 py-2.5 text-right">
              {/* Fix-10 (п.3): sm — одной высоты с «Взяли» (FreeAmountInput) в этой строке */}
              <NumberField
                value={actualTotal}
                size="sm"
                stepRef={item.plannedCost}
                placeholder={`думали ${formatRub(item.plannedCost)}`}
                disabled={!canEnterCheck}
                onCommit={v => commitActualTotal(item, v)}
                testId={`actual-input-${item.ingredientId}`}
                ariaLabel={`Сумма из чека (₽): ${item.ingredientName}, куплено ${formatAmount(item.totalAmount, item.unit)}`}
              />
            </td>
            <td className="px-2 py-2.5 text-right">
              <span className={`chip-delta ${deltaChipClass}`}>
                {formatDelta(delta)}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

