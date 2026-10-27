/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InfoTip from './InfoTip';
import TabHeader from './TabHeader';

describe('InfoTip (Fix-5, п.3–5) — формулы в тултипах', () => {
  it('рендерит подсказку в title', () => {
    render(<InfoTip text="Общая стоимость ÷ людей в походе" />);
    const tip = screen.getByTestId('info-tip');
    expect(tip.getAttribute('title')).toBe('Общая стоимость ÷ людей в походе');
    expect(tip.getAttribute('aria-label')).toBe('Общая стоимость ÷ людей в походе');
  });
});

describe('TabHeader (Fix-5, п.2) — единая шапка вкладок', () => {
  it('заголовок, подпись и действия справа', () => {
    render(<TabHeader title="Закупка по дням" subtitle="Итого: 100 ₽" right={<button>Действие</button>} />);
    expect(screen.getByText('Закупка по дням')).toBeTruthy();
    expect(screen.getByText('Итого: 100 ₽')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Действие' })).toBeTruthy();
  });

  it('без subtitle/right — только заголовок', () => {
    render(<TabHeader title="На человека" />);
    expect(screen.getByText('На человека')).toBeTruthy();
  });
});
