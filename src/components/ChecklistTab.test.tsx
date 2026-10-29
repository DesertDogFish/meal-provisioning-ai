/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getByTestId('checklist-row-1'));
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

  it('Enter/Space на строке — то же действие (клавиатура)', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByTestId('checklist-row-1'), { key: 'Enter' });
    expect(props.onToggleRow).toHaveBeenCalledWith('1@200000');
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
    expect(screen.getByTestId('checklist-none')).not.toBeDisabled();
  });
});
