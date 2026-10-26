/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AmountInput, { parseDecimal, isWeightUnit } from './AmountInput';

describe('AmountInput (U31) — количество без «0,015 кг»', () => {
  it('KG, значение < 1 → режим граммов: 0.015 кг отображается как «15» г', () => {
    render(<AmountInput value={0.015} unit="KG" onChange={() => {}} testId="qty" />);
    expect((screen.getByTestId('qty') as HTMLInputElement).value).toBe('15');
    expect(screen.getByLabelText('Единица: г').getAttribute('aria-pressed')).toBe('true');
  });

  it('KG, значение ≥ 1 → режим килограммов: «1,5» кг', () => {
    render(<AmountInput value={1.5} unit="KG" onChange={() => {}} testId="qty" />);
    expect((screen.getByTestId('qty') as HTMLInputElement).value).toBe('1,5');
    expect(screen.getByLabelText('Единица: кг').getAttribute('aria-pressed')).toBe('true');
  });

  it('ввод «15» в граммах отдаёт 0.015 кг наружу (базовые единицы)', () => {
    const onChange = vi.fn();
    render(<AmountInput value={null} unit="KG" onChange={onChange} testId="qty" />);
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith(0.015);
  });

  it('запятая и точка — обе десятичный разделитель', () => {
    const onChange = vi.fn();
    render(<AmountInput value={null} unit="KG" onChange={onChange} testId="qty" />);
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '1,5' } });
    expect(onChange).toHaveBeenLastCalledWith(0.0015); // граммовый режим: 1,5 г = 0,0015 кг
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith(0.0025);
  });

  it('переключатель г→кг пересчитывает введённое значение (1500 г → 1,5 кг)', () => {
    const onChange = vi.fn();
    render(<AmountInput value={null} unit="KG" onChange={onChange} testId="qty" />);
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '1500' } });
    fireEvent.click(screen.getByLabelText('Единица: кг'));
    expect((screen.getByTestId('qty') as HTMLInputElement).value).toBe('1,5');
    expect(onChange).toHaveBeenLastCalledWith(1.5);
  });

  it('L → мл/л', () => {
    render(<AmountInput value={0.25} unit="L" onChange={() => {}} testId="qty" />);
    expect((screen.getByTestId('qty') as HTMLInputElement).value).toBe('250');
    expect(screen.getByLabelText('Единица: мл')).toBeTruthy();
  });

  it('PCS — ввод в штуках, без переключателя', () => {
    const onChange = vi.fn();
    render(<AmountInput value={3} unit="PCS" onChange={onChange} testId="qty" />);
    expect((screen.getByTestId('qty') as HTMLInputElement).value).toBe('3');
    expect(screen.queryByLabelText('Единица: г')).toBeNull();
    fireEvent.change(screen.getByTestId('qty'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('подсказка эквивалента: 1500 г → «= 1,5 кг»', () => {
    render(<AmountInput value={1.5} unit="KG" onChange={() => {}} testId="qty" />);
    fireEvent.click(screen.getByLabelText('Единица: г'));
    expect(screen.getByTestId('qty-hint').textContent).toBe('= 1,5 кг');
  });

  it('parseDecimal / isWeightUnit — утилиты', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(isWeightUnit('KG')).toBe(true);
    expect(isWeightUnit('PCS')).toBe(false);
  });
});
