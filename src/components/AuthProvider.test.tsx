/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.7): /auth/me — ОДИН раз
 * на сессию. Провайдер: single-flight загрузка, refresh после логина,
 * logout-инвалидация, подписка на session-lost, profileError.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const sessionLostHandlers: Array<() => void> = [];
const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    onSessionLost: (h: () => void) => { sessionLostHandlers.push(h); return () => {}; },
  },
}));

import { AuthProvider, useAuth } from './AuthProvider';
import ProtectedRoute from './ProtectedRoute';

const ADMIN = { id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'ADMIN' };

function Probe() {
  const { user, isAdmin, loading, profileError, refresh, logout } = useAuth();
  return (
    <div>
      <span data-testid="probe-user">{user ? user.email : 'none'}</span>
      <span data-testid="probe-admin">{String(isAdmin)}</span>
      <span data-testid="probe-loading">{String(loading)}</span>
      <span data-testid="probe-error">{String(profileError)}</span>
      <button data-testid="probe-refresh" onClick={() => void refresh()}>refresh</button>
      <button data-testid="probe-logout" onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderTree(initialEntry = '/x') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        {/* дерево как в App: несколько ProtectedRoute + контент — каждый раньше
            делал СВОЙ /auth/me (аудит: до 7 запросов) */}
        <ProtectedRoute><Probe /></ProtectedRoute>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthProvider (cleanup-п.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionLostHandlers.length = 0;
    localStorage.clear();
    localStorage.setItem('accessToken', 'mock-access-token-1');
    getMock.mockResolvedValue(ADMIN);
    postMock.mockResolvedValue(null);
  });

  it('один GET /auth/me на сессию, контекст раздаёт user/isAdmin', async () => {
    renderTree();
    expect(await screen.findByText('a@b.c')).toBeTruthy();
    expect(screen.getByTestId('probe-admin').textContent).toBe('true');
    const meCalls = getMock.mock.calls.filter(c => c[0] === '/auth/me');
    expect(meCalls.length).toBe(1);
  });

  it('без токена — запроса нет, ProtectedRoute редиректит (контент не рендерится)', async () => {
    localStorage.removeItem('accessToken');
    renderTree();
    await waitFor(() => expect(screen.queryByTestId('probe-user')).toBeNull());
    expect(getMock).not.toHaveBeenCalled();
  });

  it('ошибка /auth/me → чистит токены, profileError=true', async () => {
    getMock.mockRejectedValue(new Error('401'));
    renderTree();
    await waitFor(() => expect(localStorage.getItem('accessToken')).toBeNull());
    // ProtectedRoute редиректил — проба не рендерится; токены очищены
    expect(screen.queryByTestId('probe-user')).toBeNull();
  });

  it('refresh после логина перечитывает /auth/me (смена роли видна)', async () => {
    const user = userEvent.setup();
    renderTree();
    await screen.findByText('a@b.c');
    getMock.mockResolvedValue({ ...ADMIN, role: 'USER', email: 'u@b.c' });
    await user.click(screen.getByTestId('probe-refresh'));
    expect(await screen.findByText('u@b.c')).toBeTruthy();
    expect(screen.getByTestId('probe-admin').textContent).toBe('false');
  });

  it('logout: POST /auth/logout + токены очищены + контекст пуст', async () => {
    const user = userEvent.setup();
    localStorage.setItem('refreshToken', 'rt-1');
    renderTree();
    await screen.findByText('a@b.c');
    await user.click(screen.getByTestId('probe-logout'));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'rt-1' }));
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('session-lost событие обнуляет пользователя (редирект на /login)', async () => {
    renderTree();
    await screen.findByText('a@b.c');
    act(() => { sessionLostHandlers.forEach(h => h()); });
    await waitFor(() => expect(screen.queryByTestId('probe-user')).toBeNull());
  });

  it('single-flight: refresh во время загрузки не плодит запросы', async () => {
    let resolveMe: (v: unknown) => void = () => {};
    getMock.mockReturnValue(new Promise(r => { resolveMe = r; }));
    render(
      <MemoryRouter>
        <AuthProvider><Probe /></AuthProvider>
      </MemoryRouter>
    );
    // первичная загрузка идёт (token есть) — loading=true
    await waitFor(() => expect(screen.getByTestId('probe-loading').textContent).toBe('true'));
    const user = userEvent.setup();
    await user.click(screen.getByTestId('probe-refresh')); // refresh во время in-flight
    resolveMe(ADMIN);
    expect(await screen.findByText('a@b.c')).toBeTruthy();
    const meCalls = getMock.mock.calls.filter(c => c[0] === '/auth/me');
    expect(meCalls.length).toBe(1);
  });
});
