import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { calculateMenuByDays, calculateShoppingList, calculateDayShopping, calculatePersonSummary, formatAmount, realTripPeople, isRowExcluded, dayScopedExclusions, findPriceForDate } from '../utils/calculations';
import InfoTip from '../components/InfoTip';     // Fix-5 (п.3–5): формулы в тултипах
import TabHeader from '../components/TabHeader'; // Fix-5 (п.2): единые шапки вкладок
import FreeAmountInput from '../components/FreeAmountInput'; // Fix-6 (п.8): свободные единицы факта
import { isActualLessThanNeeded, neededAsActual, type ActualAmount } from '../utils/checkUnits';
import { formatRub } from '../utils/formatRub'; // Фаза 13: итоги — целые рубли
import { ArrowLeft, Plus, Trash2, Users, ShoppingCart, BookOpen, TrendingUp, Calendar, ChevronDown, ChevronRight, ListChecks, ClipboardCheck, PackagePlus, ArrowUpDown, X, FileDown } from 'lucide-react';
import { MealType } from '../types';
import PriceOverridesTab from '../components/PriceOverridesTab';
import AddMealModal, { type AddMealDayContext } from '../components/AddMealModal';
import MealCompositionModal from '../components/MealCompositionModal';
import ManualItemsModal from '../components/ManualItemsModal';
import { servingsWord } from '../utils/text';
import { api, getRecipes, getTripRecipes } from '../api/client';
import { useToast } from '../components/ToastProvider';
import { Button } from '../components/Button';
// Патч «UX-список 26.10»:
import { loadActualPrices, loadExcluded, setExcluded as persistExcluded, loadBought, setBought as persistBought, loadActualQty, setActualQty, onTripStageChange, type ChecklistActual, type ActualPriceDraft } from '../utils/tripStaging'; // U32 + Fix-2(п.6) + Fix-5(п.21) + Fix-8(п.6)
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits'; // U30
import { getManualItems, deleteManualItem, type TripManualItem } from '../api/tripManualItems'; // U40
import { mergeManualIntoShopping, manualForDay, manualForTrip } from '../utils/manualItems'; // U40
import { buildEffectiveRecipesMap } from '../utils/recipeEdits'; // Fix-6 (п.22/25): правки состава в расчётах
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7)
import { buildChecklist, type ChecklistProductInfo } from '../utils/checklist'; // U38
import { sortRows, nextDir, compareRu, type SortDir } from '../utils/rowSort'; // U26–U28
import { tripReadiness } from '../utils/readiness'; // Fix-3 (п.2): сквозной статус
import { getServerExclusions, syncServerExclusions } from '../api/shoppingExclusions'; // Fix-3 / R2
import { categoryName } from '../utils/format';

import PageLoader from '../components/PageLoader';
/** Фаза 13: черновик фактической цены (₽ за единицу измерения продукта).
 * Fix-7 (п.17): тип живёт в общем хранилище tripStaging (там же neededAt —
 * штамп потребности для сброса устаревших фактов). */
export type { ActualPriceDraft } from '../utils/tripStaging';

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
  mealType: MealType;
  recipeId: string;
  recipe?: any;
  peopleOverride?: number;
  sortOrder: number;
}

interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
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

const mealTypeLabels: Record<MealType, string> = {
  BREAKFAST: 'Завтрак',
  LUNCH: 'Обед',
  DINNER: 'Ужин',
  SNACK: 'Перекус',
};

// Бейджи приёмов пищи в палитре «Провиант» (wave/teal + amber)
// Fix-4 (п.7): четыре РАЗЛИЧИМЫХ цвета приёмов (раньше обед/ужин/перекус сливались
// в один «зелёный»): завтрак — янтарь, обед — волна/тил, ужин — сумеречный синий,
// перекус — коралл. Классы .badge-meal-* в index.css (токены дизайн-пака).
const mealTypeColors: Record<MealType, string> = {
  BREAKFAST: 'badge-meal-breakfast',
  LUNCH: 'badge-meal-lunch',
  DINNER: 'badge-meal-dinner',
  SNACK: 'badge-meal-snack',
};

type TabType = 'menu' | 'shopping' | 'dayShopping' | 'person' | 'overrides' | 'checklist';

/** U26: поле сортировки таблицы «Закупка на поход». */
type ShoppingSortField = 'ingredientName' | 'totalAmount' | 'effectiveCost';

export default function TripDetailPage() {
  const { showError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm(); // Fix-6 (п.7)
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('menu');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [dayPeopleOverride, setDayPeopleOverride] = useState('');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  // V20: копии блюд похода (snowshot) — нужны для рендера меню и расчётов
  const [tripRecipes, setTripRecipes] = useState<Recipe[]>([]);
  // V20: меню ищет блюдо и по глобальному id (пикер), и по id копии (приёмы пищи)
  const recipesMap = useMemo(
    () => new Map([...recipes, ...tripRecipes].map((r: Recipe) => [r.id, r])),
    [recipes, tripRecipes]
  );

  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ===== FORM-meal-composition-spec §2: Модалка A (добавление приёма) + Модалка B (состав) =====
  const [isEditorAdmin, setIsEditorAdmin] = useState<boolean | null>(null);
  /** A: { dayId, dayIndex, mealType } — контекст карточки дня (§2.1) */
  const [addMealCtx, setAddMealCtx] = useState<(AddMealDayContext & { mealType?: MealType }) | null>(null);
  /** B: существующий приём (id + день) — состав редактируется только для него (§2.2) */
  const [compositionMeal, setCompositionMeal] = useState<{ dayId: string; mealId: string } | null>(null);

  // ===== Фаза 13 (п.6/7): общий стейдж фактических цен и исключений =====
  // Поднят на уровень страницы: вкладки «Закупка», «По дням», «На человека» и
  // «Закупка и чеки» читают ОДИН источник — цифры синхронны между вкладками,
  // а черновики не теряются при размонтировании вкладок.
  // Сохранение между сессиями — per-trip localStorage (по требованию задачи).
  // U32 (список 26.10): ЕДИНЫЙ стейдж tripStaging + подписка на его события.
  // Раньше страница читала localStorage один раз при монтировании и не слышала
  // изменения из вкладки «Закупка и чеки» — ввод чека не перерисовывал
  // «Закупка/По дням/На человека». Теперь saveActualPrice/setExcluded рассылают
  // событие, sync() ниже обновляет оба набора — зависимые экраны перерисовываются.
  const tripKey = String(id ?? '');
  const [draftOverrides, setDraftOverrides] = useState<Record<string, ActualPriceDraft>>({});
  const [shoppingExcluded, setShoppingExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sync = () => {
      setDraftOverrides(loadActualPrices(tripKey));
      setShoppingExcluded(loadExcluded(tripKey));
      setChecklistBought(loadBought(tripKey));
      setActualQtyState(loadActualQty(tripKey));
    };
    sync();
    return onTripStageChange(tripKey, sync);
  }, [tripKey]);

  // Fix-3 / PLAN R2: серверные исключения — источник истины для глобальных ключей.
  // При загрузке мержим серверный набор в локальный стейдж (union), переключения
  // синхронизируем идемпотентным PUT. По-дневные ключи ('дата::id') остаются
  // клиентскими до расширения серверного контракта (PLAN, R2 шаг 2).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const server = await getServerExclusions(String(id));
      if (cancelled || server.length === 0) return;
      const merged = new Set(loadExcluded(String(id)));
      let changed = false;
      for (const k of server) if (!merged.has(k)) { merged.add(k); changed = true; }
      if (changed) persistExcluded(String(id), merged);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ===== Патч «UX-список 26.10»: серверные правки состава (U30), ручные позиции (U40),
  // справочник продуктов для фасовки/категорий (U38/U40), сортировка закупки (U26),
  // чекбокс-чеклист «куплено» в рамках сессии (U38). =====
  const [tripEdits, setTripEdits] = useState<TripIngredientEdit[]>([]);
  const [manualItems, setManualItems] = useState<TripManualItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [sortSpec, setSortSpec] = useState<{ field: ShoppingSortField; dir: SortDir }>({ field: 'ingredientName', dir: 'asc' });
  // Fix-2 (п.6): отметки «взято» чеклиста ПЕРСИСТЕНТНЫ (общий стейдж похода) —
  // чеклист переживает перезагрузку и используется как рабочий лист в магазине.
  const [checklistBought, setChecklistBought] = useState<Set<string>>(new Set());
  // Fix-6 (п.8): сколько РЕАЛЬНО берём — {amount, unit} свободно (г/кг/мл/л/шт/уп),
  // общий стейдж с чеком («Взяли» в чеке берётся ОТСЮДА, повторного ввода нет)
  const [actualQty, setActualQtyState] = useState<Record<string, ChecklistActual>>({});
  const [manualCtx, setManualCtx] = useState<{ dayId: string | null; dayLabel?: string } | null>(null);

  useEffect(() => {
    if (id) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tripData, recipesData, pricesData, tripRecipesData, editsData, manualData, productsData] = await Promise.all([
        api.get<Trip>(`/trips/${id}`),
        getRecipes(),
        // V20: цены КОНКРЕТНОГО похода (trip-scoped копии продуктов, замороженный план);
        // глобальный справочник цен — GET /prices (экраны админа/каталога)
        api.get<Price[]>(`/trips/${id}/prices`),
        // V20: trip-scoped копии блюд (меню похода ссылается на них).
        // Release-1.0: через getTripRecipes — нормализация плоских DTO снапшотов
        // (иначе в меню/закупке «Unknown» и единица «шт» по умолчанию).
        getTripRecipes(String(id)).catch(() => [] as Recipe[]),
        // U30: серверные правки состава — overlay на карточки меню
        getTripEdits(String(id)).catch(() => [] as TripIngredientEdit[]),
        // U40: ручные позиции закупки (продукты к дню/походу)
        getManualItems(String(id)).catch(() => [] as TripManualItem[]),
        // U38/U40: фасовка и категории продуктов для чеклиста/модалки (best effort:
        // в real-режиме не-админ может не иметь доступа — тогда чеклист без упаковок)
        api.get<any>('/admin/products', { params: { size: '1000' } }).catch(() => null),
      ]);
      setTrip(tripData);
      setRecipes(recipesData);
      setTripRecipes(tripRecipesData);
      setPrices(pricesData);
      setTripEdits(editsData);
      setManualItems(manualData);
      const prodList = Array.isArray(productsData) ? productsData : (productsData?.content ?? []);
      setProducts(prodList.map((p: any) => ({ ...p, category: categoryName(p) })));
    } catch (err: any) {
      console.error('Failed to load trip:', err);
      // ЗАДАЧА 3: тост; устаревшие данные не сбрасываем намеренно —
      // показываем ошибку поверх, страница похода остаётся читаемой.
      setError('Не удалось загрузить данные');
      showError(err?.detail || 'Не удалось загрузить данные похода');
    } finally {
      setLoading(false);
    }
  };

  // Роль пользователя — подгружается один раз: нужна для ссылки админа в
  // справочник из Модалки B (T7). Сам справочник продуктов модалка грузит сама.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = localStorage.getItem('accessToken')
          ? await api.get<{ role?: string }>('/auth/me').catch(() => null)
          : null;
        if (cancelled) return;
        setIsEditorAdmin(String(me?.role ?? '').toUpperCase() === 'ADMIN');
      } catch { /* не критично: ссылка админа просто не появится */ }
    })();
    return () => { cancelled = true; }
  }, []);

  if (loading) {
    return (
      <PageLoader />
    );
  }

  if (error || !trip) {
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--fire)' }}>{error || 'Поход не найден'}</p>
        <Button variant="ghost" onClick={() => navigate('/trips')} className="mt-4">← Назад к походам</Button>
      </div>
    );
  }


  const toggleDay = (dayId: string) => {
    const next = new Set(expandedDays);
    if (next.has(dayId)) next.delete(dayId);
    else next.add(dayId);
    setExpandedDays(next);
  };

  // ===== FORM-meal-composition-spec §2: обработчики Модалок A/B =====

  /** A закрыта; если шорткат «добавить и настроить состав» — открываем B для созданного приёма. */
  const handleMealAdded = (meal: { id: string }, opts: { openComposition: boolean }) => {
    if (!addMealCtx) return;
    const dayId = addMealCtx.dayId;
    setAddMealCtx(null);
    void (async () => {
      await loadData();
      if (opts.openComposition) setCompositionMeal({ dayId, mealId: meal.id });
    })();
  };

  const handleDeleteMeal = async (dayId: string, mealId: string, mealName: string, dayDate: string) => {
    // Fix-6 (п.7): приём пищи — ядро плана; удаление пересчитывает всё
    const ok = await confirm({
      title: `Удалить «${mealName}»?`,
      confirmLabel: 'Удалить приём',
      message: (
        <>
          {new Date(dayDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}:
          приём пищи уйдёт из меню, его продукты — из закупки и чеклиста, суммы пересчитаются.
        </>
      ),
    });
    if (!ok) return;
    try {
      await api.del(`/trips/${trip.id}/days/${dayId}/meals/${mealId}`);
      await loadData();
    } catch (err: any) {
      console.error('Failed to delete meal:', err);
      showError(err?.detail || 'Не удалось удалить приём пищи');
    }
  };

  const handleUpdateDayPeople = async (dayId: string) => {
    const val = dayPeopleOverride ? parseInt(dayPeopleOverride) : null;
    try {
      await api.put(`/trips/${trip.id}/days/${dayId}`, {
        peopleOverride: val ?? undefined
      });
      setEditingDay(null);
      setDayPeopleOverride('');
      await loadData();
    } catch (err: any) {
      console.error('Failed to update day:', err);
      // ЗАДАЧА 3: действие пользователя должно давать видимый отклик
      showError(err?.detail || 'Не удалось обновить количество людей на день');
    }
  };

  // Calculations
  // Фаза 13 (п.6): фактические цены и исключения применяются поверх базового
  // расчёта — все вкладки и KPI-карточки считают из одного источника.
  // U30 + Fix-6 (п.22/25): ЕДИНЫЙ источник — серверные правки состава применяются
  // к рецептам ДО всех расчётов (меню, закупка, дни, «на человека», чек). Раньше
  // меню рисовало overlay, а закупка считала по сырому снепшоту — добавленные
  // продукты («Имбирь») не попадали в чек, а статус «введено X из Y» расходился.
  const snapshotOfMap = new Map<string, string>();
  for (const r of tripRecipes) {
    const so = (r as any).snapshotOf;
    if (so != null) snapshotOfMap.set(String(r.id), String(so));
  }
  const effectiveRecipesMap = buildEffectiveRecipesMap(recipesMap, tripEdits as any, snapshotOfMap);
  const menuByDays = calculateMenuByDays(trip as any, effectiveRecipesMap);
  // Fix-5 (п.11): плановая цена ручной позиции — из trip-срезов цен (снепшот
  // продукта имеет замороженную цену; если цены нет — строка честно «без цены»).
  const manualPriceOf = (ingId: string): number | undefined => {
    const rows = prices.filter(pr => String(pr.ingredientId) === String(ingId));
    return rows.length ? findPriceForDate(rows, trip.endDate)?.pricePerUnit : undefined;
  };
  // U40: ручные позиции (к дню и к походу) вливаются в закупку на весь поход.
  // Fix-2 (п.5): по-дневные исключения УМЕНЬШАЮТ количество в агрегате закупки;
  // глобально исключённые строки остаются в списке (рисуются зачёркнутыми) и
  // вычитаются из итогов ниже (includedShoppingFinal).
  const baseShoppingList = mergeManualIntoShopping(
    calculateShoppingList(trip as any, effectiveRecipesMap, prices, dayScopedExclusions(shoppingExcluded)),
    manualItems,
    manualPriceOf,
  );

  const shoppingList = baseShoppingList.map((item, idx) => {
    void idx;
    const cost = item.estimatedCost ?? 0;
    // Fix-8 (п.6): факт чека не сбрасывается при изменении потребности —
    // цена за единицу применяется к текущему количеству (сумма пересчитывается)
    const draft = draftOverrides[String(item.ingredientId)];
    const actualUnit = draft?.price;
    return {
      ...item,
      excluded: false, // перекрывается ниже visibleShopping (shoppingExcluded)
      plannedUnitPrice: cost > 0 && item.totalAmount > 0 ? cost / item.totalAmount : undefined,
      actualUnitPrice: actualUnit,
      // Fix-7 (п.28): введённая в чеке цена делает позицию «с ценой» — даже если
      // в справочнике цены нет («нет цены» при уже введённом чеке больше не пишем)
      hasPrice: item.hasPrice || actualUnit != null,
      effectiveCost: actualUnit != null ? actualUnit * item.totalAmount : cost,
    };
  });
  // ===== Фаза 13 (п.5): soft-disable позиций — только на клиенте =====
  // Исключение из расчёта НЕ меняет справочник и не отправляется на бэкенд;
  // черновик живёт в localStorage по id похода (переживает навигацию/релоад).
  // ВАЖНО: хуки объявлены ДО ранних return-ов выше — порядок одинаковый всегда.

  /** Fix-2 (п.5): key = ingredientId (весь поход) ИЛИ `${dayDate}::${ingredientId}` (только день). */
  const toggleShoppingExcluded = (key: string) => {
    const next = new Set(shoppingExcluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // U32: пишем в общий стейдж — событие обновит и эту страницу, и «Закупка и чеки»
    persistExcluded(tripKey, next);
    setShoppingExcluded(next);
    // Fix-3 / R2: глобальные ключи синхронизируем с сервером (best effort)
    void syncServerExclusions(tripKey, next);
  };

  /** U40: перечитать ручные позиции после добавления/удаления. */
  const refreshManual = async () => {
    try { setManualItems(await getManualItems(String(id))); } catch { /* список останется прежним */ }
  };

  const handleDeleteManual = async (itemId: string, itemName: string) => {
    // Fix-6 (п.7): удаление позиции меняет закупку/чек — предупреждаем
    const ok = await confirm({
      title: `Удалить позицию «${itemName}»?`,
      confirmLabel: 'Удалить',
      message: <>Позиция уйдёт из закупки и чека, суммы пересчитаются. Отменить удаление будет нельзя.</>,
    });
    if (!ok) return;
    try {
      await deleteManualItem(String(id), itemId);
      await refreshManual();
    } catch (err: any) {
      showError(err?.detail || 'Не удалось удалить позицию');
    }
  };

  const visibleShopping = shoppingList.map(i => ({ ...i, excluded: i.excluded || shoppingExcluded.has(i.ingredientId) }));
  const includedShoppingFinal = visibleShopping.filter(i => !i.excluded);
  const shoppingTotalFinal = includedShoppingFinal.reduce((a, i) => a + (i.effectiveCost || 0), 0);

  /** Фаза 13 (п.5) + Fix-2 (п.5): переключатель soft-disable.
   * С dayDate — исключение ТОЛЬКО этого дня (количество дня уходит из закупки,
   * в остальные дни позиция продолжает закупаться); без — глобальное. */
  const ExclusionCheckbox = ({ ingredientId, dayDate }: { ingredientId: string; dayDate?: string }) => {
    const key = dayDate ? `${dayDate}::${ingredientId}` : ingredientId;
    const off = shoppingExcluded.has(key) || (!!dayDate && shoppingExcluded.has(ingredientId));
    return (
      <input
        type="checkbox"
        checked={!off}
        onChange={() => toggleShoppingExcluded(key)}
        aria-label={off ? 'Включить в расчёт' : dayDate ? 'Исключить из этого дня' : 'Исключить из расчёта'}
        title={off ? 'Включить в расчёт' : dayDate ? 'Не покупать в этот день (остальные дни не затрагиваются)' : 'Исключить из расчёта (не удаляя)'}
        className="cursor-pointer"
        style={{ accentColor: 'var(--w2)' }}
      />
    );
  };

  // U40: позиции дня (dayId) добавляются к закупке этого дня; U27: алфавитная сортировка
  const dayIdByDate = new Map((trip.days ?? []).map(d => [d.dayDate, d.id]));
  const baseDayShopping = calculateDayShopping(trip as any, effectiveRecipesMap, prices).map(day => ({
    ...day,
    items: mergeManualIntoShopping(day.items, manualForDay(manualItems, dayIdByDate.get(day.dayDate) ?? '')),
  }));
  const dayShopping = baseDayShopping.map(day => {
    const items = day.items.map(item => {
      const cost = item.estimatedCost ?? 0;
      // Fix-8 (п.6): факт-цена применяется к текущему количеству дня
      const draftDay = draftOverrides[String(item.ingredientId)];
      const actualUnit = draftDay?.price;
      return {
        ...item,
        // Fix-2 (п.5): исключение дня — составной ключ, глобальное — по id
        excluded: isRowExcluded(shoppingExcluded, day.dayDate, item.ingredientId),
        effectiveCost: actualUnit != null ? actualUnit * item.totalAmount : cost,
      };
    });
    const dayCost = items.filter(i => !i.excluded).reduce((a, i) => a + (i.effectiveCost || 0), 0);
    // U27: «Закупка по дням» — по алфавиту, чтобы можно было найти позиции
    const sorted = [...items].sort((a, b) => compareRu(a.ingredientName, b.ingredientName));
    return { ...day, items: sorted, dayCost };
  });

  // U33: «на человека» — по реальному количеству людей (среднее по дням с учётом
  // peopleOverride), а не по defaultPeople
  const realPeople = realTripPeople(trip as any);
  // Fix-5 (п.7): ручные позиции входят в «на человека» — за аптечку платят все
  const { summary: personSummaryBase, tripSummary: tripSummaryBase } = calculatePersonSummary(
    trip as any, effectiveRecipesMap, prices, realPeople, shoppingExcluded, manualItems, manualPriceOf,
  );
  // Release-1.0 (UI-consistency): KPI шапки и «Итого» в закупке — ОДИН источник.
  // Раньше при отсутствии чеков/исключений KPI брал tripSummaryBase.totalCost, а с ними —
  // shoppingTotalFinal; суммы считались разными путями и спорили друг с другом
  // (скрин: KPI «494,71 ₽» против «Итого 168 ₽»). Теперь всегда shoppingTotalFinal:
  // он уже включает фактические цены (draftOverrides) и исключения (shoppingExcluded).
  const totalCostFinal = shoppingTotalFinal;
  // Fix-7 (п.28): «⚠ нет цен» — только про позиции БЕЗ плановой цены И без
  // введённого чека (раньше список игнорировал факты и пугал «нет цены»)
  const missingNow = includedShoppingFinal.filter(i => !i.hasPrice).map(i => i.ingredientName);
  const tripSummary = {
    ...tripSummaryBase,
    totalCost: totalCostFinal,
    hasMissingPrices: missingNow.length > 0,
    missingIngredients: missingNow,
    // U33: реальное число людей (без override'ов равно defaultPeople — совместимость)
    costPerDefaultPerson: totalCostFinal / Math.max(1, realPeople),
    costPerPersonMeal: totalCostFinal / Math.max(1, tripSummaryBase.totalPersonMeals || 1),
  };
  // «На человека»: фактические цены (unit price) применяются к каждой доле напрямую;
  // без чеков — базовый расчёт утилиты.
  const personSummary = personSummaryBase.map(p => {
    const match = baseShoppingList.find(b => b.ingredientName === p.ingredientName);
    const matchDraft = match ? draftOverrides[String(match.ingredientId)] : undefined;
    // Fix-8 (п.6): факт-цена живёт при любой потребности
    const actualUnit = match ? matchDraft?.price : undefined;
    return {
      ...p,
      costPerDefaultPerson: actualUnit != null
        ? actualUnit * p.amountPerDefaultPerson
        : (p.costPerDefaultPerson != null && match && shoppingExcluded.has(match.ingredientId) ? 0 : p.costPerDefaultPerson),
    };
  })
  // U28: «На человека» — по алфавиту
  .sort((a, b) => compareRu(a.ingredientName, b.ingredientName));

  // U26: сортируемая таблица «Закупка на поход»
  const sortedShopping = sortRows(visibleShopping, sortSpec as any);

  // U38: чеклист закупки в упаковках. Информация о фасовке/категориях — из
  // справочника продуктов (best effort), фолбэк — вложенные ingredient-объекты
  // trip-рецептов (mock отдаёт их полностью; real-плоские DTO — без фасовки,
  // тогда строки идут «по потребности», backend-долг в PLAN).
  const productInfo = new Map<string, ChecklistProductInfo>();
  for (const r of [...recipes, ...tripRecipes]) {
    for (const ri of ((r as any).ingredients || [])) {
      const ing = ri?.ingredient ?? ri;
      if (ing?.id != null && !productInfo.has(String(ing.id))) {
        productInfo.set(String(ing.id), { packSize: ing.packSize, roundToPacks: ing.roundToPacks, category: categoryName(ing), pieceWeightG: ing.pieceWeightG });
      }
    }
  }
  for (const p of products) {
    productInfo.set(String(p.id), { packSize: p.packSize, roundToPacks: p.roundToPacks, category: categoryName(p), pieceWeightG: p.pieceWeightG });
  }
  // U40: опции продуктов для модалки ручных позиций. Если /admin/products недоступен
  // (real-режим, не-админ) — фолбэк из ингредиентов блюд похода (ограниченный набор).
  const manualProductOptions = (() => {
    if (products.length > 0) return products;
    const seen = new Map<string, any>();
    for (const r of [...recipes, ...tripRecipes]) {
      for (const ri of ((r as any).ingredients || [])) {
        const ing = ri?.ingredient ?? ri;
        if (ing?.id != null && ing?.name && !seen.has(String(ing.id))) {
          seen.set(String(ing.id), {
            id: String(ing.id), name: String(ing.name),
            unit: ing.unit ?? 'PCS', category: categoryName(ing), enabled: ing.enabled,
          });
        }
      }
    }
    return [...seen.values()];
  })();

  const checklist = buildChecklist(
    includedShoppingFinal.map(i => ({
      ingredientId: String(i.ingredientId),
      ingredientName: i.ingredientName,
      unit: i.unit,
      totalAmount: i.totalAmount,
    })),
    productInfo,
  );
  const toggleBought = (key: string) => {
    const next = new Set(checklistBought);
    if (next.has(key)) next.delete(key); else next.add(key);
    persistBought(tripKey, next);
    setChecklistBought(next);
  };

  // Fix-3 (п.2): сквозной статус «меню → закупка → чеки» + отметки «взято» всего
  // чеклиста одной кнопкой (чтобы блокировка чека не была тупиковой).
  // Fix-5 (п.9): отметка «взято» привязана к позиции И её количеству:
  // добавил ещё 100 г к купленному продукту — галочка слетает, позицию надо
  // переподтвердить (ключ '<id>@<нужно, граммы/шт с точностью 3 знака>').
  const checklistRowIds = checklist.flatMap(g => g.rows.map(r => `${r.ingredientId}@${Math.round(r.needed * 1000)}`));
  const boughtInList = checklistRowIds.filter(k => checklistBought.has(k)).length;
  // Fix-4 (п.11): «введено 57… а должно быть?» — знаменатель = число позиций
  // закупки, по которым нужно ввести факт; числитель — сколько из них уже с фактом.
  const factsTotal = includedShoppingFinal.length;
  // Fix-8 (п.6): в счёт идут все позиции с введённой факт-ценой (смена
  // потребности факт больше не аннулирует)
  const factCount = includedShoppingFinal.filter(i => draftOverrides[String(i.ingredientId)]?.price != null).length;
  const readiness = tripReadiness({
    mealsCount: (trip.days ?? []).reduce((a, d) => a + (d.meals?.length ?? 0), 0),
    checklistTotal: checklistRowIds.length,
    boughtCount: boughtInList,
    factCount,
    checksTotal: factsTotal,
  });
  // Fix-8 (п.6): факт «Взяли» НЕ штампуется потребностью — изменение числа
  // людей/состава не стирает введённые значения закупки (цена за единицу и
  // фактическое количество продолжают действовать для нового «нужно»).
  const commitActualQty = (ingredientId: string, value: ActualAmount | null, _needed?: number) => {
    setActualQty(tripKey, ingredientId, value);
    setActualQtyState(loadActualQty(tripKey));
  };
  const setAllBought = (on: boolean) => {
    const next = on ? new Set(checklistRowIds) : new Set<string>();
    persistBought(tripKey, next);
    setChecklistBought(next);
  };

  const tabs = [
    { id: 'menu' as TabType, label: 'Меню по дням', icon: <BookOpen size={16} /> },
    { id: 'shopping' as TabType, label: 'Закупка на поход', icon: <ShoppingCart size={16} /> },
    { id: 'dayShopping' as TabType, label: 'Закупка по дням', icon: <Calendar size={16} /> },
    { id: 'person' as TabType, label: 'На человека', icon: <Users size={16} /> },
    // Fix-3 (п.3): чеклист (список покупок) идёт РАНЬШЕ «Закупка и чеки» —
    // сначала подтверждаем покупку, потом вводим чек
    { id: 'checklist' as TabType, label: 'Чеклист', icon: <ClipboardCheck size={16} /> },
    { id: 'overrides' as TabType, label: 'Закупка и чеки', icon: <TrendingUp size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/trips')} aria-label="Назад к походам"><ArrowLeft size={20} /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{trip.name}</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')} • {trip.defaultPeople} чел.
          </p>
        </div>
        {/* Fix-5 (п.10): отчёт переехал в полосу «Готовность похода» — кнопка
            «Сформировать отчёт» живёт там же, где статус; дубль из шапки убран */}
      </div>

      {/* Summary cards — Fix-6 (п.16): тонкие строки вместо крупных плиток */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" style={{ maxWidth: '52rem' }}>
        <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Дней</span>
          <span className="stat-value text-lg font-bold whitespace-nowrap">{trip.days?.length || 0}</span>
        </div>
        <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Приёмов пищи</span>
          <span className="stat-value text-lg font-bold whitespace-nowrap">{trip.days?.reduce((a, d) => a + (d.meals?.length || 0), 0) || 0}</span>
        </div>
        <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Стоимость
            <InfoTip text="Сумма всей закупки: план по ценам справочника, а после ввода чека — фактические суммы. Без исключённых позиций." />
          </span>
          {/* Release-1.0: formatRub — целые рубли, неразрывный пробел; без «123,678 ₽» */}
          <span className="stat-value text-lg font-bold whitespace-nowrap">{formatRub(tripSummary.totalCost)}</span>
        </div>
        <div className="stat px-3 py-2 flex items-baseline justify-between gap-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            На человека
            <InfoTip text={`Общая стоимость ÷ людей в походе (${Math.round(realPeople * 10) / 10} чел. — среднее по дням с учётом переопределений). Столько платит каждый при равном делении.`} />
          </span>
          <span className="stat-value text-lg font-bold whitespace-nowrap">{formatRub(tripSummary.costPerDefaultPerson)}</span>
        </div>
      </div>

      {/* Fix-3 (п.2) + Fix-4 (п.9): готовность похода — СКВОЗНАЯ, видна на каждой
          вкладке, а не только в меню: цепочка «меню → закупка → чеки» */}
      <div className="rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Fix-6 (п.10/17/п.28-диаграмма): тонкий степпер — шаги маршрута со стрелками:
            Меню → Закупка → Чек → Готов; подсказки про «отметьте покупки» убраны
            (шум), CTA без слова «черновик». */}
        {/* Fix-7 (п.16): стрелка ПЕРЕД первым шагом («Меню собрано») убрана —
            шевроны только между шагами маршрута */}
        {[
          { text: `Меню ${readiness.menu === 'done' ? 'собрано' : 'пустое'}`, ok: readiness.menu === 'done' },
          { text: `Закупка: взято ${boughtInList} из ${checklistRowIds.length}`, ok: readiness.shopping === 'done' },
          { text: `Чек: введено ${factCount} из ${factsTotal}`, ok: readiness.checks === 'done' },
        ].map((st, i) => (
          <span key={st.text} className="inline-flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={13} style={{ color: 'var(--line-strong)' }} aria-hidden />}
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full whitespace-nowrap"
              style={st.ok
                ? { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' }
                : { background: 'var(--elev)', color: 'var(--muted)' }}
            >
              {st.ok ? '✓ ' : '○ '}{st.text}
            </span>
          </span>
        ))}
        <ChevronRight size={13} style={{ color: 'var(--line-strong)' }} aria-hidden />
        <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-full whitespace-nowrap"
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

      {/* Tabs — сегментированный контрол (.seg) из брендбука */}
      <div className="seg w-full overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`seg-btn flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'menu' && (
        <div className="space-y-3">
          {menuByDays.map((day, idx) => {
            const tripDay = trip.days?.[idx];
            if (!tripDay) return null;
            const isExpanded = expandedDays.has(tripDay.id);
            
            return (
              <div key={tripDay.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div
                  className="flex items-center justify-between p-4 cursor-pointer transition-colors"
                  onClick={() => toggleDay(tripDay.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--line-strong) 12%, transparent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={18} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={18} style={{ color: 'var(--muted)' }} />}
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--text)' }}>
                        {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>{day.meals.length} приёмов пищи • {day.effectivePeople} чел.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tripDay.peopleOverride && (
                      <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)', color: 'var(--wave-300)' }}>
                        {tripDay.peopleOverride} чел.
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingDay(tripDay.id); setDayPeopleOverride(tripDay.peopleOverride?.toString() || ''); }}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                      title="Изменить количество людей"
                    >
                      <Users size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setManualCtx({ dayId: tripDay.id, dayLabel: new Date(tripDay.dayDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) }); }}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                      title="Добавить продукт к дню (не блюдо)"
                      aria-label="Добавить продукт к дню"
                    >
                      <PackagePlus size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAddMealCtx({ dayId: tripDay.id, dayDate: tripDay.dayDate, dayIndex: idx + 1 }); }}
                      className="p-1.5 rounded transition-colors"
                      style={{ color: 'var(--muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                      title="Добавить приём пищи"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {/* Edit day people */}
                {editingDay === tripDay.id && (
                  <div className="px-4 pb-3 flex items-center gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>Людей на день:</span>
                    <input
                      type="number"
                      min={1}
                      value={dayPeopleOverride}
                      onChange={e => setDayPeopleOverride(e.target.value)}
                      className="w-20 px-2 py-1 rounded text-sm outline-none"
                      style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      placeholder={trip.defaultPeople.toString()}
                    />
                    <Button variant="primary" size="sm" onClick={() => handleUpdateDayPeople(tripDay.id)} aria-label="Сохранить количество людей">OK</Button>
                                        <Button variant="ghost" size="sm" onClick={() => setEditingDay(null)} aria-label="Отмена">Отмена</Button>
                  </div>
                )}

                {/* Meals */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {day.meals.map((meal, mealIdx) => {
                      const tripMeal = tripDay.meals?.[mealIdx];
                      return (
                      <div key={mealIdx} className="meal-row px-4 py-3 pl-12">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${mealTypeColors[meal.mealType]}`}>
                              {mealTypeLabels[meal.mealType]}
                            </span>
                            <span className="font-medium" style={{ color: 'var(--text)' }}>{meal.recipeName}</span>
                            <span className="text-xs" style={{ color: 'var(--muted)' }}>({meal.servings} {servingsWord(meal.servings)})</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* FORM-meal-composition-spec §2.2: кнопка-иконка «Состав» на карточке приёма → Модалка B */}
                            <button
                              onClick={() => tripMeal && setCompositionMeal({ dayId: tripDay.id, mealId: tripMeal.id })}
                              disabled={!tripMeal}
                              className="p-1 rounded transition-colors"
                              style={{ color: 'var(--muted)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                              title="Состав приёма"
                              aria-label={`Состав приёма: ${meal.recipeName ?? ''}`}
                            >
                              <ListChecks size={14} />
                            </button>
                            <button
                              onClick={() => tripMeal && void handleDeleteMeal(tripDay.id, tripMeal.id, meal.recipeName ?? 'приём', tripDay.dayDate)}
                              className="p-1 rounded transition-colors"
                              style={{ color: 'var(--muted)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                              title={`Удалить приём: ${meal.recipeName ?? ''}`}
                              aria-label={`Удалить приём пищи: ${meal.recipeName ?? ''}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {/* U30: добавленные в походе позиции видны рядом со «старыми»
                              ингредиентами (бейдж «+»), замены подписываются источником */}
                          {meal.ingredients.map((ing, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded"
                              title={ing.added ? 'Добавлено в походе' : ing.substitutedFrom ? `Замена: ${ing.substitutedFrom} → ${ing.name}` : undefined}
                              style={ing.added ? {
                                background: 'color-mix(in srgb, var(--wave-400) 14%, transparent)',
                                color: 'var(--w1)',
                                border: '1px solid color-mix(in srgb, var(--wave-400) 40%, transparent)',
                                fontWeight: 600,
                              } : { background: 'var(--elev)', color: 'var(--muted)' }}
                            >
                              {ing.added ? '+ ' : ''}{ing.name}: {formatAmount(ing.amount, ing.unit)}
                              {ing.substitutedFrom ? ` ← ${ing.substitutedFrom}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      );
                    })}
                    {day.meals.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
                        Нет приёмов пищи. Нажмите + чтобы добавить.
                      </div>
                    )}
                    {/* U40: ручные позиции дня (антисептик во вторник и т.п.) */}
                    {manualForDay(manualItems, tripDay.id).length > 0 && (
                      <div className="px-4 py-2 pl-12 flex flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                        {manualForDay(manualItems, tripDay.id).map(mi => (
                          <span key={mi.id} className="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5"
                            style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)', color: 'var(--text)' }}>
                            <PackagePlus size={11} style={{ color: 'var(--w1)' }} />
                            {mi.ingredientName}: {formatAmount(mi.amount, mi.unit)}
                            {mi.note ? ` · ${mi.note}` : ''}
                            <button
                              onClick={() => void handleDeleteManual(mi.id, mi.ingredientName)}
                              aria-label={`Удалить позицию: ${mi.ingredientName}`}
                              className="p-0.5 rounded"
                              style={{ color: 'var(--muted)' }}
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Fix-4 (п.3): «Продукты к походу» — не одинокая кнопка в шапке, а
              логичная карточка-«дополнительный день» в конце списка дней: те же
              формы/чипы, что у дней, понятно что это про ВЕСЬ поход. */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px dashed var(--line-strong)' }}>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-[10px]" style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)' }}>
                  <PackagePlus size={18} style={{ color: 'var(--w1)' }} />
                </span>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>На весь поход</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Не блюда: аптечка, антисептик, топливо… {manualForTrip(manualItems).length > 0 ? `· ${manualForTrip(manualItems).length} поз.` : ''}
                  </p>
                </div>
              </div>
              {/* Fix-6 (п.2): та же иконка-кнопка, что у дня («добавить продукт»), — единообразно */}
              <button
                onClick={() => setManualCtx({ dayId: null })}
                className="p-1.5 rounded transition-colors"
                style={{ color: 'var(--muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--w1)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent'; }}
                title="Добавить продукт к походу (не блюдо)"
                aria-label="Добавить продукт к походу"
              >
                <PackagePlus size={16} />
              </button>
            </div>
            {manualForTrip(manualItems).length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {manualForTrip(manualItems).map(mi => (
                  <span key={mi.id} className="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5"
                    style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)', color: 'var(--text)' }}>
                    <PackagePlus size={11} style={{ color: 'var(--w1)' }} />
                    {mi.ingredientName}: {formatAmount(mi.amount, mi.unit)}
                    {mi.note ? ` · ${mi.note}` : ''}
                    <button
                      onClick={() => void handleDeleteManual(mi.id, mi.ingredientName)}
                      aria-label={`Удалить позицию: ${mi.ingredientName}`}
                      className="p-0.5 rounded"
                      style={{ color: 'var(--muted)' }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'shopping' && (
        <div className="space-y-3 max-w-4xl">
          {/* Fix-5 (п.2): единая шапка вкладки — тот же TabHeader, что на остальных */}
          <TabHeader
            title="Закупка на поход"
            subtitle={
              <>
                Итого: {formatRub(shoppingTotalFinal)}{shoppingExcluded.size > 0 ? ` (без ${shoppingExcluded.size} искл.)` : ''}
                {' · '}позиций: {visibleShopping.length}
                {tripSummary.hasMissingPrices && (
                  <span style={{ color: 'var(--fire)' }}> · ⚠️ нет цен: {tripSummary.missingIngredients.join(', ')}</span>
                )}
              </>
            }
          />
          <div className="rounded-xl overflow-hidden mob-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {/* Fix-6 (п.23): без внутреннего скролла — как в чеклисте, полная высота */}
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--elev)' }}>
                <tr>
                  {/* Фаза 13 (п.5): чекбокс soft-disable — исключить из расчёта, не удаляя */}
                  <th className="px-4 py-3 font-medium" style={{ color: 'var(--muted)' }} aria-label="В расчёт" />
                  {/* U26: сортируемые заголовки — клик переключает asc/desc */}
                  {([
                    { field: 'ingredientName' as ShoppingSortField, label: 'Продукт', align: 'left' },
                    { field: 'totalAmount' as ShoppingSortField, label: 'Количество', align: 'right' },
                    { field: 'effectiveCost' as ShoppingSortField, label: 'Стоимость', align: 'right' },
                  ]).map(col => (
                    <th
                      key={col.field}
                      className={`text-${col.align} px-4 py-3 font-medium`}
                      style={{ color: 'var(--muted)' }}
                      aria-sort={sortSpec.field === col.field ? (sortSpec.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        onClick={() => setSortSpec(prev => prev.field === col.field
                          ? { field: col.field, dir: nextDir(prev.dir) }
                          : { field: col.field, dir: 'asc' })}
                        className={`inline-flex items-center gap-1 transition-colors ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                        style={{ color: sortSpec.field === col.field ? 'var(--w1)' : 'var(--muted)', fontWeight: sortSpec.field === col.field ? 700 : 500 }}
                        aria-label={`Сортировать по: ${col.label}`}
                      >
                        {col.label}
                        <ArrowUpDown size={12} style={{ opacity: sortSpec.field === col.field ? 1 : 0.45 }} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border)' }}>
                {sortedShopping.map(item => (
                  <tr key={item.ingredientId} style={{ borderTop: '1px solid var(--border)', opacity: item.excluded ? 0.45 : 1 }}>
                    <td className="px-4 py-3">
                      <ExclusionCheckbox ingredientId={item.ingredientId} />
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text)', textDecoration: item.excluded ? 'line-through' : 'none' }}>{item.ingredientName}</td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--muted)' }}>{formatAmount(item.totalAmount, item.unit)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.hasPrice ? (
                        <span style={{ color: 'var(--text)' }}>
                          {formatRub(item.effectiveCost)}
                          {/* п.6: явно показываем, что применена фактическая цена из чека */}
                          {/* Fix-7 (п.17/28): бейдж — по свежему факту чека (actualUnitPrice) */}
                          {item.actualUnitPrice != null && (
                            <span className="text-xs ml-1" style={{ color: 'var(--w2)' }} title="По введённому чеку">✓ чек</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--fire)' }}>нет цены</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'dayShopping' && (
        <div className="space-y-3 max-w-3xl">
          {/* Fix-5 (п.2): на «по дням» теперь тоже есть заголовок — вкладки выглядят одинаково */}
          <TabHeader
            title="Закупка по дням"
            subtitle={`Итого за поход: ${formatRub(dayShopping.reduce((a, d) => a + d.dayCost, 0))} · ${dayShopping.length} дн.`}
          />
          {dayShopping.map(day => (
            <div key={day.dayDate} className="rounded-xl overflow-hidden mob-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>
                    {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{day.items.length} продуктов</p>
                </div>
                <div className="text-right">
                  {/* п.6: день считается с фактическими ценами и без исключённых позиций (dayShopping.effectiveCost/dayCost) */}
                  <p className="font-bold" style={{ color: 'var(--text)' }}>{formatRub(day.dayCost)}</p>
                  {day.hasMissingPrices && <p className="text-xs" style={{ color: 'var(--fire)' }}>есть без цены</p>}
                </div>
              </div>
              <div className="px-4 py-2">
                {day.items.map(item => (
                  <div key={item.ingredientId} className="flex items-center justify-between py-1.5 text-sm" style={{ opacity: item.excluded ? 0.45 : 1 }}>
                    <span className="flex items-center gap-2" style={{ color: 'var(--text)', textDecoration: item.excluded ? 'line-through' : 'none' }}>
                      <ExclusionCheckbox ingredientId={item.ingredientId} dayDate={day.dayDate} />
                      {item.ingredientName}
                    </span>
                    <div className="flex items-center gap-4">
                      <span style={{ color: 'var(--muted)' }}>{formatAmount(item.totalAmount, item.unit)}</span>
                      <span className="w-20 text-right" style={{ color: 'var(--text)' }}>
                        {item.hasPrice ? formatRub(item.effectiveCost ?? item.estimatedCost) : <span className="text-xs" style={{ color: 'var(--fire)' }}>—</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Fix-6 (п.14): позиции «к походу» (аптечка, топливо…) не относятся ни к
              одному дню — отдельная карточка в конце, чтобы суммы дней и итог сходились */}
          {manualForTrip(manualItems).length > 0 && (
            <div className="rounded-xl overflow-hidden mob-scroll" style={{ background: 'var(--surface)', border: '1px dashed var(--line-strong)' }}>
              <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)' }}>На весь поход</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Не привязаны к дням · учтены в итоговой сумме похода
                  </p>
                </div>
                <p className="font-bold" style={{ color: 'var(--text)' }}>
                  {formatRub(manualForTrip(manualItems).reduce((a, mi) => {
                    const price = manualPriceOf(mi.ingredientId);
                    return a + (price != null ? price * mi.amount : 0);
                  }, 0))}
                </p>
              </div>
              <div className="px-4 py-2">
                {manualForTrip(manualItems).map(mi => {
                  const price = manualPriceOf(mi.ingredientId);
                  return (
                    <div key={mi.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span style={{ color: 'var(--text)' }}>{mi.ingredientName}{mi.note ? ` · ${mi.note}` : ''}</span>
                      <div className="flex items-center gap-4">
                        <span style={{ color: 'var(--muted)' }}>{formatAmount(mi.amount, mi.unit)}</span>
                        <span className="w-20 text-right" style={{ color: 'var(--text)' }}>
                          {price != null ? formatRub(price * mi.amount) : <span className="text-xs" style={{ color: 'var(--fire)' }}>—</span>}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'person' && (
        <div className="space-y-4 max-w-4xl">
          {/* Fix-5 (п.2/3/4/6): единая шапка + человеческие названия вместо
              «человеко-приёмов» и «на чел./приём», у каждого числа — тултип с формулой */}
          <TabHeader
            title="На человека"
            subtitle="Сколько продуктов и денег приходится на одного участника — за поход и за один приём пищи"
          />
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>Сводка</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Приёмов пищи всего
                  {/* Fix-7 (п.29): считаем ПРИЁМЫ (завтраки+обеды+ужины+перекусы),
                      а не человеко-приёмы */}
                  <InfoTip text="Число приёмов пищи во всём меню: завтраки + обеды + ужины + перекусы по всем дням." />
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                  {(trip.days ?? []).reduce((a, d) => a + (d.meals?.length ?? 0), 0)}
                </p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Людей в походе
                  <InfoTip text="Среднее число участников по дням (переопределения «людей на день» учитываются). На него делятся общие суммы." />
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{Math.round(realPeople * 10) / 10}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  На человека за поход
                  <InfoTip text="Общая стоимость закупки ÷ людей в походе. Столько платит каждый участник при равном делении." />
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatRub(tripSummary.costPerDefaultPerson)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  На человека за приём
                  <InfoTip text="Общая стоимость ÷ число приёмов пищи (люди × приёмы). Средняя цена одного приёма на одного человека." />
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatRub(tripSummary.costPerPersonMeal)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Калории за приём
                  <InfoTip text="Средняя калорийность одного приёма пищи на человека — считается из продуктов блюд." />
                </p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{tripSummary.caloriesPerPersonMeal ? `${Math.round(tripSummary.caloriesPerPersonMeal)} ккал` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Per person products */}
          <div className="rounded-xl overflow-hidden mob-scroll" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>Продукты на человека</h3>
            </div>
            {/* Fix-6 (п.23): без внутреннего скролла */}
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--elev)' }}>
                  <tr>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Продукт</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                      На человека
                      <InfoTip text="Количество продукта на одного участника за ВЕСЬ поход: общее количество ÷ людей в походе." />
                    </th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                      На человека за приём
                      <InfoTip text="Среднее количество на одного человека за один приём пищи: общее количество ÷ приёмов пищи всего." />
                    </th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                      Стоимость на человека
                      <InfoTip text="Стоимость этого продукта на одного участника за весь поход (с фактическими ценами, если чек введён)." />
                    </th>
                  </tr>
                </thead>
                <tbody style={{ borderTop: '1px solid var(--border)' }}>
                  {personSummary.map((item, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-2.5" style={{ color: 'var(--text)' }}>{item.ingredientName}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: 'var(--muted)' }}>{formatAmount(item.amountPerDefaultPerson, item.unit)}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: 'var(--muted)' }}>{formatAmount(item.amountPerPersonMeal, item.unit)}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text)' }}>
                        {item.costPerDefaultPerson != null ? formatRub(item.costPerDefaultPerson) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        </div>
      )}

      {activeTab === 'overrides' && (
        <PriceOverridesTab tripId={trip.id} />
      )}

      {/* U38: «Чеклист» — что брать в магазине: ЦЕЛЫЕ упаковки (округление вверх),
          группы по категориям, алфавит. Исключённые позиции не попадают (их не берём).
          Отметки «взято» живут в рамках сессии — это рабочий лист магазина, не данные похода. */}
      {activeTab === 'checklist' && (
        <div className="space-y-3 max-w-3xl">
          <TabHeader
            title="Чеклист закупки"
            subtitle={
              <>
                {/* Fix-7 (п.21): «целые упаковки (округление вверх — излишек…)» — убрано */}
                Взято {boughtInList} из {checklistRowIds.length}
                <InfoTip text="Отметка «взято» привязана к количеству: измените потребность (добавите продукт) — отметка слетит, позицию нужно переподтвердить. В поле «беру» уже подставлено расчётное количество — поправьте, если берёте иначе (на развес, россыпью или упаковками другого объёма)." />
              </>
            }
            right={
              /* Fix-3 (п.2): одной кнопкой — всё куплено / сброс (чтобы чек не блокировался намертво) */
              <div className="flex gap-2 shrink-0">
                <Button variant="soft" size="sm" onClick={() => setAllBought(true)}
                        aria-label="Отметить всё купленным" disabled={checklistRowIds.length === 0 || boughtInList === checklistRowIds.length}>
                  Отметить всё
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAllBought(false)}
                        aria-label="Снять все отметки" disabled={boughtInList === 0}>
                  Снять всё
                </Button>
              </div>
            }
          />
          {checklist.length === 0 && (
            <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              В закупке нет позиций — добавьте приёмы пищи или продукты к дню/походу.
            </div>
          )}
          {checklist.map(group => (
            <div key={group.category} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--border)', background: 'var(--elev)' }}>
                <h4 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{group.category}</h4>
              </div>
              {group.rows.map(row => {
                // Fix-5 (п.9): ключ отметки включает количество — потребность
                // изменилась (добавили ещё) ⇒ галочка слетает автоматически.
                const boughtKey = `${row.ingredientId}@${Math.round(row.needed * 1000)}`;
                const bought = checklistBought.has(boughtKey);
                // Fix-5 (п.21) + Fix-7 (п.22) + Fix-8 (п.6): свободный ввод
                // «сколько реально берём». Сохранённый факт переживает изменение
                // потребности (люди/состав) — пользовательский ввод не стирается;
                // пока факта нет — поле ПРЕДЗАПОЛНЕНО расчётным количеством
                // (целые упаковки вверх / потребность) — «ожидаемые значения
                // автоматически», править нужно только отличия.
                const storedActual = actualQty[row.ingredientId] ?? null;
                const actual = storedActual ?? neededAsActual(row.buyAmount, row.unit);
                // Fix-6 (п.9): куплено МЕНЬШЕ нужного — подсветка предупреждением
                const underfilled = bought && actual != null
                  ? isActualLessThanNeeded(actual, row.needed, row.unit, row.pieceWeightG)
                  : null;
                const packHintStr = row.packsToBuy != null && row.packSize
                  ? `нужно ${formatAmount(row.needed, row.unit)} ≈ ${row.packsToBuy} × ${formatAmount(row.packSize, row.unit)}`
                  : `нужно ${formatAmount(row.needed, row.unit)} (без фасовки)`;
                return (
                  <div
                    key={row.ingredientId}
                    className="checklist-row flex items-center gap-3 px-4 py-3 text-sm"
                    style={{
                      borderTop: '1px solid var(--border)',
                      opacity: bought && !underfilled ? 0.6 : 1,
                      // Fix-6 (п.9): янтарная подсветка — отмечено «взято», но количество меньше нужного
                      background: underfilled ? 'color-mix(in srgb, var(--amber-500) 10%, transparent)' : undefined,
                    }}
                    onClick={() => toggleBought(boughtKey)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBought(boughtKey); } }}
                    aria-label={`${bought ? 'Взято' : 'Отметить взятым'}: ${row.name}`}
                  >
                    <input
                      type="checkbox"
                      checked={bought}
                      onChange={() => toggleBought(boughtKey)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Взято: ${row.name}`}
                      className="cursor-pointer shrink-0"
                      style={{ accentColor: 'var(--w2)' }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block" style={{ color: 'var(--text)', textDecoration: bought ? 'line-through' : 'none' }}>
                        {row.name}
                      </span>
                      <span className="block text-xs" style={{ color: underfilled ? 'var(--amber-300)' : 'var(--muted)' }}>
                        {underfilled ? `⚠ взяли меньше, чем нужно · ${packHintStr}` : packHintStr}
                      </span>
                    </span>
                    {/* Fix-6 (п.8): свободные единицы — «беру 300 г» даже если учтён в штуках */}
                    <span className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>беру</span>
                      <FreeAmountInput
                        value={actual}
                        baseUnit={row.unit}
                        pieceWeightG={row.pieceWeightG}
                        onChange={(v) => commitActualQty(row.ingredientId, v, row.needed)}
                        ariaLabel={`Сколько реально берёте: ${row.name}`}
                        testId={`actual-qty-${row.ingredientId}`}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Модалка A — «Добавить приём пищи» (FORM-spec §2.1): одна commit-кнопка,
          контекст дня, превью блюда; состав здесь НЕ редактируется.
          Fix-7 (п.7): люди приёма = люди дня (override дня ?? defaultPeople) */}
      {addMealCtx && trip && (
        <AddMealModal
          tripId={trip.id}
          tripName={trip.name}
          defaultPeople={trip.defaultPeople}
          dayPeople={
            trip.days?.find(d => d.id === addMealCtx.dayId)?.peopleOverride ?? trip.defaultPeople
          }
          day={{ dayId: addMealCtx.dayId, dayDate: addMealCtx.dayDate, dayIndex: addMealCtx.dayIndex }}
          initialMealType={addMealCtx.mealType ?? 'LUNCH'}
          onClose={() => setAddMealCtx(null)}
          onAdded={handleMealAdded}
        />
      )}

      {/* Модалка B — «Состав приёма» (FORM-spec §2.2): только для существующего приёма,
          batch PUT composition + refetch summary после сохранения */}
      {compositionMeal && trip && (
        <MealCompositionModal
          tripId={trip.id}
          mealId={compositionMeal.mealId}
          isAdmin={isEditorAdmin === true}
          onClose={() => setCompositionMeal(null)}
          onSaved={() => { void loadData(); }}
          onEditCatalogRecipe={(recipeId) => {
            // Fix-2 (п.7): recipeId может быть trip-scoped снепшотом — резолвим
            // в глобальный каталог (mock: суффикс '::t…'; real: snapshotOf копии),
            // иначе /recipes?edit= не находит блюдо и редактор не открывается.
            const snap = tripRecipes.find(r => String(r.id) === String(recipeId)) as any;
            let globalId = String(recipeId);
            if (snap?.snapshotOf != null) globalId = String(snap.snapshotOf);
            else if (globalId.includes('::t')) globalId = globalId.split('::t')[0];
            navigate(`/recipes?edit=${globalId}`);
          }}
        />
      )}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {confirmDialog}

      {/* Модалка ручных позиций (U40): продукты к дню (dayId) или ко всему походу (null) */}
      {manualCtx && trip && (
        <ManualItemsModal
          tripId={trip.id}
          dayId={manualCtx.dayId}
          dayLabel={manualCtx.dayLabel}
          isAdmin={isEditorAdmin === true}
          items={manualCtx.dayId == null
            ? manualForTrip(manualItems)
            : manualForDay(manualItems, manualCtx.dayId)}
          products={manualProductOptions}
          onClose={() => setManualCtx(null)}
          onChanged={() => { void refreshManual(); }}
        />
      )}
    </div>
  );
}
