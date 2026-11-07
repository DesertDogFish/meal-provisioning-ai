/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 6).
 *
 * Осмотр нашёл на /login «глазик» пароля без accessible name: иконочная кнопка
 * без текста, aria-label и title — скринридер объявлял просто «button».
 */
/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { namelessButtons, namelessFields } from '../test/a11y';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), onSessionLost: vi.fn(() => () => {}) },
}));
const refreshMock = vi.fn();
// Сессия для рендера: тесты приветствия выставляют authState.user.
const authState: { user: null | { id: string; email: string; firstName: string; lastName: string; role: string } } = { user: null };
vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ user: authState.user, refresh: refreshMock, loading: false }),
}));

import { api } from '../api/client';

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

/**
 * Подзадача 8 (аудит 02.11.2026, план plans/2026-11-02-audit-security-usability-ui.md):
 * autoComplete для менеджеров паролей, связка <label>/<input> (htmlFor/id),
 * озвучка ошибки входа (role="alert"), копи-консистентность placeholder'а.
 */
function switchToRegister() {
  fireEvent.click(screen.getByRole('button', { name: /Нет аккаунта\? Зарегистрироваться/ }));
}

describe('LoginPage — a11y полей и менеджеры паролей (подзадача 8)', () => {
  it('probe: полей без accessible name = 0 (вход)', () => {
    renderPage();
    expect(namelessFields(document)).toEqual([]);
  });

  it('probe: полей без accessible name = 0 (регистрация)', () => {
    renderPage();
    switchToRegister();
    expect(namelessFields(document)).toEqual([]);
  });

  it('label связаны с input через htmlFor/id', () => {
    renderPage();
    // getByLabelText резолвит именно связку label→control
    expect(screen.getByLabelText('Email').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Пароль').tagName).toBe('INPUT');
    switchToRegister();
    expect(screen.getByLabelText('Имя').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Фамилия').tagName).toBe('INPUT');
  });

  it('режим входа: autoComplete email/current-password + name-атрибуты', () => {
    renderPage();
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Пароль');
    expect(email.getAttribute('autocomplete')).toBe('email');
    expect(email.getAttribute('name')).toBe('email');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(password.getAttribute('name')).toBe('password');
  });

  it('режим регистрации: autoComplete given-name/family-name/new-password', () => {
    renderPage();
    switchToRegister();
    expect(screen.getByLabelText('Имя').getAttribute('autocomplete')).toBe('given-name');
    expect(screen.getByLabelText('Фамилия').getAttribute('autocomplete')).toBe('family-name');
    expect(screen.getByLabelText('Пароль').getAttribute('autocomplete')).toBe('new-password');
  });

  it('ошибка входа объявляется скринридеру: role="alert"', async () => {
    renderPage();
    // до ошибки live-региона нет
    expect(document.querySelector('[role="alert"]')).toBeNull();
    fireEvent.submit(screen.getByRole('button', { name: 'Войти' }).closest('form')!);
    const alert = await waitFor(() => document.querySelector('[role="alert"]'));
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('Введите email и пароль');
  });

  it('копи-консистентность: placeholder email на русской форме — ivan@example.com', () => {
    renderPage();
    expect(screen.getByPlaceholderText('ivan@example.com')).toBeTruthy();
  });
});

/** Подзадача 4.5 аудита: парольная политика NIST SP 800-63B (минимум 8) на клиенте. */
describe('LoginPage — пароль не короче 8 (подзадача 4.5)', () => {
  it('регистрация с паролем 7 символов — ошибка до запроса, API не вызван', async () => {
    renderPage();
    switchToRegister();
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByLabelText('Фамилия'), { target: { value: 'Петров' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ivan@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '1234567' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Зарегистрироваться' }).closest('form')!);

    const alert = await waitFor(() => document.querySelector('[role="alert"]'));
    expect(alert!.textContent).toContain('Пароль: не короче 8 символов');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('пароль 8 символов — запрос на /auth/register уходит', async () => {
    (api.post as any).mockResolvedValueOnce({
      accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer',
    });
    renderPage();
    switchToRegister();
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Иван' } });
    fireEvent.change(screen.getByLabelText('Фамилия'), { target: { value: 'Петров' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ivan@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '12345678' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Зарегистрироваться' }).closest('form')!);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
      email: 'ivan@example.com',
      password: '12345678',
    })));
  });
});

/**
 * Задача tasks/design-atmosphere-art.md (подзадача 3, утверждено 03.11.2026):
 * фон входа — арт «море целиком» (sea-login.webp) + тёмная вуаль; оба слоя
 * декоративные (aria-hidden), Ken Burns отключается prefers-reduced-motion
 * (CSS-медиазапрос, в jsdom проверяем наличие слоёв и их aria-hidden).
 * RED: до правки слоёв .login-art/.login-art-veil на странице нет.
 */
describe('LoginPage — атмосферный фон (design-п.3)', () => {
  it('арт-слой и вуаль присутствуют, оба aria-hidden', () => {
    renderPage();
    const art = document.querySelector('.login-art');
    const veil = document.querySelector('.login-art-veil');
    expect(art).toBeTruthy();
    expect(veil).toBeTruthy();
    expect(art!.getAttribute('aria-hidden')).toBe('true');
    expect(veil!.getAttribute('aria-hidden')).toBe('true');
    // арт — фоновая картинка (webp-ассет подключён)
    expect((art as HTMLElement).style.backgroundImage).toContain('sea-login');
  });

  it('контент формы — НАД фоном (z-index слоя контента ≥ 1)', () => {
    renderPage();
    const content = document.querySelector('.login-content');
    expect(content).toBeTruthy();
    const z = parseInt(getComputedStyle(content as HTMLElement).zIndex || '1', 10);
    expect(z).toBeGreaterThanOrEqual(1);
  });
});

describe('LoginPage — просьбы владельца 07.11.2026', () => {
  it('нет заголовка «Вход в систему» и нет демо-учёток', () => {
    renderPage();
    expect(screen.queryByText('Вход в систему')).toBeNull();
    expect(screen.queryByText('Демо-доступ:')).toBeNull();
    expect(screen.queryByText('admin@provision.app')).toBeNull();
    expect(screen.queryByText('user@provision.app')).toBeNull();
  });

  it('токен уже выдан: вместо формы — приветствие и кнопка «Войти»', () => {
    authState.user = { id: '1', email: 'user@provision.app', firstName: 'Олег', lastName: 'Петров', role: 'USER' };
    try {
      renderPage();
      expect(screen.getByTestId('login-greeting').textContent).toContain('Олег');
      expect(screen.getByTestId('login-enter').textContent).toContain('Войти');
      expect(screen.queryByLabelText('Email')).toBeNull();
    } finally {
      authState.user = null;
    }
  });
});

/**
 * п.3 списка владельца: «в офлайне можно зайти и зарегаться» — первый запуск
 * должен быть только онлайн. Плагин сети подменяем: useOffline читает
 * networkMonitor.isOnline(), поэтому без сети форма не отправляется и виден
 * объясняющий баннер.
 */
const netState = { online: true };
vi.mock('../sync/NetworkMonitor', () => ({
  networkMonitor: {
    isOnline: () => netState.online,
    subscribe: () => () => {},
    start: () => {},
    stop: () => {},
  },
}));

describe('LoginPage — офлайн (п.3)', () => {
  it('без сети: баннер + отправка формы блокируется, api не вызывается', async () => {
    netState.online = false;
    try {
      renderPage();
      expect(screen.getByTestId('login-offline')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@provision.app' } });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
      await waitFor(() => expect(document.getElementById('login-error')?.textContent).toMatch(/Нет соединения/));
      expect((api.post as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    } finally {
      netState.online = true;
    }
  });

  it('с сетью: баннера нет', () => {
    netState.online = true;
    renderPage();
    expect(screen.queryByTestId('login-offline')).toBeNull();
  });
});
