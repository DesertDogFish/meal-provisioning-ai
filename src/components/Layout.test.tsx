/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Layout from './Layout';
import { openAppDrawer } from '../ui/drawerBus';
import { ToastProvider } from './ToastProvider';
import { AuthProvider } from './AuthProvider'; // cleanup-п.7: профиль из контекста

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    getMode: () => 'mock',
    onSessionLost: vi.fn(() => () => {}), // cleanup-п.7: подписка AuthProvider
  },
}));

vi.mock('../api/watchdog', () => ({
  startWatchdog: vi.fn(),
  stopWatchdog: vi.fn(),
  onWatchdogChange: vi.fn(() => () => {}),
}));

import { api } from '../api/client';

/**
 * Fix-8 (п.3): «когда я говорил оторвать от центра, я имел ввиду не только
 * контент, но и левую панель тоже» — сайдбар и контент образуют ЕДИНУЮ
 * центрированную оболочку .app-frame (max-width, margin auto): на широких
 * экранах вся «полоса» приложения (панель + контент) оторвана от краёв
 * вьюпорта, а не только контент внутри области справа от панели.
 */
function renderLayout() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <Layout>
            <div data-testid="page-content">Контент страницы</div>
          </Layout>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Layout — единая центрированная оболочка (Fix-8 п.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({
      id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'ADMIN',
    });
  });

  it('сайдбар и контент обёрнуты общим .app-frame', async () => {
    const { baseElement } = renderLayout();
    const frame = baseElement.querySelector('.app-frame');
    expect(frame).toBeTruthy();
    const aside = frame!.querySelector('aside');
    const main = frame!.querySelector('main');
    expect(aside).toBeTruthy();
    expect(main).toBeTruthy();
    // контент страницы — внутри той же оболочки
    expect(main!.textContent).toContain('Контент страницы');
  });

  it('навигация и контент — внутри одного фрейма (панель не «прибита» к вьюпорту отдельно)', async () => {
    const { baseElement } = renderLayout();
    const frame = baseElement.querySelector('.app-frame')!;
    const nav = frame.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(frame.contains(baseElement.querySelector('main'))).toBe(true);
  });
});

/**
 * Подзадачи 9/10 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): мобильный drawer —
 * открывается гамбургером, закрывается кликом по затемнению и по Esc, пока открыт —
 * фон не скроллится, фокус возвращается на гамбургер.
 */
describe('Layout — мобильный drawer (подзадача 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as any).mockResolvedValue({
      id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', role: 'ADMIN',
    });
  });

  // UX-список владельца п.13: мобильное верхнее табло убрано, меню открывают кнопки
  // в шапках страниц — они дёргают шину openAppDrawer(), Layout слушает.
  it('шина openAppDrawer открывает drawer, затемнение закрывает', () => {
    const { baseElement } = renderLayout();
    const aside = baseElement.querySelector('aside.app-drawer') as HTMLElement;
    expect(aside.className).not.toContain('app-drawer--open');
    expect(screen.queryByTestId('drawer-overlay')).toBeNull();

    act(() => openAppDrawer());
    expect(aside.className).toContain('app-drawer--open');
    expect(screen.getByTestId('drawer-overlay')).toBeTruthy();
    // фон заблокирован, пока drawer открыт
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByTestId('drawer-overlay'));
    expect(aside.className).not.toContain('app-drawer--open');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('Esc закрывает drawer и возвращает фокус на кнопку, которая его открыла', () => {
    renderLayout();
    const opener = document.createElement('button');
    opener.textContent = 'Открыть меню навигации';
    document.body.appendChild(opener);
    opener.focus();
    act(() => openAppDrawer());
    expect(screen.getByTestId('drawer-overlay')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('drawer-overlay')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe('hidden');
    opener.remove();
  });

  it('у контента есть оболочка .app-shell, а мобильного табло .app-topbar больше нет', () => {
    const { baseElement } = renderLayout();
    expect(baseElement.querySelector('.app-shell')).toBeTruthy();
    // п.13: табло с гамбургером и сменой темы удалено — кнопка меню живёт в шапках страниц
    expect(baseElement.querySelector('header.app-topbar')).toBeNull();
  });

  it('бейдж режима API перенесён в боковое меню', () => {
    const { baseElement } = renderLayout();
    const aside = baseElement.querySelector('aside.app-drawer') as HTMLElement;
    expect(aside.querySelector('.api-badge')).toBeTruthy();
  });
});

