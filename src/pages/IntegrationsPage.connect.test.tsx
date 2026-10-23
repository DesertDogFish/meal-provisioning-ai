// Регрессия: ложная ошибка "Ошибка: Connected successfully" при успешном
// подключении OFF-интеграции. Бэкенд на POST /admin/integrations/OFF/connect
// возвращает HTTP 200 с телом IntegrationDto, где errorMessage === "Connected
// successfully" (ConnectionStatus.success()). Фронтенд не должен трактовать
// это поле как ошибку.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const showError = vi.fn();
const showSuccess = vi.fn();

vi.mock('../components/ToastProvider', () => ({
  useToast: () => ({ showError, showSuccess }),
}));

// Мок api-клиента: real-подобное поведение — 2xx резолвится телом,
// 4xx/5xx бросается как ApiClientError (так делает src/api/client.ts).
const postMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(async () => []),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import IntegrationsPage from './IntegrationsPage';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('IntegrationsPage: handleConnect (OFF)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('HTTP 200 + errorMessage="Connected successfully" → зелёный тост, без красного', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/connect')) {
        return {
          id: 1,
          provider: 'OFF',
          status: 'CONNECTED',
          errorMessage: 'Connected successfully', // служебное сообщение бэкенда при успехе
        };
      }
      return null;
    });

    render(<IntegrationsPage />);
    const connectBtn = await screen.findByRole('button', { name: /подключить/i });
    await userEvent.click(connectBtn);

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Успешно подключено'));
    expect(showError).not.toHaveBeenCalled();
    // Никакого текста "Connected successfully" в красных тостах быть не должно
    const errorCalls = showError.mock.calls.map(c => String(c[0]));
    expect(errorCalls.some(t => /connected successfully/i.test(t))).toBe(false);
  });

  it('HTTP 200 + статус ERROR (провайдер недоступен) → красный тост "Ошибка: ..."', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/connect')) {
        return {
          id: 1,
          provider: 'OFF',
          status: 'ERROR',
          errorMessage: 'Connection refused',
        };
      }
      return null;
    });

    render(<IntegrationsPage />);
    const connectBtn = await screen.findByRole('button', { name: /подключить/i });
    await userEvent.click(connectBtn);

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showSuccess).not.toHaveBeenCalled();
    const msg = String(showError.mock.calls[0][0]);
    expect(msg).toContain('Ошибка');
    expect(msg).toContain('Connection refused');
  });

  it('HTTP 500 ProblemDetail → красный тост с detail из err.response-подобной ошибки', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/connect')) {
        const res = await jsonResponse(500, {
          status: 500,
          title: 'Internal Server Error',
          detail: 'Provider is not available',
        });
        const err: any = new Error(res.status + '');
        err.name = 'ApiClientError';
        err.error = { status: 500, title: 'Internal Server Error', detail: 'Provider is not available' };
        throw err;
      }
      return null;
    });

    render(<IntegrationsPage />);
    const connectBtn = await screen.findByRole('button', { name: /подключить/i });
    await userEvent.click(connectBtn);

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showSuccess).not.toHaveBeenCalled();
    const msg = String(showError.mock.calls[0][0]);
    expect(msg).toContain('Provider is not available');
  });
});
