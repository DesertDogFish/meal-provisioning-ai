/**
 * BL-63 (аудит 02.11.2026, подзадача 7): алерты — токены дизайн-пака вместо
 * сырой палитры Tailwind. Прежние классы bg-amber-50/text-amber-900 были
 * только светлыми: в тёмной теме (дефолт приложения) алерт рисовался белёсой
 * коробкой. Компонент обязан:
 *  - маппить семантику статуса (getErrorColor) на классы .alert--* (токены);
 *  - не содержать сырой палитры Tailwind и hex-литералов в разметке;
 *  - быть theme-agnostic: при data-theme dark/light разметка идентична
 *    (тему переключает CSS переменных, не компонент);
 *  - объявлять ошибку скринридеру (role="alert").
 */
/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';

import { ProblemDetail } from '../types/errors';

import { ProblemDetailAlert } from './ProblemDetailAlert';

function pd(status: number, extra: Partial<ProblemDetail> = {}): ProblemDetail {
  return { type: 'about:blank', title: `Ошибка ${status}`, status, ...extra };
}

const RAW_PALETTE = /(bg|text|border)-(red|green|blue|amber|orange|slate|purple|gray)-[0-9]/;

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('ProblemDetailAlert — токены вместо сырой палитры (BL-63)', () => {
  it.each([
    [400, 'alert--warn'],
    [401, 'alert--warn'],
    [403, 'alert--danger'],
    [404, 'alert--info'],
    [409, 'alert--info'],
    [500, 'alert--danger'],
    [418, 'alert--neutral'],
  ])('status %i → класс %s (полный вариант)', (status, expected) => {
    const { container } = render(<ProblemDetailAlert problemDetail={pd(status)} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains('alert')).toBe(true);
    expect(root.classList.contains(expected)).toBe(true);
  });

  it('compact-вариант: тот же маппинг токенов', () => {
    const { container } = render(<ProblemDetailAlert problemDetail={pd(409)} compact />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains('alert')).toBe(true);
    expect(root.classList.contains('alert--info')).toBe(true);
  });

  it('в разметке нет сырой палитры Tailwind и hex-литералов', () => {
    const { container } = render(<ProblemDetailAlert problemDetail={pd(500, { detail: 'упс' })} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(RAW_PALETTE);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('theme-agnostic: разметка идентична в dark и light (цвет даёт CSS токенов)', () => {
    document.documentElement.dataset.theme = 'dark';
    const dark = render(<ProblemDetailAlert problemDetail={pd(400, { detail: 'd' })} />);
    const darkHtml = dark.container.innerHTML;
    dark.unmount();

    document.documentElement.dataset.theme = 'light';
    const light = render(<ProblemDetailAlert problemDetail={pd(400, { detail: 'd' })} />);
    expect(light.container.innerHTML).toBe(darkHtml);
    expect(light.container.innerHTML).toMatch(/alert--warn/);
  });

  it('role="alert": ошибка объявляется скринридеру (полный и compact)', () => {
    const full = render(<ProblemDetailAlert problemDetail={pd(500)} />);
    expect(full.container.querySelector('[role="alert"]')).not.toBeNull();
    full.unmount();
    const compact = render(<ProblemDetailAlert problemDetail={pd(500)} compact />);
    expect(compact.container.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('ProblemDetailAlert — содержимое', () => {
  it('validation-ошибки выводятся человеческой копией', () => {
    render(
      <ProblemDetailAlert
        problemDetail={pd(400, {
          errors: [{ field: 'name', message: 'не должно быть пустым' }],
        } as Partial<ProblemDetail>)}
      />,
    );
    expect(screen.getByText('Ошибки валидации:')).toBeTruthy();
    // текст встречается дважды: в списке (humanize) и в JSON «Технических деталей»
    expect(screen.getAllByText(/не должно быть пустым/).length).toBeGreaterThanOrEqual(1);
  });

  it('конфликт: список «Используется в»', () => {
    render(
      <ProblemDetailAlert
        problemDetail={pd(409, {
          usedIn: [{ resourceType: 'recipe', resourceId: '1', resourceName: 'Каша' }],
        } as Partial<ProblemDetail>)}
      />,
    );
    expect(screen.getByText('Используется в:')).toBeTruthy();
    expect(screen.getByText('Каша')).toBeTruthy();
  });

  it('кнопка закрытия: имя «Закрыть», вызывает onClose', () => {
    let closed = 0;
    render(<ProblemDetailAlert problemDetail={pd(500)} onClose={() => { closed += 1; }} />);
    fireEvent.click(screen.getByLabelText('Закрыть'));
    expect(closed).toBe(1);
  });

  it('технические детали (RFC 7807) раскрываются', () => {
    render(<ProblemDetailAlert problemDetail={pd(500, { detail: 'сервер упал' })} />);
    const details = screen.getByText('Технические детали (RFC 7807)');
    expect(details).toBeTruthy();
    expect(screen.getByText('сервер упал')).toBeTruthy();
  });
});
