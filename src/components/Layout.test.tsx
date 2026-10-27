/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';
import { ToastProvider } from './ToastProvider';

vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    getMode: () => 'mock',
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
      <ToastProvider>
        <Layout>
          <div data-testid="page-content">Контент страницы</div>
        </Layout>
      </ToastProvider>
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
