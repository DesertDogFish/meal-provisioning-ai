/**
 * Подзадача 26 аудита (2026-10-29): состояние и мутации страницы похода,
 * вынесенные из `TripDetailPage.tsx` (R8/R9) в хук. Страница осталась тонкой
 * обёрткой: layout + вкладки + модалки; производные данные считает чистый
 * модуль `utils/tripDerived.ts`, презентация — в компонентах Trip*.
 *
 * ЕДИНСТВЕННЫЙ владелец состояния (критерий «нет дублирования state»):
 * компоненты получают данные и колбэки только через props.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, getRecipes, getTripRecipes } from '../api/client';
import { useToast } from '../components/ToastProvider';
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7)
import { loadActualPrices, loadExcluded, setExcluded as persistExcluded, loadBought, setBought as persistBought, loadActualQty, setActualQty, onTripStageChange, type ChecklistActual, type ActualPriceDraft } from '../utils/tripStaging'; // U32 + Fix-2(п.6) + Fix-5(п.21) + Fix-8(п.6)
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits'; // U30
import { getManualItems, deleteManualItem, type TripManualItem } from '../api/tripManualItems'; // U40
import { nextDir, type SortDir } from '../utils/rowSort'; // U26–U28
import { getServerExclusions, syncServerExclusions } from '../api/shoppingExclusions'; // Fix-3 / R2
import { categoryName } from '../utils/format';
import { deriveTripView } from '../utils/tripDerived';
import { parseStage } from '../components/StageTabBar';
import type { AddMealDayContext } from '../components/AddMealModal';
import type { MealType } from '../types';
import type { ActualAmount } from '../utils/checkUnits';
import type { Trip, Recipe, Price, TabType, ShoppingSortField } from '../types/tripDetail';

export function useTripDetail() {
  const { showError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm(); // Fix-6 (п.7)
  const { id } = useParams<{ id: string }>();
  // Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 2): этап живёт в
  // URL (?stage=) — ссылкой попадаем в нужный этап, e2e детерминированы.
  // Старые значения (dayShopping/person/checklist/overrides) маппятся в этапы.
  const [searchParams, setSearchParams] = useSearchParams();
  // подзадача 10 (30.10.2026): deep-link «В меню похода…» из каталога блюд —
  // ?addMeal=<dayId> открывает модалку приёма на выбранном дне этапа ①
  const addMealHandled = useRef(false);
  const [activeTab, setActiveTabState] = useState<TabType>(() => parseStage(searchParams.get('stage')));
  const setActiveTab = (t: TabType) => {
    setActiveTabState(t);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('stage', t);
        return next;
      },
      { replace: true },
    );
  };

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
  // «Закупку/По дням/На человека». Теперь saveActualPrice/setExcluded рассылают
  // событие, sync() ниже обновляет оба набора — зависимые экраны перерисовываются.
  const tripKey = String(id ?? '');
  const [draftOverrides, setDraftOverrides] = useState<Record<string, ActualPriceDraft>>({});
  const [shoppingExcluded, setShoppingExcluded] = useState<Set<string>>(new Set());
  const [checklistBought, setChecklistBought] = useState<Set<string>>(new Set());
  // Fix-6 (п.8): сколько РЕАЛЬНО берём — {amount, unit} свободно (г/кг/мл/л/шт/уп),
  // общий стейдж с чеком («Взяли» в чеке берётся ОТСЮДА, повторного ввода нет)
  const [actualQty, setActualQtyState] = useState<Record<string, ChecklistActual>>({});

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
  const [manualCtx, setManualCtx] = useState<{ dayId: string | null; dayLabel?: string } | null>(null);

  useEffect(() => {
    if (id) {
      void loadData();
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
    if (!trip) return;
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
    if (!trip) return;
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

  /** Фаза 13 (п.5) + Fix-2 (п.5): переключатель soft-disable.
   * С dayDate — исключение ТОЛЬКО этого дня (количество дня уходит из закупки,
   * в остальные дни позиция продолжает закупаться); без — глобальное. */
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

  const toggleBought = (key: string) => {
    const next = new Set(checklistBought);
    if (next.has(key)) next.delete(key); else next.add(key);
    persistBought(tripKey, next);
    setChecklistBought(next);
  };

  // Fix-8 (п.6): факт «Взяли» НЕ штампуется потребностью — изменение числа
  // людей/состава не стирает введённые значения закупки (цена за единицу и
  // фактическое количество продолжают действовать для нового «нужно»).
  const commitActualQty = (ingredientId: string, value: ActualAmount | null, _needed?: number) => {
    setActualQty(tripKey, ingredientId, value);
    setActualQtyState(loadActualQty(tripKey));
  };

  const setAllBought = (on: boolean, allKeys: string[]) => {
    const next = on ? new Set(allKeys) : new Set<string>();
    persistBought(tripKey, next);
    setChecklistBought(next);
  };

  /** U26: клик по заголовку таблицы — то же поле меняет направление, другое — asc. */
  const handleSortField = (field: ShoppingSortField) => {
    setSortSpec(prev => prev.field === field
      ? { field, dir: nextDir(prev.dir) }
      : { field, dir: 'asc' });
  };

  // Производные view-модели — чистый модуль (тот же порядок вычислений, что
  // раньше был в теле страницы). До загрузки похода считать нечего.
  const view = trip
    ? deriveTripView({
        trip, recipes, tripRecipes, recipesMap, tripEdits, prices, manualItems,
        products, draftOverrides, shoppingExcluded, checklistBought, sortSpec,
      })
    : null;

  useEffect(() => {
    if (!trip || addMealHandled.current) return;
    const dayId = searchParams.get('addMeal');
    if (!dayId) return;
    addMealHandled.current = true;
    const idx = (trip.days ?? []).findIndex((d) => String(d.id) === dayId);
    if (idx >= 0) {
      const d = trip.days![idx];
      setAddMealCtx({ dayId: String(d.id), dayDate: d.dayDate, dayIndex: idx });
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('addMeal');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  return {
    id, trip, loading, error,
    activeTab, setActiveTab,
    expandedDays, editingDay, setEditingDay, dayPeopleOverride, setDayPeopleOverride,
    addMealCtx, setAddMealCtx, compositionMeal, setCompositionMeal,
    manualCtx, setManualCtx, isEditorAdmin,
    tripRecipes, manualItems, products, sortSpec,
    checklistBought, actualQty, draftOverrides, shoppingExcluded,
    view, confirmDialog,
    loadData, toggleDay, handleMealAdded, handleDeleteMeal, handleUpdateDayPeople,
    handleSortField, toggleShoppingExcluded, refreshManual, handleDeleteManual,
    toggleBought, commitActualQty, setAllBought,
  };
}
