/**
 * Подзадача 24 (план plans/2026-10-29-full-audit.md): unit-тесты authInterceptor —
 * single-flight refresh (P0.5#1), 401-retry, исключение /auth/*, очистка сессии
 * и событие auth:session-lost.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthInterceptor } from './authInterceptor';

const BASE = 'http://test.local/api/v1';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthInterceptor.refreshTokens — single-flight (P0.5#1)', () => {
  it('нет refresh-токена → false без запроса', async () => {
    const auth = new AuthInterceptor();
    await expect(auth.refreshTokens(BASE)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('успех: access сохранён, ротированный refresh сохранён', async () => {
    localStorage.setItem('refreshToken', 'r-old');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { accessToken: 'a-new', refreshToken: 'r-new' }));
    const auth = new AuthInterceptor();
    await expect(auth.refreshTokens(BASE)).resolves.toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('a-new');
    expect(localStorage.getItem('refreshToken')).toBe('r-new');
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/auth/refresh`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'r-old' })
    }));
  });

  it('параллельные вызовы ждут ОДИН общий запрос (single-flight), lock сбрасывается после', async () => {
    localStorage.setItem('refreshToken', 'r-1');
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(res => { release = res; }));
    const auth = new AuthInterceptor();

    const p1 = auth.refreshTokens(BASE);
    const p2 = auth.refreshTokens(BASE);
    expect(p1).toBe(p2); // тот же промис — гонки ротации нет
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(jsonResponse(200, { accessToken: 'a-2' }));
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(true);

    // после завершения lock сброшен — следующий вызов делает новый запрос
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { accessToken: 'a-3' }));
    await expect(auth.refreshTokens(BASE)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem('accessToken')).toBe('a-3');
  });

  it('401/500 от refresh или пустой accessToken → false', async () => {
    localStorage.setItem('refreshToken', 'r-1');
    const auth = new AuthInterceptor();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { title: 'Unauthorized' }));
    await expect(auth.refreshTokens(BASE)).resolves.toBe(false);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { refreshToken: 'r-x' }));
    await expect(auth.refreshTokens(BASE)).resolves.toBe(false);
  });

  it('сетевая ошибка → false (без исключения)', async () => {
    localStorage.setItem('refreshToken', 'r-1');
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const auth = new AuthInterceptor();
    await expect(auth.refreshTokens(BASE)).resolves.toBe(false);
  });
});

describe('AuthInterceptor.retryOnUnauthorized', () => {
  const unauthorized = () => new Response('{}', { status: 401 });

  it('не-401 → ответ как есть, без refresh', async () => {
    const auth = new AuthInterceptor();
    const ok = jsonResponse(200, { x: 1 });
    const result = await auth.retryOnUnauthorized({
      response: ok, path: '/trips', method: 'GET', url: `${BASE}/trips`, baseUrl: BASE
    });
    expect(result).toBe(ok);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/auth/* не ретраится (иначе гонка ротации и рекурсия)', async () => {
    localStorage.setItem('accessToken', 'a');
    localStorage.setItem('refreshToken', 'r');
    const auth = new AuthInterceptor();
    const res = await auth.retryOnUnauthorized({
      response: unauthorized(), path: '/auth/login', method: 'POST',
      url: `${BASE}/auth/login`, baseUrl: BASE
    });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 без токенов → ответ как есть', async () => {
    const auth = new AuthInterceptor();
    const res = await auth.retryOnUnauthorized({
      response: unauthorized(), path: '/trips', method: 'GET', url: `${BASE}/trips`, baseUrl: BASE
    });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 + успешный refresh → повтор запроса с НОВЫМ Bearer', async () => {
    localStorage.setItem('accessToken', 'a-expired');
    localStorage.setItem('refreshToken', 'r-1');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'a-fresh' }))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: '1' }]));
    const auth = new AuthInterceptor();

    const res = await auth.retryOnUnauthorized({
      response: unauthorized(), path: '/trips', method: 'GET',
      url: `${BASE}/trips`, baseUrl: BASE
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryCall = fetchMock.mock.calls[1];
    expect(retryCall[0]).toBe(`${BASE}/trips`);
    expect((retryCall[1].headers as Record<string, string>).Authorization).toBe('Bearer a-fresh');
  });

  it('401 + неудачный refresh → сессия очищена + событие auth:session-lost', async () => {
    localStorage.setItem('accessToken', 'a-expired');
    localStorage.setItem('refreshToken', 'r-dead');
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { title: 'Unauthorized' }));
    const auth = new AuthInterceptor();
    const lost = vi.fn();
    const unsubscribe = auth.onSessionLost(lost);

    const res = await auth.retryOnUnauthorized({
      response: unauthorized(), path: '/trips', method: 'GET',
      url: `${BASE}/trips`, baseUrl: BASE
    });
    expect(res.status).toBe(401);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(lost).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe('AuthInterceptor.sendAuthHeader / sendFile', () => {
  it('Bearer добавляется только при наличии токена', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const auth = new AuthInterceptor();
    await auth.sendAuthHeader('GET', `${BASE}/trips`);
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBeUndefined();

    localStorage.setItem('accessToken', 'a-1');
    await auth.sendAuthHeader('POST', `${BASE}/trips`, { name: 'x' });
    const call = fetchMock.mock.calls[1][1];
    expect((call.headers as Record<string, string>).Authorization).toBe('Bearer a-1');
    expect(call.body).toBe(JSON.stringify({ name: 'x' }));
  });

  it('sendFile: POST c FormData и БЕЗ Content-Type (границу ставит браузер)', async () => {
    localStorage.setItem('accessToken', 'a-1');
    fetchMock.mockResolvedValue(jsonResponse(202, { logId: '7' }));
    const auth = new AuthInterceptor();
    const form = new FormData();
    await auth.sendFile(`${BASE}/admin/integrations/ROSSTAT/upload`, form);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({ Authorization: 'Bearer a-1' });
  });
});
