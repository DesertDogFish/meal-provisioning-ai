/// <reference types="vitest/globals" />
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';

import CustomMultiSelect from './CustomMultiSelect';

/**
 * bugs-products-catalog п.4: мультиселект фильтров — общий контрол на портале
 * (паттерн CustomSelect: usePortalDropdown + .cselect-* стили), значение —
 * список строк, клик по опции тоглит выбор, список не закрывается до клика вне.
 */

const options = [
  { value: 'Крупы', label: 'Крупы' },
  { value: 'Специи', label: 'Специи' },
  { value: 'Мясо', label: 'Мясо' },
];

function Harness({ initial = [] as string[], onChange }: { initial?: string[]; onChange?: (v: string[]) => void }) {
  const [values, setValues] = useState<string[]>(initial);
  return (
    <CustomMultiSelect
      values={values}
      onChange={(v) => { setValues(v); onChange?.(v); }}
      options={options}
      emptyLabel="Категория: все"
      ariaLabel="Фильтр по категориям"
    />
  );
}

beforeEach(() => cleanup());

describe('CustomMultiSelect', () => {
  it('пустой выбор — триггер с emptyLabel; клик открывает список опций', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Фильтр по категориям' });
    expect(trigger.textContent).toContain('Категория: все');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('клик по опции добавляет значение (onChange), повторный клик — убирает', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Фильтр по категориям' }));
    fireEvent.click(screen.getByRole('option', { name: /Крупы/ }));
    expect(onChange).toHaveBeenLastCalledWith(['Крупы']);
    // список остаётся открытым — мультиселект
    fireEvent.click(screen.getByRole('option', { name: /Мясо/ }));
    expect(onChange).toHaveBeenLastCalledWith(['Крупы', 'Мясо']);
    fireEvent.click(screen.getByRole('option', { name: /Крупы/ }));
    expect(onChange).toHaveBeenLastCalledWith(['Мясо']);
  });

  it('выбранные значения видны в триггере: первое + «+N»', () => {
    render(<Harness initial={['Крупы', 'Специи']} />);
    const trigger = screen.getByRole('combobox', { name: 'Фильтр по категориям' });
    expect(trigger.textContent).toContain('Крупы');
    expect(trigger.textContent).toContain('+1');
  });

  it('выбранная опция помечена aria-selected и галочкой', () => {
    render(<Harness initial={['Специи']} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Фильтр по категориям' }));
    expect(screen.getByRole('option', { name: /Специи/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: /Крупы/ }).getAttribute('aria-selected')).toBe('false');
  });

  it('Escape закрывает список; Enter на триггере — открывает', () => {
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: 'Фильтр по категориям' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
