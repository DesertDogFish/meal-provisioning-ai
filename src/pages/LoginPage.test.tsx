/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 6).
 *
 * Осмотр нашёл на /login «глазик» пароля без accessible name: иконочная кнопка
 * без текста, aria-label и title — скринридер объявлял просто «button».
 */
/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { namelessButtons } from '../test/a11y';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
}));
const refreshMock = vi.fn();
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ user: null, refresh: refreshMock, loading: false }),
}));

import LoginPage from './LoginPage';

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('LoginPage — a11y иконочных кнопок (подзадача 6)', () => {
  it('probe: кнопок без accessible name = 0', () => {
    renderPage();
    expect(namelessButtons(document)).toEqual([]);
  });

  it('глазик пароля: «Показать пароль» → «Скрыть пароль», aria-pressed переключается', () => {
    renderPage();
    const eye = screen.getByLabelText('Показать пароль');
    expect(eye.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(eye);
    const hidden = screen.getByLabelText('Скрыть пароль');
    expect(hidden.getAttribute('aria-pressed')).toBe('true');
    // поле пароля реально переключило тип
    expect(screen.getByPlaceholderText('••••••••').getAttribute('type')).toBe('text');
    fireEvent.click(hidden);
    expect(screen.getByPlaceholderText('••••••••').getAttribute('type')).toBe('password');
  });

  it('режим регистрации добавляет поля имени/фамилии — и они тоже с именами', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Зарегистрироваться|Уже есть аккаунт|Нет аккаунта/ }));
    expect(namelessButtons(document)).toEqual([]);
  });
});
