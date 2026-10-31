// Component-тесты ApiModeBadge (PLAN.md Фаза 10, P0 п.2)
// Покрывают: переключение режимов (MODE-05), очистку кеша (resetSeedData),
// статус бейджа при доступном/недоступном API (MODE-01/02), watchdog-подписку (MODE-06).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import React from 'react';
import ApiModeBadge from './ApiModeBadge';

// Мок api-клиента: следим за setMode/resetSeedData/get
const modeState = { mode: 'mock' as 'real' | 'mock' };
const apiMock = {
  getMode: vi.fn(() => modeState.mode),
  setMode: vi.fn((m: 'real' | 'mock') => {
    modeState.mode = m;
  }),
  resetSeedData: vi.fn(),
  get: vi.fn(),
};

vi.mock('../api/client', () => ({
  api: {
    getMode: () => modeState.mode,
    setMode: (m: 'real' | 'mock') => apiMock.setMode(m),
    resetSeedData: () => apiMock.resetSeedData(),
    get: (...args: unknown[]) => apiMock.get(...args),
  },
}));

// Мок watchdog: перехватываем callback и умеем его «триггерить»
type WdCallback = (available: boolean, latency: number | null, error: string | null) => void;
let lastWdCallback: WdCallback | null = null;
const watchdogMock = {
  startWatchdog: vi.fn(),
  stopWatchdog: vi.fn(),
  onWatchdogChange: vi.fn((cb: WdCallback) => {
    lastWdCallback = cb;
    return () => {
      lastWdCallback = null;
    };
  }),
};

vi.mock('../api/watchdog', () => ({
  startWatchdog: (...a: unknown[]) => (watchdogMock.startWatchdog as any)(...a),
  stopWatchdog: (...a: unknown[]) => (watchdogMock.stopWatchdog as any)(...a),
  onWatchdogChange: (cb: WdCallback) => watchdogMock.onWatchdogChange(cb),
}));

// Мок тостов — нам важно, что showSuccess/showError вызываются
const toastMock = { showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() };
vi.mock('./ToastProvider', () => ({
  useToast: () => toastMock,
}));

function renderBadge() {
  return render(<ApiModeBadge />);
}

beforeEach(() => {
  vi.clearAllMocks();
  modeState.mode = 'mock';
  lastWdCallback = null;
  apiMock.get.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe('ApiModeBadge — отображение статуса', () => {
  it('в mock-режиме показывает янтарный бейдж «демо-режим»', () => {
    renderBadge();
    expect(screen.getByText('демо-режим')).toBeInTheDocument();
  });

  it('в real-режиме при доступном API показывает «бэкенд: подключён»', async () => {
    modeState.mode = 'real';
    renderBadge();
    // watchdog отдаёт available=true
    await waitFor(() => expect(watchdogMock.startWatchdog).toHaveBeenCalled());
    act(() => { lastWdCallback!(true, 42, null); });
    await waitFor(() =>
      expect(screen.getByText('бэкенд: подключён')).toBeInTheDocument()
    );
  });

  it('в real-режиме при недоступном API показывает «бэкенд: ошибка»', async () => {
    modeState.mode = 'real';
    renderBadge();
    await waitFor(() => expect(watchdogMock.startWatchdog).toHaveBeenCalled());
    act(() => { lastWdCallback!(false, null, "Connection refused"); });
    await waitFor(() =>
      expect(screen.getByText('бэкенд: ошибка')).toBeInTheDocument()
    );
  });

  it('при падении API в real-режиме показывает тост с предупреждением (MODE-02)', async () => {
    modeState.mode = 'real';
    renderBadge();
    await waitFor(() => expect(watchdogMock.startWatchdog).toHaveBeenCalled());
    act(() => { lastWdCallback!(false, null, "timeout"); });
    await waitFor(() =>
      expect(toastMock.showError).toHaveBeenCalledWith(
        'API недоступен, переключение на демо-данные'
      )
    );
  });

  it('монтирование запускает watchdog, размонтирование — останавливает (MODE-06)', async () => {
    const { unmount } = renderBadge();
    await waitFor(() => expect(watchdogMock.startWatchdog).toHaveBeenCalledTimes(1));
    expect(watchdogMock.onWatchdogChange).toHaveBeenCalledTimes(1);
    unmount();
    expect(watchdogMock.stopWatchdog).toHaveBeenCalledTimes(1);
  });
});

describe('ApiModeBadge — переключение режимов (MODE-05)', () => {
  it('клик по бейджу открывает модалку выбора режима', () => {
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    expect(screen.getByText('Режим данных')).toBeInTheDocument();
    expect(screen.getByText('Бэкенд')).toBeInTheDocument();
    expect(screen.getByText('Демо-данные')).toBeInTheDocument();
  });

  it('выбор «Бэкенд» вызывает api.setMode(real) и тост о переключении', async () => {
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    fireEvent.click(screen.getByText('HTTP запросы к Spring Boot API').closest('div.rounded-xl')!);

    await waitFor(() => expect(apiMock.setMode).toHaveBeenCalledWith('real'));
    expect(toastMock.showSuccess).toHaveBeenCalledWith('Режим переключён на: Бэкенд');
    // маркер АКТИВЕН появился у выбранного режима
    expect(screen.getAllByText('АКТИВЕН').length).toBe(1);
  });

  it('выбор «Демо-данные» вызывает api.setMode(mock)', async () => {
    modeState.mode = 'real';
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    fireEvent.click(screen.getByText('Локальные данные в localStorage').closest('div.rounded-xl')!);

    await waitFor(() => expect(apiMock.setMode).toHaveBeenCalledWith('mock'));
    expect(toastMock.showSuccess).toHaveBeenCalledWith('Режим переключён на: Демо-данные');
  });

  it('кнопка «Проверить соединение» обращается к /meta и показывает латентность', async () => {
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    fireEvent.click(screen.getByText('Проверить соединение'));

    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith('/meta'));
    await waitFor(() => expect(toastMock.showSuccess).toHaveBeenCalled());
    const successArg = toastMock.showSuccess.mock.calls.find(c =>
      String(c[0]).startsWith('API доступен')
    );
    expect(successArg).toBeDefined();
  });

  it('при ошибке проверки соединения показывает тост ошибки', async () => {
    apiMock.get.mockRejectedValue(new Error('Network down'));
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    fireEvent.click(screen.getByText('Проверить соединение'));

    await waitFor(() => expect(toastMock.showError).toHaveBeenCalledWith('API недоступен'));
  });
});

describe('ApiModeBadge — очистка кеша (reset seed)', () => {
  it('в mock-режиме видна кнопка сброса демо-данных', () => {
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    expect(screen.getByText('Сбросить демо-данные')).toBeInTheDocument();
  });

  it('в real-режиме кнопка сброса скрыта', () => {
    modeState.mode = 'real';
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    expect(screen.queryByText('Сбросить демо-данные')).not.toBeInTheDocument();
  });

  it('подтверждение сброса вызывает api.resetSeedData() и перезагрузку страницы', async () => {
    // happy-dom: location.reload может не существовать — подменяем
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    fireEvent.click(screen.getByText('Сбросить демо-данные'));

    // Fix-6 (п.7): подтверждение — брендовый диалог вместо window.confirm
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить данные' }));
    await waitFor(() => expect(apiMock.resetSeedData).toHaveBeenCalledTimes(1));
    expect(toastMock.showSuccess).toHaveBeenCalledWith('Демо-данные сброшены');
    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it('отказ от подтверждения НЕ сбрасывает кеш', async () => {
    renderBadge();
    fireEvent.click(screen.getByTitle('Клик для настройки режима'));
    fireEvent.click(screen.getByText('Сбросить демо-данные'));

    // Fix-6 (п.7): «Отмена» в брендовом диалоге — данные не трогаем
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(apiMock.resetSeedData).not.toHaveBeenCalled();
  });
});

describe('ApiModeBadge — прод-сборка (transparency-п.4, вариант A)', () => {
  afterEach(() => {
    delete (window as unknown as { meta?: unknown }).meta;
    cleanup();
  });

  it('DEV=false без VITE_ENABLE_MOCK — бейдж не рендерится, watchdog не стартует', () => {
    (window as unknown as { meta?: unknown }).meta = { env: { DEV: 'false' } };
    const { container } = render(<ApiModeBadge />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/демо-режим/)).toBeNull();
    expect(watchdogMock.startWatchdog).not.toHaveBeenCalled();
  });

  it('DEV=false + VITE_ENABLE_MOCK=true — бейдж рендерится (демо-стенд)', () => {
    (window as unknown as { meta?: unknown }).meta = { env: { DEV: 'false', VITE_ENABLE_MOCK: 'true' } };
    render(<ApiModeBadge />);
    expect(screen.getByText(/демо-режим/)).toBeTruthy();
  });
});
