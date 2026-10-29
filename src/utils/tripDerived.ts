/**
 * Подзадача 26 аудита (2026-10-29): производные данные страницы похода,
 * вынесенные из `TripDetailPage.tsx` (R8/R9) в чистый модуль.
 *
 * Здесь НЕТ состояния и побочных эффектов: функция `deriveTripView` принимает
 * снимок состояния (поход, рецепты, цены, правки, стейдж чека/исключений) и
 * возвращает готовые view-модели для вкладок — тот же самый код и порядок
 * вычислений, что раньше исполнялся в теле страницы при каждом рендере.
 *
 * Инвариант Release-1.0 (UI-consistency) сохранён: KPI шапки и «Итого»
 * в закупке считаются из ОДНОГО источника (`shoppingTotalFinal`), фактические
 * цены чека (draftOverrides) и исключения (shoppingExcluded) применяются
 * одинаково к «Закупка / По дням / На человека / Чеклист».
 */
import {
  calculateMenuByDays, calculateShoppingList, calculateDayShopping,
  calculatePersonSummary, findPriceForDate, isRowExcluded, dayScopedExclusions,
  realTripPeople,
} from './calculations';
import { mergeManualIntoShopping, manualForDay } from './manualItems';
import { buildEffectiveRecipesMap } from './recipeEdits';
import { buildChecklist, collectChecklistKeys, type ChecklistProductInfo } from './checklist';
import { sortRows, compareRu, type SortDir } from './rowSort';
import { tripReadiness } from './readiness';
import { categoryName } from './format';
import type { ActualPriceDraft } from './tripStaging';
import type { TripIngredientEdit } from '../api/tripEdits';
import type { TripManualItem } from '../api/tripManualItems';
import type { Trip, Recipe, Price, ShoppingSortField } from '../types/tripDetail';

export interface TripViewInput {
  trip: Trip;
  recipes: Recipe[];
  /** V20: trip-scoped копии блюд (снепшоты) — меню ссылается на них */
  tripRecipes: Recipe[];
  recipesMap: Map<string, Recipe>;
  /** U30: серверные правки состава (overlay на рецепты ДО всех расчётов) */
  tripEdits: TripIngredientEdit[];
  /** V20: цены конкретного похода (замороженный план) */
  prices: Price[];
  /** U40: ручные позиции (к дню и к походу) */
  manualItems: TripManualItem[];
  /** U38/U40: справочник продуктов (фасовка/категории), best effort */
  products: any[];
  /** Фаза 13: черновики фактических цен из чека (общий стейдж tripStaging) */
  draftOverrides: Record<string, ActualPriceDraft>;
  /** Fix-2 (п.5): soft-disable — глобальные и по-дневные ключи */
  shoppingExcluded: Set<string>;
  /** Fix-2: отметки «взято» чеклиста */
  checklistBought: Set<string>;
  /** U26: сортировка таблицы «Закупка на поход» */
  sortSpec: { field: ShoppingSortField; dir: SortDir };
}

/**
 * Полный набор view-моделей страницы похода. Компоненты вкладок получают
 * отсюда готовые данные (props-driven, без дублирования state — критерий
 * подзадачи 26).
 */
export function deriveTripView(input: TripViewInput) {
  const {
    trip, recipes, tripRecipes, recipesMap, tripEdits, prices, manualItems,
    products, draftOverrides, shoppingExcluded, checklistBought, sortSpec,
  } = input;

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

  const visibleShopping = shoppingList.map(i => ({ ...i, excluded: i.excluded || shoppingExcluded.has(i.ingredientId) }));
  const includedShoppingFinal = visibleShopping.filter(i => !i.excluded);
  const shoppingTotalFinal = includedShoppingFinal.reduce((a, i) => a + (i.effectiveCost || 0), 0);

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

  // Fix-3 (п.2): сквозной статус «меню → закупка → чеки».
  // Fix-5 (п.9): отметка «взято» привязана к позиции И её количеству:
  // добавил ещё 100 г к купленному продукту — галочка слетает, позицию надо
  // переподтвердить (ключ '<id>@<нужно, граммы/шт с точностью 3 знака>').
  // Подзадача 6: ключ отметки считает общая утилита (тот же формат, что и в ChecklistTab)
  const checklistRowIds = collectChecklistKeys(checklist);
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

  return {
    effectiveRecipesMap,
    menuByDays,
    manualPriceOf,
    visibleShopping,
    includedShoppingFinal,
    shoppingTotalFinal,
    totalCostFinal,
    dayShopping,
    realPeople,
    tripSummary,
    personSummary,
    sortedShopping,
    productInfo,
    manualProductOptions,
    checklist,
    checklistRowIds,
    boughtInList,
    factsTotal,
    factCount,
    readiness,
  };
}

export type TripView = ReturnType<typeof deriveTripView>;
