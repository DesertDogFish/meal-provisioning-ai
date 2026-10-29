/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import InfoTip from './InfoTip';
import TabHeader from './TabHeader';

/**
 * Подзадача 3/10 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): InfoTip — управляемый
 * поповер вместо нативного title (на тач-устройстве ховера нет, подсказка была
 * недоступна вовсе).
 */
describe('InfoTip — поповер для тач-устройств (подзадача 3)', () => {
  const TEXT = 'Общая стоимость ÷ людей в походе';

  beforeEach(() => {
    // fine-pointer: в happy-dom matchMedia может отсутствовать — ховер-ветка не нужна
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('триггер: aria-label, тач-класс, БЕЗ нативного title (иначе дубль поповера)', () => {
    render(<InfoTip text={TEXT} />);
    const tip = screen.getByTestId('info-tip');
    expect(tip.getAttribute('aria-label')).toBe(TEXT);
    expect(tip.getAttribute('title')).toBeNull();
    expect(tip.className).toContain('infotip-trigger');
    expect(tip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('тап/клик открывает поповер с role="tooltip" и текстом формулы', () => {
    render(<InfoTip text={TEXT} />);
    fireEvent.click(screen.getByTestId('info-tip'));
    const pop = screen.getByRole('tooltip');
    expect(pop.textContent).toBe(TEXT);
    expect(pop.getAttribute('data-testid')).toBe('info-tip-pop');
    expect(screen.getByTestId('info-tip').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('info-tip').getAttribute('aria-describedby')).toBeTruthy();
  });

  it('повторный клик закрывает поповер', () => {
    render(<InfoTip text={TEXT} />);
    const tip = screen.getByTestId('info-tip');
    fireEvent.click(tip);
    expect(screen.queryByRole('tooltip')).toBeTruthy();
    fireEvent.click(tip);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(tip.getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc закрывает поповер и возвращает фокус на триггер', () => {
    render(<InfoTip text={TEXT} />);
    const tip = screen.getByTestId('info-tip');
    fireEvent.click(tip);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(tip);
  });

  it('клик вне поповера закрывает его', () => {
    render(
      <div>
        <button type="button">снаружи</button>
        <InfoTip text={TEXT} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('info-tip'));
    expect(screen.queryByRole('tooltip')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'снаружи' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('тач-порядок событий (focus → click) НЕ закрывает только что открытую подсказку', () => {
    render(<InfoTip text={TEXT} />);
    const tip = screen.getByTestId('info-tip');
    // Chrome/тач: mousedown → focus → mouseup → click
    fireEvent.focus(tip);
    expect(screen.queryByRole('tooltip')).toBeTruthy();
    fireEvent.click(tip);
    expect(screen.getByRole('tooltip').textContent).toBe(TEXT);
    // второй клик — уже за окном «фокус+клик», если прошёл таймаут
  });

  it('открытие с клавиатуры по фокусу (focus-visible сценарий)', () => {
    render(<InfoTip text={TEXT} />);
    fireEvent.focus(screen.getByTestId('info-tip'));
    expect(screen.getByRole('tooltip').textContent).toBe(TEXT);
  });

  it('ширина поповера ограничена (≤320px) и не вылезает за вьюпорт', () => {
    render(<InfoTip text={TEXT} />);
    fireEvent.click(screen.getByTestId('info-tip'));
    const pop = screen.getByRole('tooltip') as HTMLElement;
    expect(Number(pop.style.maxWidth.replace('px', ''))).toBeLessThanOrEqual(320);
    expect(Number(pop.style.left.replace('px', ''))).toBeGreaterThanOrEqual(0);
  });

  it('внутри модалки поповер поднимается над --z-modal (портал в body)', () => {
    render(
      <div className="modal-overlay">
        <InfoTip text={TEXT} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('info-tip'));
    const pop = screen.getByRole('tooltip') as HTMLElement;
    expect(pop.style.zIndex).toBe('calc(var(--z-modal) + 1)');
  });

  it('вне модалки слой задаёт CSS-класс (--z-pop), инлайн z-index не ставится', () => {
    render(<InfoTip text={TEXT} />);
    fireEvent.click(screen.getByTestId('info-tip'));
    const pop = screen.getByRole('tooltip') as HTMLElement;
    expect(pop.style.zIndex).toBe('');
    expect(pop.className).toContain('infotip-pop');
  });

  it('произвольный aria-label важнее текста подсказки', () => {
    render(<InfoTip text={TEXT} label="Как считаем" />);
    expect(screen.getByTestId('info-tip').getAttribute('aria-label')).toBe('Как считаем');
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
