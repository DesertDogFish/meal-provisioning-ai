// BL-63: тосты живут на токенах дизайн-пака (var(--…)), а не на сырой палитре
// Tailwind, и объявляются скринридеру по типу уведомления.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastProvider';

type Kind = 'error' | 'success' | 'info';

const KINDS: Array<{ kind: Kind; role: 'alert' | 'status'; cls: string; title: string; message: string }> = [
  { kind: 'error', role: 'alert', cls: 'toast--error', title: 'Ошибка', message: 'Не удалось сохранить' },
  { kind: 'success', role: 'status', cls: 'toast--success', title: 'Успешно', message: 'Сохранено' },
  { kind: 'info', role: 'status', cls: 'toast--info', title: 'Информация', message: 'Черновик восстановлен' },
];

function Harness({ kind }: { kind: Kind }) {
  const { showError, showSuccess, showInfo } = useToast();
  const fire = () => {
    if (kind === 'error') showError('Не удалось сохранить');
    else if (kind === 'success') showSuccess('Сохранено');
    else showInfo('Черновик восстановлен');
  };
  return (
    <button type="button" onClick={fire}>
      Показать
    </button>
  );
}

function showToast(kind: Kind) {
  render(
    <ToastProvider>
      <Harness kind={kind} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByText('Показать'));
}

describe('ToastProvider (BL-63)', () => {
  beforeEach(() => {
    vi.useFakeTimers(); // авто-дисмисс (5 с) не должен срабатывать посреди теста
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each(KINDS)('$kind: роль $role, класс $cls, иконка в soft-кружке', ({ kind, role, cls, title, message }) => {
    showToast(kind);

    const toast = screen.getByRole(role);
    expect(toast.className).toContain('toast');
    expect(toast.className).toContain(cls);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();

    const icon = toast.querySelector('.toast__icon');
    expect(icon).not.toBeNull();
    expect(icon!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(KINDS)('$kind: цвета — только токены, без сырой палитры Tailwind', ({ kind }) => {
    showToast(kind);
    const toast = screen.getByRole(kind === 'error' ? 'alert' : 'status');

    // Регрессия BL-63: bg-emerald-50 / text-red-600 / text-blue-* и т.п. не возвращаются.
    expect(toast.className).not.toMatch(/(emerald|red|blue|green|amber|slate|gray)-\d{2,3}/);
    // Цвета заданы классами из index.css (var(--…)), а не инлайн-стилями.
    expect(toast.getAttribute('style')).toBeNull();
    expect(toast.querySelector('.toast__msg')?.getAttribute('style')).toBeNull();
  });

  it('крестик закрывает тост и объявлен скринридеру', () => {
    showToast('error');

    const close = screen.getByLabelText('Закрыть уведомление: Ошибка');
    fireEvent.click(close);

    expect(document.querySelector('.toast')).toBeNull();
  });

  it('контейнер уведомлений доступен как region с именем', () => {
    showToast('info');
    expect(screen.getByRole('region', { name: 'Уведомления' })).toBeTruthy();
  });
});
