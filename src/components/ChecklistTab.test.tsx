/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChecklistTab from './ChecklistTab';
import { checklistRowKey, collectChecklistKeys, type ChecklistGroup, type ChecklistRow } from '../utils/checklist';

/**
 * Подзадачи 6/7/10 (plans/done/2026-10-29-ui-nowrap-and-mobile.md):
 * чеклист как мобильный сценарий + подтверждение опасных массовых действий.
 */

function row(partial: Partial<ChecklistRow> & { ingredientId: string; name: string }): ChecklistRow {
  return {
    unit: 'G',
    needed: 200,
    packSize: null,
    packsToBuy: null,
    buyAmount: 200,
    leftover: 0,
    category: 'Бакалея',
    pieceWeightG: null,
    ...partial,
  } as ChecklistRow;
}

const GROUPS: ChecklistGroup[] = [
  {
    category: 'Бакалея',
    rows: [
      row({ ingredientId: '1', name: 'Соль', needed: 200 }),
      row({ ingredientId: '2', name: 'Крупа гречневая', needed: 800, packSize: 400, packsToBuy: 2, buyAmount: 800, leftover: 0 }),
    ],
  },
  {
    category: 'Консервы',
    rows: [row({ ingredientId: '3', name: 'Тушёнка', unit: 'PCS', needed: 4, buyAmount: 4, category: 'Консервы' })],
  },
];

function setup(overrides: Partial<Parameters<typeof ChecklistTab>[0]> = {}) {
  const props = {
    groups: GROUPS,
    bought: new Set<string>(),
    actualQty: {},
    onToggleRow: vi.fn(),
    onCommitActualQty: vi.fn(),
    onSetAll: vi.fn(),
    ...overrides,
  };
  render(<ChecklistTab {...props} />);
  return props;
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChecklistTab — прогресс и отметки (подзадача 6)', () => {
  it('показывает группы, позиции и прогресс «Взято N из M»', () => {
    setup();
    expect(screen.getByText('Соль')).toBeTruthy();
    expect(screen.getByText('Тушёнка')).toBeTruthy();
    expect(screen.getByTestId('checklist-progress').getAttribute('aria-valuemax')).toBe('3');
    expect(screen.getByText(/0 из 3/)).toBeTruthy();
  });

  it('тап по строке переключает «взято» — ключ = позиция + потребность', () => {
    const props = setup();
    // UX-осмотр 31.10 (п.14): строка больше НЕ div[role=button] — тап-зону даёт
    // настоящая кнопка-переключатель (хит-зона ::after на всю строку, паттерн KB-31)
    fireEvent.click(screen.getByTestId('checklist-toggle-1'));
    expect(props.onToggleRow).toHaveBeenCalledWith('1@200000');
    expect(props.onToggleRow).toHaveBeenCalledWith(checklistRowKey(GROUPS[0].rows[0]));
  });

  it('чекбокс строки тоже переключает отметку (и не дублирует клик по строке)', () => {
    const props = setup();
    const box = screen.getByLabelText('Взято: Соль');
    fireEvent.click(box);
    expect(props.onToggleRow).toHaveBeenCalledTimes(1);
    expect(props.onToggleRow).toHaveBeenCalledWith('1@200000');
  });

  it('Enter на строке — то же действие (клавиатура): переключатель — настоящий <button>', async () => {
    const user = userEvent.setup();
    const props = setup();
    const toggle = screen.getByTestId('checklist-toggle-1');
    expect(toggle.tagName).toBe('BUTTON');
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(props.onToggleRow).toHaveBeenCalledWith('1@200000');
  });

  it('нет интерактивного элемента внутри интерактивного (паттерн KB-31)', () => {
    setup();
    const interactive = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const nested = Array.from(document.querySelectorAll(interactive))
      .flatMap(el => Array.from(el.querySelectorAll(interactive)));
    expect(nested).toEqual([]);
  });

  it('строка не объявляется кнопкой: role=button на контейнере строки убран', () => {
    setup();
    expect(screen.getByTestId('checklist-row-1').getAttribute('role')).toBeNull();
    expect(screen.getByTestId('checklist-row-1').hasAttribute('tabindex')).toBe(false);
  });

  it('отмеченная позиция учитывается в прогрессе', () => {
    setup({ bought: new Set(['1@200000']) });
    const bar = screen.getByTestId('checklist-progress');
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('3');
  });

  it('фильтр «только не взятое» скрывает отмеченные позиции', () => {
    setup({ bought: new Set(['1@200000']) });
    fireEvent.click(screen.getByTestId('checklist-only-missing'));
    expect(screen.queryByText('Соль')).toBeNull();
    expect(screen.getByText('Тушёнка')).toBeTruthy();
  });

  it('группа категории сворачивается и разворачивается', () => {
    setup();
    const toggle = screen.getByTestId('checklist-group-Консервы');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Тушёнка')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Тушёнка')).toBeTruthy();
  });

  it('подсказка к прогрессу — поповер InfoTip (не нативный title)', () => {
    setup();
    const tip = screen.getByTestId('info-tip');
    expect(tip.getAttribute('title')).toBeNull();
    fireEvent.click(tip);
    expect(screen.getByRole('tooltip').textContent).toContain('привязана к количеству');
  });

  it('подписи чисел — неделимые связки (.keep-pair/.keep-num)', () => {
    const { container } = render(<ChecklistTab groups={GROUPS} bought={new Set()} actualQty={{}}
      onToggleRow={vi.fn()} onCommitActualQty={vi.fn()} onSetAll={vi.fn()} />);
    expect(container.querySelectorAll('.keep-pair').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.keep-num').length).toBeGreaterThan(0);
  });

  it('пустой чеклист — подсказка, а не пустота', () => {
    setup({ groups: [] });
    expect(screen.getByText(/В закупке нет позиций/)).toBeTruthy();
    expect(screen.getByTestId('checklist-all')).toBeDisabled();
  });
});

describe('ChecklistTab — подтверждение массовых действий (подзадача 7)', () => {
  it('«Отметить всё» без подтверждения ничего не меняет; после подтверждения — onSetAll(true)', async () => {
    const props = setup();
    fireEvent.click(screen.getByTestId('checklist-all'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Отметить всё как купленное?');
    expect(props.onSetAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(props.onSetAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('checklist-all'));
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(props.onSetAll).toHaveBeenCalledWith(true));
  });

  it('«Снять всё» — danger-диалог с числом теряемых отметок; отмена по умолчанию в фокусе', async () => {
    const props = setup({ bought: new Set(['1@200000', '3@4000']) });
    // подзадача 5 (30.10.2026): «Снять всё» — в kebab, случайный сброс исключён
    fireEvent.click(screen.getByTestId('checklist-kebab'));
    fireEvent.click(screen.getByTestId('checklist-none'));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Снять все отметки?');
    expect(dialog.textContent).toContain('2 поз.');
    expect(screen.getByTestId('confirm-cancel')).toHaveFocus();
    fireEvent.click(screen.getByTestId('confirm-yes'));
    await waitFor(() => expect(props.onSetAll).toHaveBeenCalledWith(false));
  });

  it('Esc в диалоге отменяет массовое действие', async () => {
    const props = setup();
    fireEvent.click(screen.getByTestId('checklist-all'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(props.onSetAll).not.toHaveBeenCalled();
  });

  it('кнопки заблокированы, когда действие бессмысленно', () => {
    setup({ bought: new Set(collectChecklistKeys(GROUPS)) });
    expect(screen.getByTestId('checklist-all')).toBeDisabled();
    fireEvent.click(screen.getByTestId('checklist-kebab'));
    expect(screen.getByTestId('checklist-none')).not.toBeDisabled();
  });
});

// bugs-trip-checks-stage пп.6–7: неотмеченная позиция visibly отличается от
// закрытой (.row-attention); в липкой шапке — поиск (общий контрол ListSearch,
// R8 — тот же, что на этапе ④): ввод → прокрутка к совпадению ближе к центру +
// подсветка, Enter — следующее совпадение, промах — «Не найдено».
describe('ChecklistTab — bugs-trip-checks-stage пп.6–7', () => {
  beforeEach(() => {
    (Element.prototype as any).scrollIntoView = vi.fn();
  });

  it('п.6: неотмеченная строка — .row-attention, отмеченная — без подсветки', () => {
    const boughtKey = checklistRowKey(GROUPS[0].rows[0]);
    setup({ bought: new Set([boughtKey]) });
    expect(screen.getByTestId('checklist-row-1').classList.contains('row-attention')).toBe(false);
    expect(screen.getByTestId('checklist-row-2').classList.contains('row-attention')).toBe(true);
    expect(screen.getByTestId('checklist-row-3').classList.contains('row-attention')).toBe(true);
  });

  it('п.7: поиск в липкой шапке; ввод — прокрутка/подсветка; Enter — следующее; промах — «Не найдено»', () => {
    setup();
    const input = screen.getByTestId('checklist-search-input');
    expect(input.closest('.checklist-sticky')).toBeTruthy();

    // «к» есть и в «Крупа гречневая», и в «Тушёнка» — два совпадения
    fireEvent.change(input, { target: { value: 'к' } });
    expect(screen.getByTestId('checklist-search-count').textContent).toBe('1/2');
    expect(document.querySelector('[data-search-id="2"]')!.classList.contains('search-hit')).toBe(true);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.querySelector('[data-search-id="3"]')!.classList.contains('search-hit')).toBe(true);
    expect(document.querySelector('[data-search-id="2"]')!.classList.contains('search-hit')).toBe(false);
    expect(screen.getByTestId('checklist-search-count').textContent).toBe('2/2');

    fireEvent.change(input, { target: { value: 'ффы' } });
    expect(screen.getByTestId('checklist-search-none').textContent).toBe('Не найдено');
  });

  it('п.7: поиск раскрывает свёрнутую группу и не конфликтует с фильтром «только не взятое»', () => {
    const boughtKey = checklistRowKey(GROUPS[1].rows[0]); // Тушёнка взята
    setup({ bought: new Set([boughtKey]) });
    fireEvent.click(screen.getByTestId('checklist-group-Бакалея'));
    expect(screen.queryByTestId('checklist-row-2')).toBeNull();

    const input = screen.getByTestId('checklist-search-input');
    fireEvent.change(input, { target: { value: 'греч' } });
    // группа «Бакалея» раскрыта поиском, совпадение подсвечено
    expect(screen.getByTestId('checklist-row-2')).toBeTruthy();
    expect(document.querySelector('[data-search-id="2"]')!.classList.contains('search-hit')).toBe(true);

    // фильтр «только не взятое» + поиск: взятая Тушёнка не ищется
    fireEvent.click(screen.getByTestId('checklist-only-missing'));
    fireEvent.change(input, { target: { value: 'туш' } });
    expect(screen.getByTestId('checklist-search-none').textContent).toBe('Не найдено');
  });
});
