/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 4, KB-31).
 *
 * MobileCheckRow рисовал `<button>` внутри `<button>` (плюс `<input type=checkbox>`
 * внутри кнопки) — невалидный DOM, `Warning: validateDOMNesting(...)` в консоли
 * на этапе ④ и интерактив внутри интерактива для скринридера.
 *
 * Тест фиксирует: в строке чека НЕТ интерактивного элемента внутри
 * интерактивного, при этом поведение сохранено — тап по строке раскрывает
 * детали, чекбокс «взято» и ввод факта работают независимо, клавиатура
 * (Tab → Enter/Space) раскрывает строку.
 */
/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { deriveTripView, type TripViewInput } from '../utils/tripDerived';
import type { Trip, Recipe, Price } from '../types/tripDetail';

import ChecksMobile from './ChecksMobile';
import { buildCheckRows, groupCheckRows } from './ChecksModel';

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

function setup(over: Partial<TripViewInput> = {}, propsOver: Record<string, unknown> = {}) {
  const view = makeView(over);
  const rows = buildCheckRows(view);
  const props = {
    groups: groupCheckRows(rows, view),
    excluded: new Set<string>(),
    actualMap: {},
    pieceWeightById: new Map<string, number | null>(),
    canEnterCheck: true,
    boughtSet: new Set<string>(),
    factCount: 0,
    factsTotal: rows.length,
    onToggleBought: vi.fn(),
    onCommitActualTotal: vi.fn(),
    onCommitTook: vi.fn(),
    onToggleExcluded: vi.fn(),
    ...propsOver,
  };
  render(<ChecksMobile {...props} />);
  return props;
}

/** Все интерактивные элементы, которые HTML-спека запрещает вкладывать в interactive content. */
const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

describe('ChecksMobile — валидная вложенность DOM (KB-31)', () => {
  it('нет <button> внутри <button>', () => {
    setup();
    const nested = Array.from(document.querySelectorAll('button'))
      .filter(b => b.parentElement?.closest('button'));
    expect(nested).toEqual([]);
  });

  it('нет никакого интерактива внутри кнопки (чекбокс/поле факта — соседи)', () => {
    setup();
    const offenders = Array.from(document.querySelectorAll('button'))
      .flatMap(b => Array.from(b.querySelectorAll(INTERACTIVE)));
    expect(offenders).toEqual([]);
  });

  it('строка чека — не кнопка: контейнер без роли button', () => {
    setup();
    const row = screen.getByTestId('checkline-i1');
    expect(row.tagName.toLowerCase()).not.toBe('button');
    expect(row.getAttribute('role')).not.toBe('button');
  });
});

describe('ChecksMobile — поведение сохранено после реструктуризации', () => {
  it('тап по строке раскрывает детали, aria-expanded/aria-controls на toggle', () => {
    setup();
    const toggle = screen.getByTestId('checkline-toggle-i1');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('checkline-details-i1');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('checkline-details-i1')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByTestId('checkline-details-i1')).toBeNull();
  });

  it('доступное имя toggle содержит видимый текст позиции (WCAG 2.5.3)', () => {
    setup();
    const toggle = screen.getByTestId('checkline-toggle-i1');
    expect(toggle.getAttribute('aria-label')).toContain('Гречка');
    expect(toggle.textContent).toContain('Гречка');
  });

  it('чекбокса «взято» в строке больше нет (владелец 07.11.2026)', () => {
    setup();
    expect(screen.queryByLabelText('Взято: Гречка')).toBeNull();
    // отметка «взято» живёт в этапе ③; в чеке остаётся только ввод стоимости
    expect(screen.getByTestId('fact-add-i1')).toBeTruthy();
  });

  it('«+ факт, ₽» раскрывает детали и открывает ввод суммы', () => {
    const p = setup();
    fireEvent.click(screen.getByTestId('fact-add-i1'));
    expect(screen.getByTestId('checkline-details-i1')).toBeTruthy();
    expect(screen.getByTestId('actual-input-mobile-i1')).toBeTruthy();
    expect(p.onCommitActualTotal).not.toHaveBeenCalled();
  });

  it('клавиатура: Tab доходит до toggle, Enter раскрывает строку', async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByTestId('checkline-toggle-i1') as HTMLElement;
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('в раскрытии строки нет галки «исключить из расчёта» (владелец 07.11.2026)', () => {
    setup();
    fireEvent.click(screen.getByTestId('checkline-toggle-i1'));
    expect(screen.getByTestId('checkline-details-i1')).toBeTruthy();
    expect(screen.queryByLabelText(/Исключить из расчёта|Включить в расчёт/)).toBeNull();
    expect(screen.queryByText(/В расчёте/)).toBeNull();
  });

  it('выключенный ввод чека: «+ факт, ₽» disabled', () => {
    setup({}, { canEnterCheck: false });
    expect((screen.getByTestId('fact-add-i1') as HTMLButtonElement).disabled).toBe(true);
  });
});

// bugs-trip-checks-stage п.3: describe «честный факт» (отклонение «—» /
// «+20,0%») УСТАРЕЛ — бейджи отклонения и колонка «План ₽» из этапа ④ удалены
// (calculateDelta/formatDelta/getDeltaChipClass выпилены из ChecksModel).
// «Честный факт» живёт в: enteredFactsTotal (ChecksModel.test.ts) и «Итог —
// нет данных» (PriceOverridesTab.test.tsx).

// bugs-trip-checks-stage пп.3,4,6,7: из мобильной строки чека ушли «план» и
// бейдж отклонения; CTA ввода чека переименован под словарь «Стоимость ₽»;
// строка без введённого чека подсвечена (.row-attention); липкий поиск
// прокручивает к совпадению (общий контрол ListSearch, R8).
describe('ChecksMobile — bugs-trip-checks-stage пп.3,4,6,7', () => {
  beforeEach(() => {
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  it('п.3: в строке нет «плана» и бейджа отклонения', () => {
    setup();
    expect(screen.queryByText('план')).toBeNull();
    expect(screen.queryByText(/^план/)).toBeNull();
    expect(screen.queryByTestId('row-delta-i1')).toBeNull();
  });

  it('п.4: CTA ввода чека — «+ стоимость, ₽» (слово «факт» из подписей ушло)', () => {
    setup();
    const cta = screen.getByTestId('fact-add-i1');
    expect(cta.textContent).toContain('стоимость');
    expect(cta.textContent).not.toContain('факт');
  });

  it('п.6: строка без введённого чека — .row-attention', () => {
    setup();
    const line = screen.getByTestId('checkline-toggle-i1').closest('.checkline')!;
    expect(line.classList.contains('row-attention')).toBe(true);
  });

  it('п.6: после ввода чека подсветка снята', () => {
    setup({ draftOverrides: { i1: { price: 120, total: 120 } } });
    const line = document.querySelector('[data-search-id="i1"].checkline')
      ?? screen.getByTestId('actual-input-i1').closest('.checkline')!;
    expect(line.classList.contains('row-attention')).toBe(false);
  });

  it('п.7: липкий поиск — при вводе подсветка и прокрутка к строке, «Не найдено» при промахе', () => {
    setup();
    const input = screen.getByTestId('checks-search-input');
    // контроль прилипает к верху списка (зона .checklist-sticky)
    expect(input.closest('.checklist-sticky')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'греч' } });
    const hit = document.querySelector('[data-search-id="i1"]')!;
    expect(hit.classList.contains('search-hit')).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByTestId('checks-search-count').textContent).toBe('1/1');
    fireEvent.change(input, { target: { value: 'гречка-несуществующая' } });
    expect(screen.getByTestId('checks-search-none').textContent).toBe('Не найдено');
  });
});
