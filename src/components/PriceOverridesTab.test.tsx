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
    expect(screen.getByTestId('who-owes')).toBeTruthy();
    expect(screen.getByTestId('planfact-strip')).toBeTruthy();
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

  it('итоги полосы: план/факт из общей view (совпадают с ②)', async () => {
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    const strip = await screen.findByTestId('planfact-strip');
    expect(strip.textContent).toContain('100'); // план
    expect(strip.textContent).toContain('120'); // факт
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
 * UX-осмотр 31.10 (п.10): единый словарь этапов ②④ и «честный факт».
 * Сводки говорят «План/Факт», а таблица чека — «Думали ₽/Заплатили ₽»:
 * два имени одного числа в одном экране. Плюс при нуле введённых чеков
 * факт показывал копию плана и «+0%» — выглядело как уже посчитанные деньги.
 */
describe('PriceOverridesTab — словарь «План/Факт» (UX-осмотр 31.10, п.10)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('заголовки таблицы: «План ₽»/«Факт ₽», старых «Думали/Заплатили» нет', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    expect((await screen.findAllByText('План ₽')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Факт ₽')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Думали/)).toBeNull();
    expect(screen.queryByText(/Заплатили/)).toBeNull();
  });

  it('итоговая полоса при 0 чеков: «Факт — нет данных», дельта «—»', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    const strip = await screen.findByTestId('planfact-strip');
    expect(strip.textContent).toContain('нет данных');
    expect(screen.getByTestId('planfact-fact').textContent).toContain('нет данных');
    expect(screen.getByTestId('planfact-delta').textContent).toBe('—');
  });

  it('липкий итог таблицы при 0 чеков: «Факт: нет данных»', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    const totals = await screen.findByTestId('checks-sticky-totals');
    expect(totals.textContent).toContain('План:');
    expect(totals.textContent).toContain('Факт: нет данных');
  });

  it('после первого чека суммы и дельта возвращаются', async () => {
    renderTab({ draftOverrides: { i1: { price: 120, total: 120 } } }, { boughtSet: new Set(['k1']) });
    const strip = await screen.findByTestId('planfact-strip');
    expect(strip.textContent).not.toContain('нет данных');
    expect(screen.getByTestId('planfact-delta').textContent).toBe('+20,0%');
  });

  it('строка без введённого чека: отклонение «—» (десктоп-таблица и моб. строка)', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    const chips = await screen.findAllByTestId('row-delta-i1');
    expect(chips.length).toBeGreaterThanOrEqual(2);
    for (const chip of chips) expect(chip.textContent).toBe('—');
  });

  it('таблица «по дням»: день без чека — «нет данных», день с чеком — сумма', async () => {
    renderTab({}, { boughtSet: new Set(['k1']) });
    const dayRows = await screen.findAllByTestId('dayfact-row-2026-07-01');
    expect(dayRows.length).toBeGreaterThan(0);
    expect(dayRows[0].textContent).toContain('нет данных');
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
