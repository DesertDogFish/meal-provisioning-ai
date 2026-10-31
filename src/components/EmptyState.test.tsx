/**
 * Navigation-п.3 (2026-10-31): пустые состояния этапов — иконка + текст +
 * рабочий CTA на этап-источник (вместо «пустой таблицы без слов»).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState (navigation-п.3)', () => {
  it('заголовок, подсказка и CTA: клик вызывает onCta', () => {
    const onCta = vi.fn();
    render(
      <EmptyState
        icon={<span>🧺</span>}
        title="Закупка пуста"
        hint="Добавьте приёмы пищи в меню — список соберётся автоматически."
        ctaLabel="К меню ①"
        onCta={onCta}
        testId="shopping-empty"
      />
    );
    expect(screen.getByTestId('shopping-empty')).toBeTruthy();
    expect(screen.getByText('Закупка пуста')).toBeTruthy();
    expect(screen.getByText(/соберётся автоматически/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('shopping-empty-cta'));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('без CTA — только текст (кнопка не рендерится)', () => {
    render(<EmptyState title="Пусто" testId="plain-empty" />);
    expect(screen.getByTestId('plain-empty')).toBeTruthy();
    expect(screen.queryByTestId('plain-empty-cta')).toBeNull();
  });
});
