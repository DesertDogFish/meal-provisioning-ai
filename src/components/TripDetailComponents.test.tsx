/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TripActions from './TripActions';
import TripSummaryPanel from './TripSummaryPanel';
import TripMealCard from './TripMealCard';
import TripDaysList from './TripDaysList';
import TripShoppingTab from './TripShoppingTab';
import TripDayShoppingTab from './TripDayShoppingTab';
import TripPersonTab from './TripPersonTab';
import ChecklistTab from './ChecklistTab';
import ExclusionCheckbox from './ExclusionCheckbox';
import { deriveTripView, type TripViewInput } from '../utils/tripDerived';
import { tripReadiness } from '../utils/readiness';
import type { MealType, UnitOfMeasure } from '../types';
import type { Trip, Recipe, Price } from '../types/tripDetail';
import type { TripManualItem } from '../api/tripManualItems';

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

describe('TripActions', () => {
  it('шапка: название, даты, люди; «назад» — колбэк', () => {
    const onBack = vi.fn();
    render(<TripActions trip={trip} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'Тестовый поход' })).toBeTruthy();
    expect(screen.getByText(/01\.07\.2026.*02\.07\.2026.*2 чел\./)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Назад к походам'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('TripSummaryPanel', () => {
  const readiness = tripReadiness({ mealsCount: 2, checklistTotal: 2, boughtCount: 2, factCount: 2, checksTotal: 2 });

  it('KPI-карточки и шаги готовности; отчёт открывается в новой вкладке', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const view = deriveTripView(viewInput());
    render(
      <TripSummaryPanel
        trip={trip}
        tripSummary={view.tripSummary}
        realPeople={view.realPeople}
        readiness={readiness}
        boughtInList={2}
        checklistTotal={2}
        factCount={2}
        factsTotal={2}
      />
    );
    expect(screen.getByText('Дней')).toBeTruthy();
    expect(screen.getByText('Приёмов пищи')).toBeTruthy();
    // день1 (3 чел.): 1.5 кг × 100 ₽ = 150; день2 (2 чел.): 2 шт × 50 ₽ = 100 → 250 ₽
    expect(screen.getAllByText(/250/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Меню собрано/)).toBeTruthy();
    // transparency-п.1: чипы = этапы ①②③④ одним словарём (STAGES)
    expect(screen.getByText(/Закупка: 2 позиции/)).toBeTruthy();
    expect(screen.getByText(/Магазин: взято 2 из 2/)).toBeTruthy();
    expect(screen.getByText(/Чек: введено 2 из 2/)).toBeTruthy();
    expect(screen.getByText('Поход готов ✓')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Сформировать отчёт'));
    expect(open).toHaveBeenCalledWith('/trips/t1/print', '_blank');
  });

  it('transparency-п.2: с onStage чипы — кнопки переключения этапов (клик = этап)', () => {
    const view = deriveTripView(viewInput());
    const onStage = vi.fn();
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={readiness} boughtInList={2} checklistTotal={2} factCount={2} factsTotal={2}
        stage="menu" done={{ menu: true, shopping: true, store: true, checks: true }}
        onStage={onStage}
      />
    );
    const chip = screen.getAllByTestId('stage-chip-store')[0];
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.textContent).toContain('Магазин: взято 2 из 2');
    fireEvent.click(chip);
    expect(onStage).toHaveBeenCalledWith('store');
    // активный этап отмечен aria-current
    expect(screen.getAllByTestId('stage-chip-menu')[0].getAttribute('aria-current')).toBe('step');
  });

  it('transparency-п.2: без onStage чипы статичны (мобильный sheet/печать не ломаются)', () => {
    const view = deriveTripView(viewInput());
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={readiness} boughtInList={2} checklistTotal={2} factCount={2} factsTotal={2}
      />
    );
    expect(screen.queryAllByTestId('stage-chip-store')).toHaveLength(0);
    expect(screen.getByText(/Магазин: взято 2 из 2/)).toBeTruthy();
  });

  it('не готов: «В процессе» и «Посмотреть отчёт»', () => {
    const view = deriveTripView(viewInput());
    const notReady = tripReadiness({ mealsCount: 2, checklistTotal: 2, boughtCount: 0, factCount: 0, checksTotal: 2 });
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={notReady} boughtInList={0} checklistTotal={2} factCount={0} factsTotal={2}
      />
    );
    expect(screen.getByText('В процессе')).toBeTruthy();
    expect(screen.getByText(/Меню собрано/)).toBeTruthy();
    expect(screen.getByLabelText('Посмотреть отчёт')).toBeTruthy();
    // пустое меню
    const emptyMenu = tripReadiness({ mealsCount: 0, checklistTotal: 0, boughtCount: 0, factCount: 0, checksTotal: 0 });
    render(
      <TripSummaryPanel
        trip={{ ...trip, days: [] }} tripSummary={view.tripSummary} realPeople={2}
        readiness={emptyMenu} boughtInList={0} checklistTotal={0} factCount={0} factsTotal={0}
      />
    );
    expect(screen.getByText(/Меню пустое/)).toBeTruthy();
  });
});

describe('TripMealCard', () => {
  const meal = {
    mealType: 'LUNCH' as MealType,
    recipeName: 'Обед',
    servings: 3,
    ingredients: [
      { name: 'Соль', amount: 1, unit: 'PCS' as UnitOfMeasure },
      { name: 'Имбирь', amount: 2, unit: 'PCS' as UnitOfMeasure, added: true },
      { name: 'Масло', amount: 1, unit: 'PCS' as UnitOfMeasure, substitutedFrom: 'Маргарин' },
    ],
  };

  it('бейдж приёма, порции, чипы ингредиентов (+добавлено, замена), колбэки', () => {
    const onOpenComposition = vi.fn();
    const onDelete = vi.fn();
    render(
      <TripMealCard
        meal={meal}
        tripMeal={{ id: 'm9', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'r9', sortOrder: 1 }}
        onOpenComposition={onOpenComposition}
        onDelete={onDelete}
      />
    );
    expect(screen.getByText('Обед', { selector: '.badge-meal-lunch' })).toBeTruthy();
    expect(screen.getAllByText('Обед')).toHaveLength(2); // бейдж + название
    expect(screen.getByText(/3 порц|3 порции|\(3 /)).toBeTruthy();
    expect(screen.getByText(/Соль/)).toBeTruthy();
    const ginger = screen.getByText(/Имбирь/);
    expect(ginger.textContent).toContain('+ ');
    expect(ginger.getAttribute('title')).toBe('Добавлено в походе');
    const butter = screen.getByText(/Масло/);
    expect(butter.textContent).toContain('← Маргарин');
    expect(butter.getAttribute('title')).toBe('Замена: Маргарин → Масло');

    fireEvent.mouseEnter(screen.getByLabelText('Состав приёма: Обед'));
    fireEvent.mouseLeave(screen.getByLabelText('Состав приёма: Обед'));
    fireEvent.click(screen.getByLabelText('Состав приёма: Обед'));
    expect(onOpenComposition).toHaveBeenCalledWith('m9');
    fireEvent.mouseEnter(screen.getByLabelText('Удалить приём пищи: Обед'));
    fireEvent.mouseLeave(screen.getByLabelText('Удалить приём пищи: Обед'));
    fireEvent.click(screen.getByLabelText('Удалить приём пищи: Обед'));
    expect(onDelete).toHaveBeenCalledWith('m9', 'Обед');
  });

  it('без tripMeal кнопки состава неактивны, удаление не срабатывает', () => {
    const onOpenComposition = vi.fn();
    const onDelete = vi.fn();
    render(
      <TripMealCard meal={{ ...meal, ingredients: [] }} tripMeal={null}
        onOpenComposition={onOpenComposition} onDelete={onDelete} />
    );
    const comp = screen.getByLabelText('Состав приёма: Обед') as HTMLButtonElement;
    expect(comp.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Удалить приём пищи: Обед'));
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('ExclusionCheckbox', () => {
  it('глобальный: включён → «Исключить из расчёта», клик даёт ключ', () => {
    const onToggle = vi.fn();
    render(<ExclusionCheckbox ingredientId="i1" excluded={new Set()} onToggle={onToggle} />);
    const cb = screen.getByLabelText('Исключить из расчёта') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(onToggle).toHaveBeenCalledWith('i1');
  });

  it('исключён → «Включить в расчёт», снят', () => {
    render(<ExclusionCheckbox ingredientId="i1" excluded={new Set(['i1'])} onToggle={vi.fn()} />);
    const cb = screen.getByLabelText('Включить в расчёт') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('дневной: составной ключ `дата::id`; глобальное исключение гасит день', () => {
    const onToggle = vi.fn();
    render(<ExclusionCheckbox ingredientId="i1" dayDate="2026-07-01" excluded={new Set()} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('Исключить из этого дня'));
    expect(onToggle).toHaveBeenCalledWith('2026-07-01::i1');
    render(<ExclusionCheckbox ingredientId="i2" dayDate="2026-07-01" excluded={new Set(['i2'])} onToggle={vi.fn()} />);
    const off = screen.getByLabelText('Включить в расчёт') as HTMLInputElement;
    expect(off.checked).toBe(false);
  });
});

describe('TripDaysList', () => {
  function setup(over: Partial<Parameters<typeof TripDaysList>[0]> = {}) {
    const view = deriveTripView(viewInput({ manualItems: [...manualDay, ...manualTrip] }));
    const props = {
      menuByDays: view.menuByDays,
      trip,
      manualItems: [...manualDay, ...manualTrip],
      expandedDays: new Set<string>(),
      editingDay: null,
      dayPeopleOverride: '',
      onToggleDay: vi.fn(),
      onStartEditDay: vi.fn(),
      onDayPeopleChange: vi.fn(),
      onSaveDayPeople: vi.fn(),
      onCancelEditDay: vi.fn(),
      onAddDayProduct: vi.fn(),
      onAddMeal: vi.fn(),
      onOpenComposition: vi.fn(),
      onDeleteMeal: vi.fn(),
      onDeleteManual: vi.fn(),
      onAddTripProduct: vi.fn(),
      ...over,
    };
    render(<TripDaysList {...props} />);
    return props;
  }

  it('день свёрнут: заголовок, бейдж override, кнопка «людей» начинает редактирование', () => {
    const p = setup();
    expect(screen.getByText(/1 июля/)).toBeTruthy();
    expect(screen.getByText('3 чел.')).toBeTruthy(); // peopleOverride дня 1
    const header = screen.getByText(/1 июля/).closest('div.cursor-pointer') as HTMLElement;
    fireEvent.mouseEnter(header);
    fireEvent.mouseLeave(header);
    fireEvent.click(header);
    expect(p.onToggleDay).toHaveBeenCalledWith('d1');
    fireEvent.click(screen.getAllByTitle('Изменить количество людей')[0]);
    expect(p.onStartEditDay).toHaveBeenCalledWith('d1', '3');
  });

  it('кнопки дня: продукт к дню, приём пищи (контекст §2.1)', () => {
    const p = setup();
    fireEvent.click(screen.getAllByLabelText('Добавить продукт к дню')[0]);
    expect(p.onAddDayProduct).toHaveBeenCalledWith('d1', expect.stringMatching(/1 июля/));
    fireEvent.click(screen.getAllByTitle('Добавить приём пищи')[0]);
    expect(p.onAddMeal).toHaveBeenCalledWith({ dayId: 'd1', dayDate: '2026-07-01', dayIndex: 1 });
  });

  it('раскрытый день: карточки приёмов, состав/удаление, ручные позиции дня', () => {
    const p = setup({ expandedDays: new Set(['d1']) });
    expect(screen.getByText('Каша')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Состав приёма: Каша'));
    expect(p.onOpenComposition).toHaveBeenCalledWith('d1', 'm1');
    fireEvent.click(screen.getByLabelText('Удалить приём пищи: Каша'));
    expect(p.onDeleteMeal).toHaveBeenCalledWith('d1', 'm1', 'Каша', '2026-07-01');
    // чип ручной позиции дня + удаление
    expect(screen.getByText(/Антисептик/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Удалить позицию: Антисептик'));
    expect(p.onDeleteManual).toHaveBeenCalledWith('mm2', 'Антисептик');
  });

  it('редактор «людей на день»: ввод, OK, отмена', () => {
    const p = setup({ editingDay: 'd1', dayPeopleOverride: '4' });
    const input = screen.getByPlaceholderText('2') as HTMLInputElement;
    expect(input.value).toBe('4');
    fireEvent.change(input, { target: { value: '5' } });
    expect(p.onDayPeopleChange).toHaveBeenCalledWith('5');
    fireEvent.click(screen.getByLabelText('Сохранить количество людей'));
    expect(p.onSaveDayPeople).toHaveBeenCalledWith('d1');
    fireEvent.click(screen.getByLabelText('Отмена'));
    expect(p.onCancelEditDay).toHaveBeenCalledTimes(1);
  });

  it('день без приёмов: подсказка; карточка «На весь поход» с чипами', () => {
    const p = setup({
      menuByDays: [{ dayDate: '2026-07-01', effectivePeople: 2, meals: [] }],
      trip: { ...trip, days: [trip.days![0]] },
      expandedDays: new Set(['d1']),
    });
    expect(screen.getByText('Нет приёмов пищи. Нажмите + чтобы добавить.')).toBeTruthy();
    expect(screen.getByText('На весь поход')).toBeTruthy();
    expect(screen.getByText(/Аптечка/)).toBeTruthy();
    expect(screen.getByText(/· 1 поз\./)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Добавить продукт к походу'));
    expect(p.onAddTripProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Удалить позицию: Аптечка'));
    expect(p.onDeleteManual).toHaveBeenCalledWith('mm1', 'Аптечка');
  });
});

describe('TripShoppingTab', () => {
  function setup(over: Partial<TripViewInput> = {}) {
    const view = deriveTripView(viewInput(over));
    const props = {
      rows: view.sortedShopping,
      sortSpec: { field: 'ingredientName' as const, dir: 'asc' as const },
      onSortField: vi.fn(),
      total: view.shoppingTotalFinal,
      excludedCount: over.shoppingExcluded?.size ?? 0,
      hasMissingPrices: view.tripSummary.hasMissingPrices,
      missingIngredients: view.tripSummary.missingIngredients,
      excluded: over.shoppingExcluded ?? new Set<string>(),
      onToggleExcluded: vi.fn(),
    };
    render(<TripShoppingTab {...props} />);
    return { props, view };
  }

  it('шапка с итогом, сортируемые заголовки, строки', () => {
    const { props } = setup();
    expect(screen.getByText('Закупка на поход')).toBeTruthy();
    expect(screen.getByText(/Итого:/)).toBeTruthy();
    expect(screen.getByText(/позиций: 2/)).toBeTruthy();
    expect(screen.getByText('Гречка')).toBeTruthy();
    // aria-sort только у активной колонки
    expect(screen.getByRole('columnheader', { name: /Продукт/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: /Количество/ }).getAttribute('aria-sort')).toBe('none');
    fireEvent.click(screen.getByLabelText('Сортировать по: Стоимость'));
    expect(props.onSortField).toHaveBeenCalledWith('effectiveCost');
  });

  it('«нет цен» в подзаголовке; исключённая строка зачёркнута; ✓ чек', () => {
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
        total={noPrice.shoppingTotalFinal}
        excludedCount={0}
        hasMissingPrices={noPrice.tripSummary.hasMissingPrices}
        missingIngredients={noPrice.tripSummary.missingIngredients}
        excluded={new Set()}
        onToggleExcluded={vi.fn()}
      />
    );
    expect(screen.getByText(/нет цен: Без цены/)).toBeTruthy();
    expect(screen.getByText('нет цены')).toBeTruthy();
  });

  it('факт-цена из чека: бейдж «✓ чек»; исключение — чекбокс «Включить в расчёт»', () => {
    setup({
      draftOverrides: { i1: { price: 90, total: 0 } },
      shoppingExcluded: new Set(['i2']),
    });
    expect(screen.getByTitle('По введённому чеку').textContent).toBe('✓ чек');
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
    expect(screen.getByText('Закупка по дням')).toBeTruthy();
    expect(screen.getByText(/Итого за поход:/)).toBeTruthy();
    expect(screen.getByText('есть без цены')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy(); // без цены — прочерк
    expect(screen.getAllByLabelText('Исключить из этого дня')).toHaveLength(2);
  });

  it('позиции «На весь поход»: сумма по trip-ценам, прочерк без цены', () => {
    const { props } = setup([...manualTrip, ...manualDay], [
      ...prices,
      { id: 'p9', ingredientId: 'i9', pricePerUnit: 200, currency: 'RUB', effectiveFrom: '2026-06-01' },
    ]);
    expect(screen.getByText('На весь поход')).toBeTruthy();
    expect(screen.getByText(/Аптечка · малая/)).toBeTruthy();
    expect(screen.getAllByText(/200/).length).toBeGreaterThan(0);
    // дневная позиция в карточке дня
    expect(screen.getByText('Антисептик')).toBeTruthy();
    expect(props.priceOf('i9')).toBe(200);
  });
});

describe('TripPersonTab', () => {
  it('сводка (5 плиток) и таблица продуктов на человека', () => {
    const view = deriveTripView(viewInput());
    render(
      <TripPersonTab trip={trip} realPeople={view.realPeople}
        tripSummary={view.tripSummary} personSummary={view.personSummary} />
    );
    expect(screen.getAllByText('На человека').length).toBeGreaterThan(0);
    expect(screen.getByText('Приёмов пищи всего')).toBeTruthy();
    expect(screen.getByText('Людей в походе')).toBeTruthy();
    expect(screen.getByText('На человека за поход')).toBeTruthy();
    expect(screen.getByText('На человека за приём')).toBeTruthy();
    expect(screen.getByText('Калории за приём')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy(); // калорий нет (нет kcalPer100g)
    expect(screen.getByText('Продукты на человека')).toBeTruthy();
    expect(screen.getByText('Гречка')).toBeTruthy();
    expect(screen.getByText('Тушёнка')).toBeTruthy();
    // стоимость на человека: 100 ₽ / 2.5 чел.
    expect(screen.getAllByText(/40/).length).toBeGreaterThan(0);
  });

  it('калории за приём — числом, когда есть ккал-данные', () => {
    const kcalRecipes: Recipe[] = [{ id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
      { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG', kcalPer100g: 340 } },
    ] }];
    const view = deriveTripView(viewInput({
      recipes: kcalRecipes,
      recipesMap: new Map(kcalRecipes.map(r => [r.id, r])),
      trip: { ...trip, days: [trip.days![0]] },
    }));
    render(
      <TripPersonTab trip={{ ...trip, days: [trip.days![0]] }} realPeople={view.realPeople}
        tripSummary={view.tripSummary} personSummary={view.personSummary} />
    );
    expect(screen.getByText(/ккал/)).toBeTruthy();
  });
});

/** Navigation-п.3: пустые состояния этапов ②/③ с CTA «К меню ①» */
describe('Empty-state этапов (navigation-п.3)', () => {
  it('② «Суммарно»: нет строк → empty-state + CTA «К меню ①»', () => {
    const onGoToMenu = vi.fn();
    render(
      <TripShoppingTab rows={[]} sortSpec={{ field: 'ingredientName', dir: 'asc' }}
        onSortField={vi.fn()} total={0} excludedCount={0} hasMissingPrices={false}
        missingIngredients={[]} excluded={new Set()} onToggleExcluded={vi.fn()}
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

  it('② «На человека»: нет продуктов → empty-state + CTA', () => {
    const onGoToMenu = vi.fn();
    const view = deriveTripView(viewInput({ trip: { ...trip, days: [] }, recipes: [], recipesMap: new Map() }));
    render(
      <TripPersonTab trip={{ ...trip, days: [] }} realPeople={view.realPeople}
        tripSummary={view.tripSummary} personSummary={[]} onGoToMenu={onGoToMenu} />
    );
    expect(screen.getByTestId('person-empty')).toBeTruthy();
    fireEvent.click(screen.getByTestId('person-empty-cta'));
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
