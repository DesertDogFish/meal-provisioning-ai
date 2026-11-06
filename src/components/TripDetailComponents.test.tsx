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
  const readiness = tripReadiness({ mealsCount: 2, checklistTotal: 2, boughtCount: 2, factCount: 2, checksTotal: 2, menuApproved: true }); // redesign п.4

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
    expect(screen.getByText(/Проверка: 2 позиции/)).toBeTruthy(); // redesign п.1: чип этапа ②
    expect(screen.getByText(/Магазин: взято 2 из 2/)).toBeTruthy();
    expect(screen.getByText(/Чеки: введено 2 из 2/)).toBeTruthy(); // redesign п.7: ④ «Чеки»
    expect(screen.getByText('Поход готов ✓')).toBeTruthy();
    // bugs-trip-shopping-stage п.7: кнопка отчёта — яркая рыжая иконка без текста
    const reportBtn = screen.getByLabelText('Отчёт');
    expect(reportBtn.textContent).toBe('');
    expect(reportBtn.getAttribute('title')).toBe('Сформировать отчёт (печать/PDF)');
    expect(reportBtn.className).toContain('icon-action');
    fireEvent.click(reportBtn);
    expect(open).toHaveBeenCalledWith('/trips/t1/print', '_blank');
  });

  it('transparency-п.2: с onStage чипы — кнопки переключения этапов (клик = этап)', () => {
    const view = deriveTripView(viewInput());
    const onStage = vi.fn();
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={readiness} boughtInList={2} checklistTotal={2} factCount={2} factsTotal={2}
        stage="menu" done={{ menu: true, shopping: true, store: true, checks: true, ready: true }}
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

  it('не готов: бейджа готовности нет, «Посмотреть отчёт» есть', () => {
    const view = deriveTripView(viewInput());
    const notReady = tripReadiness({ mealsCount: 2, checklistTotal: 2, boughtCount: 0, factCount: 0, checksTotal: 2, menuApproved: true }); // redesign п.4
    render(
      <TripSummaryPanel
        trip={trip} tripSummary={view.tripSummary} realPeople={view.realPeople}
        readiness={notReady} boughtInList={0} checklistTotal={2} factCount={0} factsTotal={2}
      />
    );
    // UX-список владельца п.20: отдельного статуса «В процессе» больше нет
expect(screen.queryByText('В процессе')).toBeNull();
    expect(screen.getByText(/Меню собрано/)).toBeTruthy();
    // п.7: иконочная кнопка отчёта — aria-label «Отчёт», смысл — в title
    expect(screen.getByLabelText('Отчёт').getAttribute('title')).toBe('Посмотреть отчёт (печать/PDF)');
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

  // bugs-trip-menu-stage п.5: на мобильном чипы ингредиентов — «простыня»;
  // контейнер скрыт до md (состав виден тапом на блюдо — RecipeViewSheet)
  it('контейнер чипов ингредиентов скрыт на mobile (hidden md:flex)', () => {
    render(
      <TripMealCard meal={meal} tripMeal={{ id: 'm9', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'r9', sortOrder: 1 }}
        onOpenComposition={vi.fn()} onDelete={vi.fn()} />
    );
    const container = screen.getByText(/Соль/).closest('div')!;
    expect(container.className).toContain('hidden');
    expect(container.className).toContain('md:flex');
  });

  // bugs-app-ui п.5: иконки действий карточки приёма — рыжие (.icon-action),
  // без инлайнового цвета и JS-ховеров
  it('иконки «Состав»/«Удалить» — класс .icon-action без инлайнового цвета', () => {
    render(
      <TripMealCard meal={meal} tripMeal={{ id: 'm9', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'r9', sortOrder: 1 }}
        onOpenComposition={vi.fn()} onDelete={vi.fn()} />
    );
    const compBtn = screen.getByLabelText('Состав приёма: Обед');
    const del = screen.getByLabelText('Удалить приём пищи: Обед');
    expect(compBtn.className).toContain('icon-action');
    expect(del.className).toContain('icon-action');
    expect(compBtn.style.color).toBe('');
    expect(del.style.color).toBe('');
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

  // UX-осмотр 31.10 (п.1): подпись дня была хардкодом «2 приёмов пищи».
  it('подзаголовок дня: плюрализация «N приёмов пищи» (1/2/5)', () => {
    setup();
    expect(screen.getByText('1 приём пищи • 3 чел.')).toBeTruthy();
    const two = { ...trip, days: [{ ...trip.days![0], meals: [
      { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST' as MealType, recipeId: 'r1', sortOrder: 1 },
      { id: 'm3', tripDayId: 'd1', mealType: 'LUNCH' as MealType, recipeId: 'r2', sortOrder: 2 },
    ] }] };
    const view2 = deriveTripView(viewInput({ trip: two }));
    render(<TripDaysList
      menuByDays={view2.menuByDays}
      trip={two}
      manualItems={[]}
      expandedDays={new Set<string>()}
      editingDay={null}
      dayPeopleOverride=""
      onToggleDay={vi.fn()} onStartEditDay={vi.fn()} onDayPeopleChange={vi.fn()}
      onSaveDayPeople={vi.fn()} onCancelEditDay={vi.fn()} onAddDayProduct={vi.fn()}
      onAddMeal={vi.fn()} onOpenComposition={vi.fn()} onDeleteMeal={vi.fn()}
      onDeleteManual={vi.fn()} onAddTripProduct={vi.fn()}
    />);
    expect(screen.getByText('2 приёма пищи • 3 чел.')).toBeTruthy();
    expect(screen.queryByText(/2 приёмов пищи/)).toBeNull();
  });

  // UX-осмотр 31.10 (п.6): иконочные кнопки дня («Изменить количество людей»,
  // «Добавить приём пищи») несли только title — скринридер объявлял «button».
  it('a11y: probe кнопок без accessible name = 0, иконки дня продублированы aria-label', () => {
    setup({ expandedDays: new Set(['d1']) });
    expect(screen.getAllByLabelText('Изменить количество людей').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Добавить приём пищи').length).toBeGreaterThan(0);
    expect(namelessButtons(document)).toEqual([]);
  });

  // bugs-trip-menu-stage пп.1–2: заголовок карточки «на поход» по состоянию,
  // пояснение про ручные позиции — в InfoTip, не в тексте карточки.
  it('карточка к походу: без позиций — «Добавить продукты и товары…», с позицией — «Продукты и товары»', () => {
    setup({ manualItems: [...manualDay] }); // trip-позиций нет
    expect(screen.getByText('Добавить продукты и товары…')).toBeTruthy();
    cleanup();
    setup(); // manualTrip — одна trip-позиция (Аптечка)
    expect(screen.getByText('Продукты и товары')).toBeTruthy();
    expect(screen.getByText(/· 1 поз\./)).toBeTruthy();
  });

  it('пояснение «Ручные позиции: аптечка…» убрано в InfoTip (под заголовком его нет)', () => {
    setup();
    expect(screen.queryByText(/Ручные позиции: аптечка, антисептик, топливо…/)).toBeNull();
    expect(screen.getByLabelText('Что добавляют к походу')).toBeTruthy();
  });

  it('кнопки дня: продукт к дню, приём пищи (контекст §2.1)', () => {
    const p = setup();
    // bugs-trip-menu-stage п.3: «Добавить продукт или товар» вместо «продукт к дню (не блюдо)»
    expect(screen.getAllByTitle('Добавить продукт или товар')[0]).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText('Добавить продукт или товар')[0]);
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
    // bugs-app-ui п.5: крестик чипа — .icon-action, без инлайнового серого
    const chipX = screen.getByLabelText('Удалить позицию: Антисептик');
    expect(chipX.classList.contains('icon-action')).toBe(true);
    expect(chipX.getAttribute('style') ?? '').not.toContain('muted');
    fireEvent.click(chipX);
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
    expect(screen.getByText('Продукты и товары')).toBeTruthy();
    expect(screen.getByText(/Аптечка/)).toBeTruthy();
    expect(screen.getByText(/· 1 поз\./)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Добавить продукт или товар (на весь поход)'));
    expect(p.onAddTripProduct).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText('Удалить позицию: Аптечка'));
    expect(p.onDeleteManual).toHaveBeenCalledWith('mm1', 'Аптечка');
  });
});

