/// <reference types="vitest/globals" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecipeSearchSelect from './RecipeSearchSelect';

/**
 * Fix-8 (п.4): «нажимаем на поле поиска блюда и это меняет размер модалки.
 * Не должен ехать экран от такого» — в inline-режиме (модалка «Добавить приём
 * пищи») место под список зарезервировано ВСЕГДА: закрытый список занимает
 * ту же фиксированную высоту, что и открытый, поэтому высота формы постоянна.
 */
const OPTIONS = [
  { value: 'r1', label: 'Уха из рыбных консервов', hint: 'Обед • готовка 25 мин' },
  { value: 'r2', label: 'Овсянка с яблоком', hint: 'Завтрак' },
];

const H_CLASS = 'h-44 sm:h-56';

function renderSelect(props: Partial<React.ComponentProps<typeof RecipeSearchSelect>> = {}) {
  return render(
    <RecipeSearchSelect
      value=""
      onChange={vi.fn()}
      options={OPTIONS}
      inlineList
      placeholder="Начните вводить название блюда…"
      {...props}
    />
  );
}

describe('RecipeSearchSelect — inline-список: постоянная высота (Fix-8 п.4)', () => {
  it('закрытый список: зарезервированная область той же высоты, что и открытый список', () => {
    const { container } = renderSelect();
    const input = screen.getByRole('combobox');
    // до фокуса список закрыт
    expect(input.getAttribute('aria-expanded')).toBe('false');
    const reserved = container.querySelector('.rss-list-reserved');
    expect(reserved).toBeTruthy();
    expect(reserved!.className).toContain(H_CLASS);
    // подсказка-приглашение в зарезервированной области
    expect(reserved!.textContent).toContain('Начните вводить название блюда');
  });

  it('открытый список: та же фиксированная высота — размер блока не меняется', () => {
    const { container } = renderSelect();
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const list = container.querySelector('.rss-list');
    expect(list).toBeTruthy();
    expect(list!.className).toContain(H_CLASS);
    // зарезервированная заглушка исчезла (её место занял список той же высоты)
    expect(container.querySelector('.rss-list-reserved')).toBeNull();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('выбор блюда закрывает список — снова зарезервированная область с выбранным названием', () => {
    const onChange = vi.fn();
    const { container } = renderSelect({ value: '', onChange });
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(screen.getByText('Уха из рыбных консервов'));
    expect(onChange).toHaveBeenCalledWith('r1');
    // после commit список закрыт — высота зарезервирована
    const reserved = container.querySelector('.rss-list-reserved');
    expect(reserved).toBeTruthy();
    expect(reserved!.className).toContain(H_CLASS);
  });

  it('закрытый список с выбранным блюдом показывает «Выбрано: …»', () => {
    const { container } = renderSelect({ value: 'r2' });
    const reserved = container.querySelector('.rss-list-reserved');
    expect(reserved!.textContent).toContain('Выбрано: Овсянка с яблоком');
  });

  it('overlay-режим (inlineList=false): зарезервированной области НЕТ — список не раздвигает вёрстку', () => {
    const { container } = renderSelect({ inlineList: false });
    expect(container.querySelector('.rss-list-reserved')).toBeNull();
    expect(container.querySelector('.rss-list')).toBeNull();
  });
});
