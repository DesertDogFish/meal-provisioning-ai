import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { calculateMenuByDays, calculateShoppingList, calculateDayShopping, calculatePersonSummary, formatAmount } from '../utils/calculations';
import { formatRub } from '../utils/formatRub'; // Фаза 13: итоги — целые рубли
import { ArrowLeft, Plus, Trash2, Users, ShoppingCart, BookOpen, TrendingUp, Calendar, ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import { MealType } from '../types';
import PriceOverridesTab from '../components/PriceOverridesTab';
import AddMealModal, { type AddMealDayContext } from '../components/AddMealModal';
import MealCompositionModal from '../components/MealCompositionModal';
import { servingsWord } from '../utils/text';
import { api, getRecipes } from '../api/client';
import type { Ingredient } from '../types';
import { useToast } from '../components/ToastProvider';
import { Button } from '../components/Button';

/** Фаза 13: черновик фактической цены (₽ за единицу измерения продукта). */
export interface ActualPriceDraft {
  price: number;
  /** ₽ за всю позицию по чеку (для подписей в UI) */
  total: number;
}

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
const mealTypeColors: Record<MealType, string> = {
  BREAKFAST: 'badge-warning',
  LUNCH: 'badge-success',
  DINNER: 'badge-neutral',
  SNACK: 'badge-success',
};

type TabType = 'menu' | 'shopping' | 'dayShopping' | 'person' | 'overrides';

export default function TripDetailPage() {
  const { showError } = useToast();
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
  const [products, setProducts] = useState<Ingredient[]>([]);
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
  const draftKey = `trip-actual-prices-${id ?? ''}`;
  // setDraftOverrides не нужен: черновики цен пишет только сама вкладка
  // «Закупка» (инлайн-поле), PriceOverridesTab работает с серверными оверрайдами.
  const [draftOverrides] = useState<Record<string, ActualPriceDraft>>(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(draftKey, JSON.stringify(draftOverrides)); } catch { /* quota/SSR — не критично */ }
  }, [draftKey, draftOverrides]);

  // ===== Фаза 13 (п.5): soft-disable позиций — только на клиенте =====
  // Хуки ОБЯЗАТЕЛЬНО до ранних return-ов (loading/error) — иначе rules-of-hooks.
  const excludedKey = `trip-shopping-excluded-${id ?? ''}`;
  const [shoppingExcluded, setShoppingExcluded] = useState<Set<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(excludedKey) || '[]') as unknown;
      return Array.isArray(raw) ? new Set(raw.filter((x): x is string => typeof x === 'string')) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    try { localStorage.setItem(excludedKey, JSON.stringify([...shoppingExcluded])); } catch { /* noop */ }
  }, [excludedKey, shoppingExcluded]);

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
      const [tripData, recipesData, pricesData, tripRecipesData] = await Promise.all([
        api.get<Trip>(`/trips/${id}`),
        getRecipes(),
        // V20: цены КОНКРЕТНОГО похода (trip-scoped копии продуктов, замороженный план);
        // глобальный справочник цен — GET /prices (экраны админа/каталога)
        api.get<Price[]>(`/trips/${id}/prices`),
        // V20: trip-scoped копии блюд (меню похода ссылается на них)
        api.get<Recipe[]>(`/trips/${id}/recipes`).catch(() => [] as Recipe[])
      ]);
      setTrip(tripData);
      setRecipes(recipesData);
      setTripRecipes(tripRecipesData);
      setPrices(pricesData);
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

  // Справочник продуктов и роль пользователя — подгружаются один раз:
  // нужны для строки добавления продукта в Модалке B и ссылки админа в справочник (T7).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prods, me] = await Promise.all([
          api.get<any>('/admin/products').catch(() => []),
          localStorage.getItem('accessToken')
            ? api.get<{ role?: string }>('/auth/me').catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        // Ответ /admin/products — PageResponse или массив (mock/бэкенд)
        const list = Array.isArray(prods) ? prods : (prods?.content ?? []);
        setProducts(list as Ingredient[]);
        setIsEditorAdmin(String(me?.role ?? '').toUpperCase() === 'ADMIN');
      } catch { /* не критично: строка добавления просто останется без справочника */ }
    })();
    return () => { cancelled = true; }
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--muted)' }}>Загрузка...</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--fire)' }}>{error || 'Поход не найден'}</p>
        <button onClick={() => navigate('/trips')} className="mt-4 ghost-btn">← Назад к походам</button>
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

  const handleDeleteMeal = async (dayId: string, mealId: string) => {
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
  const menuByDays = calculateMenuByDays(trip as any, recipesMap);
  const baseShoppingList = calculateShoppingList(trip as any, recipesMap, prices);

  const shoppingList = baseShoppingList.map((item, idx) => {
    void idx;
    const cost = item.estimatedCost ?? 0;
    const actualUnit = draftOverrides[item.ingredientId]?.price;
    return {
      ...item,
      excluded: false, // перекрывается ниже visibleShopping (shoppingExcluded)
      plannedUnitPrice: cost > 0 && item.totalAmount > 0 ? cost / item.totalAmount : undefined,
      actualUnitPrice: actualUnit,
      effectiveCost: actualUnit != null ? actualUnit * item.totalAmount : cost,
    };
  });
  // ===== Фаза 13 (п.5): soft-disable позиций — только на клиенте =====
  // Исключение из расчёта НЕ меняет справочник и не отправляется на бэкенд;
  // черновик живёт в localStorage по id похода (переживает навигацию/релоад).
  // ВАЖНО: хуки объявлены ДО ранних return-ов выше — порядок одинаковый всегда.

  const toggleShoppingExcluded = (ingredientId: string) => {
    setShoppingExcluded(prev => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  };

  const visibleShopping = shoppingList.map(i => ({ ...i, excluded: i.excluded || shoppingExcluded.has(i.ingredientId) }));
  const includedShoppingFinal = visibleShopping.filter(i => !i.excluded);
  const shoppingTotalFinal = includedShoppingFinal.reduce((a, i) => a + (i.effectiveCost || 0), 0);

  /** Фаза 13 (п.5): переключатель soft-disable позиции в расчёте (клиентский чекбокс). */
  const ExclusionCheckbox = ({ ingredientId }: { ingredientId: string }) => (
    <input
      type="checkbox"
      checked={!shoppingExcluded.has(ingredientId)}
      onChange={() => toggleShoppingExcluded(ingredientId)}
      aria-label={shoppingExcluded.has(ingredientId) ? 'Включить в расчёт' : 'Исключить из расчёта'}
      title={shoppingExcluded.has(ingredientId) ? 'Включить в расчёт' : 'Исключить из расчёта (не удаляя)'}
      className="cursor-pointer"
      style={{ accentColor: 'var(--w2)' }}
    />
  );

  const baseDayShopping = calculateDayShopping(trip as any, recipesMap, prices);
  const dayShopping = baseDayShopping.map(day => {
    const items = day.items.map(item => {
      const cost = item.estimatedCost ?? 0;
      const actualUnit = draftOverrides[item.ingredientId]?.price;
      return {
        ...item,
        excluded: shoppingExcluded.has(item.ingredientId),
        effectiveCost: actualUnit != null ? actualUnit * item.totalAmount : cost,
      };
    });
    const dayCost = items.filter(i => !i.excluded).reduce((a, i) => a + (i.effectiveCost || 0), 0);
    return { ...day, items, dayCost };
  });

  const { summary: personSummaryBase, tripSummary: tripSummaryBase } = calculatePersonSummary(trip as any, recipesMap, prices);
  // Фаза 13: итоги с учётом фактических цен и исключённых позиций
  const hasAdjustments = Object.keys(draftOverrides).length > 0 || shoppingExcluded.size > 0;
  const totalCostFinal = hasAdjustments ? shoppingTotalFinal : tripSummaryBase.totalCost;
  const tripSummary = {
    ...tripSummaryBase,
    totalCost: totalCostFinal,
    costPerDefaultPerson: totalCostFinal / Math.max(1, trip.defaultPeople || 1),
    costPerPersonMeal: totalCostFinal / Math.max(1, tripSummaryBase.totalPersonMeals || 1),
  };
  // «На человека»: фактические цены (unit price) применяются к каждой доле напрямую;
  // без чеков — базовый расчёт утилиты.
  const personSummary = personSummaryBase.map(p => {
    const match = baseShoppingList.find(b => b.ingredientName === p.ingredientName);
    const actualUnit = match ? draftOverrides[match.ingredientId]?.price : undefined;
    return {
      ...p,
      costPerDefaultPerson: actualUnit != null
        ? actualUnit * p.amountPerDefaultPerson
        : (p.costPerDefaultPerson != null && match && shoppingExcluded.has(match.ingredientId) ? 0 : p.costPerDefaultPerson),
    };
  });

  const tabs = [
    { id: 'menu' as TabType, label: 'Меню по дням', icon: <BookOpen size={16} /> },
    { id: 'shopping' as TabType, label: 'Закупка на поход', icon: <ShoppingCart size={16} /> },
    { id: 'dayShopping' as TabType, label: 'Закупка по дням', icon: <Calendar size={16} /> },
    { id: 'person' as TabType, label: 'На человека', icon: <Users size={16} /> },
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat">
          <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Дней</p>
          <p className="stat-value text-xl font-bold">{trip.days?.length || 0}</p>
        </div>
        <div className="stat">
          <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Приёмов пищи</p>
          <p className="stat-value text-xl font-bold">{trip.days?.reduce((a, d) => a + (d.meals?.length || 0), 0) || 0}</p>
        </div>
        <div className="stat">
          <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Стоимость</p>
          <p className="stat-value text-xl font-bold">{tripSummary.totalCost.toLocaleString('ru-RU')} ₽</p>
        </div>
        <div className="stat">
          <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>На человека</p>
          <p className="stat-value text-xl font-bold">{tripSummary.costPerDefaultPerson.toLocaleString('ru-RU')} ₽</p>
        </div>
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
                              onClick={() => tripMeal && handleDeleteMeal(tripDay.id, tripMeal.id)}
                              className="p-1 rounded transition-colors"
                              style={{ color: 'var(--muted)' }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {meal.ingredients.map((ing, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                              {ing.name}: {formatAmount(ing.amount, ing.unit)}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'shopping' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-bold" style={{ color: 'var(--text)' }}>Список закупок на весь поход</h3>
            {/* Фаза 13 (п.5): итог учитывает фактические цены (draftOverrides) и исключения (shoppingExcluded) */}
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Итого: {formatRub(shoppingTotalFinal)}{shoppingExcluded.size > 0 ? ` (без ${shoppingExcluded.size} искл.)` : ''}</p>
            {tripSummary.hasMissingPrices && (
              <p className="text-sm mt-1" style={{ color: 'var(--fire)' }}>⚠️ Нет цен для: {tripSummary.missingIngredients.join(', ')}</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--elev)' }}>
                <tr>
                  {/* Фаза 13 (п.5): чекбокс soft-disable — исключить из расчёта, не удаляя */}
                  <th className="px-4 py-3 font-medium" style={{ color: 'var(--muted)' }} aria-label="В расчёт" />
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Продукт</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Количество</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Стоимость</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border)' }}>
                {visibleShopping.map(item => (
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
                          {draftOverrides[item.ingredientId] != null && (
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
        <div className="space-y-3">
          {dayShopping.map(day => (
            <div key={day.dayDate} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
                      <ExclusionCheckbox ingredientId={item.ingredientId} />
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
        </div>
      )}

      {activeTab === 'person' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>Сводка</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Человеко-приёмов</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{tripSummary.totalPersonMeals}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>На 1 чел. (общее)</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatRub(tripSummary.costPerDefaultPerson)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>На 1 чел./приём</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatRub(tripSummary.costPerPersonMeal)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Калории/приём</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{tripSummary.caloriesPerPersonMeal ? `${Math.round(tripSummary.caloriesPerPersonMeal)} ккал` : '—'}</p>
              </div>
            </div>
          </div>

          {/* Per person products */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text)' }}>Продукты на человека</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: 'var(--elev)' }}>
                  <tr>
                    <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Продукт</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>На чел. (общее)</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>На чел./приём</th>
                    <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>₽/чел.</th>
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
        </div>
      )}

      {activeTab === 'overrides' && (
        <PriceOverridesTab tripId={trip.id} />
      )}

      {/* Модалка A — «Добавить приём пищи» (FORM-spec §2.1): одна commit-кнопка,
          контекст дня, превью блюда; состав здесь НЕ редактируется */}
      {addMealCtx && trip && (
        <AddMealModal
          tripId={trip.id}
          tripName={trip.name}
          defaultPeople={trip.defaultPeople}
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
          onEditCatalogRecipe={(recipeId) => { navigate(`/recipes?edit=${recipeId}`); }}
        />
      )}
    </div>
  );
}
