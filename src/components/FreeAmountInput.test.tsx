import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FreeAmountInput from './FreeAmountInput';
import type { ActualAmount } from '../utils/checkUnits';

describe('FreeAmountInput (Fix-6, п.8) — свободные единицы факта', () => {
  // подзадачи 5/9 (30.10.2026): юнит-стек заменён UnitChip — единица видна
  // чипом, варианты — в bottom-sheet (цели ≥44px, Esc/клик вне)
  it('для KG чип показывает текущую единицу; в sheet — варианты «г» и «кг», текущая отмечена', () => {
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={() => {}} ariaLabel="Факт" testId="fa" />);
    const chip = screen.getByTestId('fa-unit');
    expect(chip.textContent).toContain('кг');
    fireEvent.click(chip);
    expect(screen.getByTestId('unit-option-г')).toBeTruthy();
    expect(screen.getByTestId('unit-option-кг').getAttribute('aria-checked')).toBe('true');
  });

  it('для PCS без веса штуки — одиночный чип «шт»; с весом — в sheet ещё г/кг', () => {
    const { unmount } = render(<FreeAmountInput value={null} baseUnit="PCS" onChange={() => {}} testId="fa" />);
    expect(screen.getByTestId('fa-unit-solo').textContent).toContain('шт');
    unmount();
    render(<FreeAmountInput value={null} baseUnit="PCS" pieceWeightG={25} onChange={() => {}} testId="fa" />);
    fireEvent.click(screen.getByTestId('fa-unit'));
    expect(screen.getByTestId('unit-option-шт')).toBeTruthy();
    expect(screen.getByTestId('unit-option-г')).toBeTruthy();
    expect(screen.getByTestId('unit-option-кг')).toBeTruthy();
  });

  it('ввод «300» отдаёт {amount:300, unit} с выбранной единицей (запятая = точка)', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={onChange} testId="fa" />);
    fireEvent.change(screen.getByTestId('fa'), { target: { value: '0,3' } });
    expect(onChange).toHaveBeenLastCalledWith({ amount: 0.3, unit: 'кг' });
  });

  it('переключение единицы (через sheet) переэмитит текущее значение', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={{ amount: 300, unit: 'г' } as ActualAmount} baseUnit="PCS" pieceWeightG={25} onChange={onChange} testId="fa" />);
    fireEvent.click(screen.getByTestId('fa-unit'));
    fireEvent.click(screen.getByTestId('unit-option-шт'));
    expect(onChange).toHaveBeenLastCalledWith({ amount: 300, unit: 'шт' });
  });

  it('пустое поле → null (сброс факта)', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={{ amount: 2, unit: 'кг' }} baseUnit="KG" onChange={onChange} testId="fa" />);
    fireEvent.change(screen.getByTestId('fa'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('буквы не вводятся (фильтр нечисловых символов)', () => {
    const onChange = vi.fn();
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={onChange} testId="fa" />);
    fireEvent.change(screen.getByTestId('fa'), { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FreeAmountInput — единый контур, плоский стык (Fix-7 п.13 + Fix-10 п.2)', () => {
  it('обёртка скруглена ЦЕЛИКОМ и скрывает переполнение; инпут — плоский (compact-input)', () => {
    render(<FreeAmountInput value={null} baseUnit="KG" onChange={() => {}} testId="fa-joint" />);
    const wrap = screen.getByTestId('fa-joint-wrap');
    // внешний контур: единый радиус (инлайн) + overflow-hidden (класс) —
    // левое скругление даёт обёртка
    expect(wrap.className).toContain('overflow-hidden');
    expect(wrap.style.borderRadius).toContain('var(--r-input');
    // инпут: compact-input (глобальный CSS Fix-10 п.2 обнуляет его собственный радиус —
    // справа вплотную примыкают кнопки единиц, «ступеньки» на стыке нет)
    const input = screen.getByTestId('fa-joint');
    expect(input.className).toContain('compact-input');
  });
});
