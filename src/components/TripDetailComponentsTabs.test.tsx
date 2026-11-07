/// <reference types="vitest/globals" />
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { deriveTripView, type TripViewInput } from '../utils/tripDerived';
import { namelessButtons } from '../test/a11y';
import { tripReadiness } from '../utils/readiness';
import type { MealType, UnitOfMeasure } from '../types';
import type { Trip, Recipe, Price } from '../types/tripDetail';
import type { TripManualItem } from '../api/tripManualItems';

import TripActions from './TripActions';
import TripSummaryPanel from './TripSummaryPanel';
import TripMealCard from './TripMealCard';
import TripDaysList from './TripDaysList';
import TripShoppingTab from './TripShoppingTab';
import TripDayShoppingTab from './TripDayShoppingTab';
import ChecklistTab from './ChecklistTab';
import ExclusionCheckbox from './ExclusionCheckbox';

/**
 * Подзадача 26 аудита (2026-10-29): компоненты, вынесенные из TripDetailPage.
 * Все презентационные (props-driven) — тесты проверяют рендер и колбэки.
 * Данные — реальные view-модели `deriveTripView` (интеграция с расчётами).
 */

const trip: Trip = {
  id: 't1', userId: 'u1', name: 'Тестовый поход',
  startDate: '2026-07-01', endDate: '2026-07-02', defaultPeople: 2,
  days: [
    { id: 'd1', tripId: 't1', dayDate: '2026-07-01', peopleOverride: 3, meals: [
      { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r1', sortOrder: 1 },
    ] },
    { id: 'd2', tripId: 't1', dayDate: '2026-07-02', meals: [
      { id: 'm2', tripDayId: 'd2', mealType: 'DINNER', recipeId: 'r2', sortOrder: 1 },
    ] },
  ],
};

const recipes: Recipe[] = [
  { id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
    { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG' } },
  ] },
  { id: 'r2', name: 'Рагу', mealType: 'DINNER', baseServings: 2, ingredients: [
    { ingredientId: 'i2', amount: 2, ingredient: { id: 'i2', name: 'Тушёнка', unit: 'PCS' } },
  ] },
];

const prices: Price[] = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
  { id: 'p2', ingredientId: 'i2', pricePerUnit: 50, currency: 'RUB', effectiveFrom: '2026-06-01' },
];

function viewInput(over: Partial<TripViewInput> = {}): TripViewInput {
  return {
    trip, recipes, tripRecipes: [],
    recipesMap: new Map(recipes.map(r => [r.id, r])),
    tripEdits: [], prices, manualItems: [], products: [],
    draftOverrides: {}, shoppingExcluded: new Set<string>(),
    checklistBought: new Set<string>(),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
    ...over,
  };
}

const manualTrip: TripManualItem[] = [
  { id: 'mm1', tripId: 't1', dayId: null, ingredientId: 'i9', ingredientName: 'Аптечка', unit: 'PCS', amount: 1, note: 'малая' },
];
const manualDay: TripManualItem[] = [
  { id: 'mm2', tripId: 't1', dayId: 'd1', ingredientId: 'i8', ingredientName: 'Антисептик', unit: 'PCS', amount: 2 },
];

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TripShoppingTab', () => {
  function setup(over: Partial<TripViewInput> = {}) {
    const view = deriveTripView(viewInput(over));
    const props = {
      rows: view.sortedShopping,
      sortSpec: { field: 'ingredientName' as const, dir: 'asc' as const },
      onSortField: vi.fn(),
      excluded: over.shoppingExcluded ?? new Set<string>(),
      onToggleExcluded: vi.fn(),
    };
    render(<TripShoppingTab {...props} />);
    return { props, view };
  }

  // bugs-trip-shopping-stage пп.1–2: «Предварительная закупка» без пугающих
  // итогов в шапке + подсказка про исключение «уже есть дома»
  it('заголовок «Предварительная закупка», в шапке нет «Итого» и «нет цен», есть InfoTip про исключение', () => {
    const { props } = setup();
    expect(screen.getByText('Предварительная закупка')).toBeTruthy();
    expect(screen.queryByText(/Итого:/)).toBeNull();
    expect(screen.queryByText(/нет цен/)).toBeNull();
    expect(screen.getByText(/позиций: 2/)).toBeTruthy();
    expect(screen.getByLabelText('Про исключение позиций')).toBeTruthy();
    expect(screen.getByText('Гречка')).toBeTruthy();
    // aria-sort только у активной колонки
    expect(screen.getByRole('columnheader', { name: /Продукт/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: /Количество/ }).getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByLabelText('Сортировать по: Стоимость'));
    expect(props.onSortField).toHaveBeenCalledWith('effectiveCost');
  });

  it('позиция без цены: «нет цены» остаётся в строке таблицы (не в шапке); исключённая строка зачёркнута; ✓ чек', () => {
    const noPrice = deriveTripView(viewInput({
      recipes: [{ id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
        { ingredientId: 'i3', amount: 1, ingredient: { id: 'i3', name: 'Без цены', unit: 'PCS' } },
      ] }],
      recipesMap: new Map([['r1', { id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
        { ingredientId: 'i3', amount: 1, ingredient: { id: 'i3', name: 'Без цены', unit: 'PCS' } },
      ] }]]),
      trip: { ...trip, days: [trip.days![0]] },
    }));
    render(
      <TripShoppingTab
        rows={noPrice.sortedShopping}
        sortSpec={{ field: 'ingredientName', dir: 'asc' }}
        onSortField={vi.fn()}
        excluded={new Set()}
        onToggleExcluded={vi.fn()}
      />
    );
    // п.1: предупреждение «⚠️ нет цен: …» из шапки убрано
    expect(screen.queryByText(/нет цен: Без цены/)).toBeNull();
    expect(screen.getByText('нет цены')).toBeTruthy();
  });

  it('факт-цена из чека: бейдж «✓ чек»; исключение — чекбокс «Включить в расчёт»', () => {
    setup({
      draftOverrides: { i1: { price: 90, total: 0 } },
      shoppingExcluded: new Set(['i2']),
    });
    expect(screen.getByTitle('По введённому чеку').textContent).toBe('✓ чек');
    // BL-10: рядом с бейджем — цена за единицу с подписью «₽/кг»
    expect(screen.getByTestId('shopping-unit-price-i1').textContent).toBe(`90,00\u00A0₽/кг`);
    expect(screen.getByLabelText('Включить в расчёт')).toBeTruthy();
    expect(screen.getByText('Тушёнка').style.textDecoration).toBe('line-through');
  });
});

describe('TripDayShoppingTab', () => {
  function setup(manualItems: TripManualItem[] = [], pricesExtra: Price[] = prices) {
    const view = deriveTripView(viewInput({ manualItems, prices: pricesExtra }));
    const props = {
      dayShopping: view.dayShopping,
      manualItems,
      priceOf: view.manualPriceOf,
      excluded: new Set<string>(),
      onToggleExcluded: vi.fn(),
    };
    render(<TripDayShoppingTab {...props} />);
    return { props, view };
  }

  it('карточки дней: суммы, количество, «есть без цены», чекбоксы дня', () => {
    const noPriceRecipes: Recipe[] = [{ id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
      { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG' } },
      { ingredientId: 'i3', amount: 1, ingredient: { id: 'i3', name: 'Без цены', unit: 'PCS' } },
    ] }];
    const view = deriveTripView(viewInput({
      recipes: noPriceRecipes,
      recipesMap: new Map(noPriceRecipes.map(r => [r.id, r])),
      trip: { ...trip, days: [trip.days![0]] },
    }));
    render(
      <TripDayShoppingTab dayShopping={view.dayShopping} manualItems={[]} priceOf={view.manualPriceOf}
        excluded={new Set()} onToggleExcluded={vi.fn()} />
    );
    // bugs-trip-shopping-stage пп.3–4: новый заголовок + подсказка про исключение
    expect(screen.getByText('Предварительная закупка по дням')).toBeTruthy();
    expect(screen.getByLabelText('Про исключение позиций')).toBeTruthy();
    expect(screen.getByText(/Итого за поход:/)).toBeTruthy();
    expect(screen.getByText('есть без цены')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy(); // без цены — прочерк
    expect(screen.getAllByLabelText('Исключить из этого дня')).toHaveLength(2);
  });

  it('позиции «На весь поход поровну»: сумма по trip-ценам, прочерк без цены', () => {
    const { props } = setup([...manualTrip, ...manualDay], [
      ...prices,
      { id: 'p9', ingredientId: 'i9', pricePerUnit: 200, currency: 'RUB', effectiveFrom: '2026-06-01' },
    ]);
    // bugs-trip-shopping-stage п.6: лейбл карточки ручных позиций — «На весь поход поровну»
    expect(screen.getByText('На весь поход поровну')).toBeTruthy();
    expect(screen.getByText(/Аптечка · малая/)).toBeTruthy();
    expect(screen.getAllByText(/200/).length).toBeGreaterThan(0);
    // дневная позиция в карточке дня
    expect(screen.getByText('Антисептик')).toBeTruthy();
    expect(props.priceOf('i9')).toBe(200);
  });
});

/** Navigation-п.3: пустые состояния этапов ②/③ с CTA «К меню ①» */
describe('Empty-state этапов (navigation-п.3)', () => {
  it('② «Суммарно»: нет строк → empty-state + CTA «К меню ①»', () => {
    const onGoToMenu = vi.fn();
    render(
      <TripShoppingTab rows={[]} sortSpec={{ field: 'ingredientName', dir: 'asc' }}
        onSortField={vi.fn()}
        excluded={new Set()} onToggleExcluded={vi.fn()}
        onGoToMenu={onGoToMenu} />
    );
    expect(screen.getByTestId('shopping-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('shopping-empty-cta'));
    expect(onGoToMenu).toHaveBeenCalledTimes(1);
  });

  it('② «По дням»: нет дней и ручных позиций → empty-state + CTA', () => {
    const onGoToMenu = vi.fn();
    render(
      <TripDayShoppingTab dayShopping={[]} manualItems={[]} priceOf={() => undefined}
        excluded={new Set()} onToggleExcluded={vi.fn()} onGoToMenu={onGoToMenu} />
    );
    expect(screen.getByTestId('day-shopping-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('day-shopping-empty-cta'));
    expect(onGoToMenu).toHaveBeenCalledTimes(1);
  });

  it('③ чеклист: нет позиций → empty-state + CTA «К меню ①»', () => {
    const onGoToMenu = vi.fn();
    render(
      <ChecklistTab groups={[]} bought={new Set()} actualQty={{}} onToggleRow={vi.fn()}
        onCommitActualQty={vi.fn()} onSetAll={vi.fn()} onGoToMenu={onGoToMenu} />
    );
    expect(screen.getByTestId('checklist-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('checklist-empty-cta'));
    expect(onGoToMenu).toHaveBeenCalledTimes(1);
  });
});

/** Navigation-п.5: название блюда в карточке приёма — ссылка на просмотр рецепта */
describe('TripMealCard — ссылка на рецепт (navigation-п.5)', () => {
  const meal = {
    mealType: 'LUNCH' as MealType, recipeName: 'Уха', servings: 2, recipeId: 'r9',
    ingredients: [],
  };

  it('название — кнопка: клик → onViewRecipe(recipeId)', () => {
    const onViewRecipe = vi.fn();
    render(
      <TripMealCard meal={meal}
        tripMeal={{ id: 'm9', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'r9', sortOrder: 1 }}
        onOpenComposition={vi.fn()} onDelete={vi.fn()} onViewRecipe={onViewRecipe} />
    );
    fireEvent.click(screen.getByTestId('meal-recipe-link'));
    expect(onViewRecipe).toHaveBeenCalledWith('r9');
  });

  it('без onViewRecipe название — обычный текст (обратная совместимость)', () => {
    render(
      <TripMealCard meal={meal} tripMeal={null}
        onOpenComposition={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.queryByTestId('meal-recipe-link')).toBeNull();
    expect(screen.getByText('Уха')).toBeTruthy();
  });
});

// trip-workflow-redesign п.7: мобильный drawer сводки — отчёт яркой рыжей
// иконкой (вместо огромной текстовой кнопки), цепочка чипов — keep-pair.
describe('TripSummaryPanel — redesign п.7: sheet-иконка отчёта и чипы', () => {
  const readiness = tripReadiness({ mealsCount: 2, checklistTotal: 2, boughtCount: 2, factCount: 2, checksTotal: 2, menuApproved: true });
  it('в sheet отчёт — иконочная amber-кнопка (aria-label), цепочка чипов keep-pair', () => {
    const view = deriveTripView(viewInput());
    const onOpenReport = vi.fn();
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={readiness} boughtInList={2} checklistTotal={2} factCount={2} factsTotal={2}
        stage="menu" done={{ menu: true, shopping: true, store: true, checks: true, ready: true }}
        onStage={vi.fn()} onOpenReport={onOpenReport}
      />,
    );
    fireEvent.click(screen.getByTestId('trip-strip'));
    const btn = screen.getByTestId('sheet-open-report');
    expect(btn.textContent?.trim()).toBe(''); // иконка без текста
    expect(btn.getAttribute('aria-label')).toBe('Отчёт по походу');
    expect(btn.className).toContain('icon-action');
    fireEvent.click(btn);
    expect(onOpenReport).toHaveBeenCalledTimes(1);
    // цепочка чипов переносится парами «шеврон+чип» (keep-pair), высота единая
    fireEvent.click(screen.getByTestId('trip-strip'));
    const sheet2 = screen.getByTestId('trip-summary-sheet');
    const chain = sheet2.querySelector('.readiness-chain')!;
    expect(chain.querySelector('.keep-pair')).toBeTruthy();
  });

  it('чип ⑤ подписан «Готов»/«Не готов» по новым именам этапов', () => {
    const view = deriveTripView(viewInput());
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={readiness} boughtInList={2} checklistTotal={2} factCount={2} factsTotal={2}
        stage="menu" done={{ menu: true, shopping: true, store: true, checks: true, ready: true }}
        onStage={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('stage-chip-ready')[0].textContent).toContain('Готов');
  });
});
