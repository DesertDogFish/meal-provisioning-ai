/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import UnitChip from './UnitChip';

describe('UnitChip — единица чипом + bottom-sheet (подзадачи 5/9, 30.10.2026)', () => {
  it('одна единица — статичный чип без диалога', () => {
    render(<UnitChip unit="шт" options={['шт']} onChange={() => {}} testId="uc" />);
    expect(screen.getByTestId('uc-solo').textContent).toBe('шт');
    expect(screen.queryByTestId('uc')).toBeNull();
  });

  it('тап по чипу открывает sheet с вариантами; текущая отмечена aria-checked', () => {
    render(<UnitChip unit="кг" options={['г', 'кг']} onChange={() => {}} testId="uc" />);
    fireEvent.click(screen.getByTestId('uc'));
    const sheet = screen.getByTestId('uc-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(screen.getByTestId('unit-option-г').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('unit-option-кг').getAttribute('aria-checked')).toBe('true');
  });

  it('выбор единицы зовёт onChange и закрывает sheet; Esc — только закрывает', () => {
    const onChange = vi.fn();
    const { rerender } = render(<UnitChip unit="кг" options={['г', 'кг']} onChange={onChange} testId="uc" />);
    fireEvent.click(screen.getByTestId('uc'));
    fireEvent.click(screen.getByTestId('unit-option-г'));
    expect(onChange).toHaveBeenCalledWith('г');
    expect(screen.queryByTestId('uc-sheet')).toBeNull();

    rerender(<UnitChip unit="кг" options={['г', 'кг']} onChange={onChange} testId="uc" />);
    fireEvent.click(screen.getByTestId('uc'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('uc-sheet')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('клик по фону закрывает sheet без смены единицы', () => {
    const onChange = vi.fn();
    render(<UnitChip unit="кг" options={['г', 'кг']} onChange={onChange} testId="uc" />);
    fireEvent.click(screen.getByTestId('uc'));
    fireEvent.click(screen.getByTestId('uc-sheet-overlay'));
    expect(screen.queryByTestId('uc-sheet')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
