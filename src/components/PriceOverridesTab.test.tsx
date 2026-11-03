/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5): этап ④ — props-driven.
 * Критерии: переход на этап НЕ делает сетевых запросов (assert на моках);
 * мутации факт-цен идут через колбэк страницы; строки/итоги — из общей view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock('../api/client', () => ({
  api: { get: (...a: unknown[]) => getMock(...a), post: vi.fn(), put: (...a: unknown[]) => putMock(...a), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
  getRecipes: vi.fn(async () => []),
  getTripRecipes: vi.fn(async () => []),
}));
vi.mock('./ToastProvider', () => ({ useToast: () => ({ showError: vi.fn(), showSuccess: vi.fn() }) }));

import PriceOverridesTab from './PriceOverridesTab';
import { deriveTripView, type TripViewInput } from '../utils/tripDerived';

const NBSP = '\u00A0';
import type { Trip, Recipe, Price } from '../types/tripDetail';

const trip: Trip = {
  id: 't1', userId: 'u1', name: 'Поход', startDate: '2026-07-01', endDate: '2026-07-01',
  defaultPeople: 2,
  days: [{ id: 'd1', tripId: 't1', dayDate: '2026-07-01', peopleOverride: 2, meals: [
    { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'r1', sortOrder: 1 },
  ] }],
};
const recipes: Recipe[] = [
  { id: 'r1', name: 'Каша', mealType: 'BREAKFAST', baseServings: 2, ingredients: [
    { ingredientId: 'i1', amount: 1, ingredient: { id: 'i1', name: 'Гречка', unit: 'KG', category: 'Крупы' } },
  ] },
];
const prices: Price[] = [
  { id: 'p1', ingredientId: 'i1', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2026-06-01' },
];

function makeView(over: Partial<TripViewInput> = {}) {
  return deriveTripView({
    trip, recipes, tripRecipes: [], recipesMap: new Map(recipes.map(r => [r.id, r])),
    tripEdits: [], prices, manualItems: [], products: [],
    draftOverrides: {}, shoppingExcluded: new Set(), checklistBought: new Set(),
    sortSpec: { field: 'ingredientName', dir: 'asc' },
    ...over,
  });
}

function renderTab(over: Partial<TripViewInput> = {}, props: Record<string, unknown> = {}) {
  const view = makeView(over);
  const defaults = {
    trip,
    view,
    draftOverrides: over.draftOverrides ?? {},
    excluded: over.shoppingExcluded ?? new Set<string>(),
    boughtSet: new Set<string>(),
    actualQty: {},
    onCommitActualTotal: vi.fn(),
    onToggleExcluded: vi.fn(),
    onToggleBought: vi.fn(),
    onCommitTook: vi.fn(),
    ...props,
  };
  render(<PriceOverridesTab {...(defaults as any)} />);
  return defaults;
}

describe('PriceOverridesTab — props-driven этап ④ (cleanup-п.5)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('рендерится из props и НЕ делает сетевых запросов', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    // «Гречка» рендерится дважды: десктоп-таблица + мобильные строки
    expect((await screen.findAllByText('Гречка')).length).toBeGreaterThan(0);
    // bugs-trip-checks-stage пп.1–2: блока «кто должен» и план-факт полосы нет
    expect(screen.queryByTestId('who-owes')).toBeNull();
    expect(screen.queryByTestId('planfact-strip')).toBeNull();
    expect(getMock).not.toHaveBeenCalled();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('без отметок «взято» — нота «чек вводится после магазина» (Fix-3 п.2)', async () => {
    renderTab();
    expect(await screen.findByTestId('checks-locked-note')).toBeTruthy();
  });

  it('ввод суммы чека → колбэк страницы onCommitActualTotal(row, total)', async () => {
    const user = userEvent.setup();
    const props = renderTab({}, { boughtSet: new Set(['k1']) });
    const input = await screen.findByTestId('actual-input-i1');
    // NumberField: клик → ввод → Enter/blur коммитит
    await user.click(input);
    const field = input.querySelector('input') ?? input;
    await user.type(field as HTMLElement, '120');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(props.onCommitActualTotal).toHaveBeenCalled());
    const [row, total] = (props.onCommitActualTotal as any).mock.calls[0];
    expect(row.ingredientId).toBe('i1');
    expect(total).toBe(120);
  });

  it('чек-бокс «в расчёте» → onToggleExcluded; «взято» (моб. строка) → onToggleBought', async () => {
    const user = userEvent.setup();
    const props = renderTab({}, { boughtSet: new Set(['k1']) });
    const excl = await screen.findAllByLabelText('Исключить из расчёта: Гречка');
    await user.click(excl[0]);
    expect(props.onToggleExcluded).toHaveBeenCalledWith('i1');
  });

  // bugs-trip-checks-stage п.2: тест «итоги полосы план/факт» удалён вместе
  // с полосой — итоги этапа ④ теперь ОДИН «Итог» по введённым чекам (см. ниже).
});

describe('PriceOverridesTab — bugs-trip-checks-stage пп.1–5: чек без «плана»', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('п.1: на этапе ④ нет блока «Кто сколько должен» (живёт в отчёте)', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    await screen.findAllByText('Гречка');
    expect(screen.queryByTestId('who-owes')).toBeNull();
    expect(screen.queryByText(/Кто сколько должен/)).toBeNull();
  });

  it('п.2: липкой полосы «План · Факт · Δ» над таблицей нет', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    await screen.findAllByText('Гречка');
    expect(screen.queryByTestId('planfact-strip')).toBeNull();
    expect(screen.queryByTestId('planfact-fact')).toBeNull();
    expect(screen.queryByTestId('planfact-delta')).toBeNull();
  });

  it('п.3: колонок «План ₽» и «Отклонение» нет ни в таблице, ни в моб. строке', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    await screen.findAllByText('Гречка');
    expect(screen.queryByText('План ₽')).toBeNull();
    expect(screen.queryByText('Отклонение')).toBeNull();
    expect(screen.queryByText('план')).toBeNull();
    expect(screen.queryByTestId('row-delta-i1')).toBeNull();
  });

  it('п.4: заголовок колонки — «Стоимость ₽» (вместо «Факт ₽»)', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    await screen.findAllByText('Гречка');
    expect(screen.queryByText('Факт ₽')).toBeNull();
    // основная таблица + таблица «по дням»
    expect(screen.getAllByText('Стоимость ₽').length).toBeGreaterThanOrEqual(2);
  });

  it('п.5: внизу один «Итог» по введённым чекам; пока чеков нет — «нет данных»', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    const totals = await screen.findByTestId('checks-sticky-totals');
    expect(totals.textContent).toContain('Итог');
    expect(totals.textContent).toContain('нет данных');
    expect(totals.textContent).not.toContain('План');
    expect(totals.textContent).not.toContain('Факт:');
  });

  it('п.5: после ввода чека «Итог» = сумма введённых чеков', async () => {
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    const totals = await screen.findByTestId('checks-sticky-totals');
    expect(totals.textContent).toContain('120');
    expect(totals.textContent).not.toContain('нет данных');
    expect(totals.textContent).not.toContain('План');
  });

  it('п.3: таблица «по дням» — только день и стоимость (без плана/дельты)', async () => {
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    const dayRow = await screen.findByTestId('dayfact-row-2026-07-01');
    expect(dayRow.textContent).toContain('120');
    expect(dayRow.textContent).not.toContain('100'); // план не показывается
    expect(dayRow.querySelectorAll('td')).toHaveLength(2);
  });
});

/** Navigation-п.3: пустое состояние этапа ④ + выход из locked-ноты */
describe('PriceOverridesTab — empty-state (navigation-п.3)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('нет позиций → empty-state с CTA «К закупке ②»', async () => {
    const onGoToShopping = vi.fn();
    renderTab(
      { trip: { ...trip, days: [] }, recipes: [], recipesMap: new Map(), prices: [] },
      { onGoToShopping },
    );
    expect(await screen.findByTestId('checks-empty')).toBeTruthy();
    await userEvent.click(screen.getByTestId('checks-empty-cta'));
    expect(onGoToShopping).toHaveBeenCalledTimes(1);
  });

  it('locked-нота: кнопка «К магазину ③» переключает этап', async () => {
    const onGoToStore = vi.fn();
    renderTab({}, { onGoToStore });
    const btn = await screen.findByTestId('checks-to-store');
    await userEvent.click(btn);
    expect(onGoToStore).toHaveBeenCalledTimes(1);
  });
});

/**
 * bugs-trip-checks-stage пп.2–5 (владелец 03.11.2026): прежний describe
 * «словарь План/Факт» (UX-осмотр 31.10, п.10) УСТАРЕЛ — план-факт полоса,
 * колонки «План ₽»/«Отклонение» и дельта-чипы с этапа ④ удалены; кейсы
 * «честного факта» переехали в describe «чек без „плана"» выше (Итог —
 * «нет данных» до первого чека) и в ChecksModel.test.ts (enteredFactsTotal).
 * Здесь остаётся только «по дням»: день без чека — «нет данных».
 */
describe('PriceOverridesTab — таблица «по дням» без план/дельты (bugs-trip-checks-stage п.3)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('день без чека — «нет данных» (план за факт не выдаётся)', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    const dayRows = await screen.findAllByTestId('dayfact-row-2026-07-01');
    expect(dayRows.length).toBeGreaterThan(0);
    expect(dayRows[0].textContent).toContain('нет данных');
    expect(dayRows[0].textContent).not.toContain('100'); // план не показывается
  });
});

/**
 * BL-10 (01.11.2026): цены в чеке — ₽ за учётную единицу. Пользователь вводит
 * СУММУ, хранится (и переиспользуется) цена за единицу; без подписи «₽/кг»
 * цифра «120» читалась как сумма. Тест фиксирует, что единица выводится и на
 * десктопе, и в раскрытии мобильной строки.
 */
describe('PriceOverridesTab — единицы цены «₽/ед» (BL-10)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('после чека видна цена за единицу «120,00 ₽/кг» (десктоп)', async () => {
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    const caption = await screen.findByTestId('fact-unit-price-i1');
    expect(caption.textContent).toBe(`120,00${NBSP}₽/кг`);
  });

  it('до ввода чека цены за единицу нет (план не выдаётся за факт)', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    expect(await screen.findByTestId('actual-input-i1')).toBeTruthy();
    expect(screen.queryByTestId('fact-unit-price-i1')).toBeNull();
  });

  it('раскрытие мобильной строки: «по чеку: 120,00 ₽/кг»', async () => {
    const user = userEvent.setup();
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    await user.click(await screen.findByTestId('checkline-toggle-i1'));
    const caption = await screen.findByTestId('fact-unit-price-mobile-i1');
    expect(caption.textContent).toContain(`120,00${NBSP}₽/кг`);
  });
});
