/**
 * Подзадача 24 (план plans/2026-10-29-full-audit.md): auth-интерсептор.
 *
 * Хранение access/refresh-токенов (localStorage), single-flight обновление
 * access-токена по refresh (P0.5#1), 401-retry незащищённых вызовов, очистка
 * сессии и событие `auth:session-lost` при безвозвратной потере.
 * Выделено из client.ts без изменения логики; состояние — на экземпляр
 * (как было в ApiClient), baseUrl передаётся вызывающим на каждый вызов
 * (тесты подменяют его после конструктора).
 */

const LS_ACCESS_KEY = 'accessToken';
const LS_REFRESH_KEY = 'refreshToken';

interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

/** Вызывается при безвозвратной потере сессии (refresh не помог) */
export type SessionLostHandler = () => void;

export function emitSessionLost() {
  window.dispatchEvent(new Event('auth:session-lost'));
}

export class AuthInterceptor {
  /**
   * P0.5#1: обновление access-токена по refresh-токену.
   * Single-flight: параллельные 401 ждут один общий refresh,
   * чтобы не устроить гонку ротации refresh-токенов на бэкенде.
   */
  private refreshPromise: Promise<boolean> | null = null;

  getToken(): string | null {
    return localStorage.getItem(LS_ACCESS_KEY);
  }

  refreshTokens(baseUrl: string): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const refreshToken = localStorage.getItem(LS_REFRESH_KEY);
      if (!refreshToken) return false;
      try {
        // fetch напрямую: этот вызов сам не должен попадать в retry-цикл
        const response = await fetch(`${baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        if (!response.ok) return false;
        const data = (await response.json()) as AuthTokens;
        if (!data.accessToken) return false;
        localStorage.setItem(LS_ACCESS_KEY, data.accessToken);
        // Бэкенд ротирует refresh-токен (старый удаляется) — сохраняем новый
        if (data.refreshToken) {
          localStorage.setItem(LS_REFRESH_KEY, data.refreshToken);
        }
        return true;
      } catch {
        return false;
      } finally {
        // сбрасываем lock асинхронно, чтобы все дождавшиеся уже получили результат
        const p = this.refreshPromise;
        this.refreshPromise = null;
        void p;
      }
    })();

    return this.refreshPromise;
  }

  clearSession() {
    localStorage.removeItem(LS_ACCESS_KEY);
    localStorage.removeItem(LS_REFRESH_KEY);
  }

  /** Подписка на событие безвозвратной потери сессии (для ProtectedRoute/Layout) */
  onSessionLost(handler: SessionLostHandler): () => void {
    window.addEventListener('auth:session-lost', handler);
    return () => window.removeEventListener('auth:session-lost', handler);
  }

  async sendAuthHeader(
    method: string,
    url: string,
    body?: unknown
  ): Promise<Response> {
    const token = this.getToken();
    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  /**
   * Отправка multipart-тела (загрузка файла). Content-Type НЕ ставим: браузер
   * сам подставляет его вместе с границей multipart — ручной заголовок ломает запрос.
   */
  async sendFile(url: string, form: FormData): Promise<Response> {
    const token = this.getToken();
    return fetch(url, {
      method: 'POST',
      headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      body: form
    });
  }

  /**
   * P0.5#1: 401 от protected-эндпоинта → один refresh + повтор исходного запроса.
   * Запросы к /auth/* не ретраим (иначе гонка ротации и рекурсия).
   * Неудачный refresh → очистка сессии + `auth:session-lost`.
   *
   * @returns исходный ответ (не 401 / нет токенов) или ответ повторного запроса
   */
  async retryOnUnauthorized(params: {
    response: Response;
    /** путь без baseUrl — по нему определяем /auth/*-исключение */
    path: string;
    method: string;
    url: string;
    body?: unknown;
    baseUrl: string;
  }): Promise<Response> {
    let { response } = params;
    if (
      response.status === 401 &&
      !params.path.startsWith('/auth/') &&
      this.getToken() &&
      localStorage.getItem(LS_REFRESH_KEY)
    ) {
      const refreshed = await this.refreshTokens(params.baseUrl);
      if (refreshed) {
        response = await this.sendAuthHeader(params.method, params.url, params.body);
      } else {
        this.clearSession();
        emitSessionLost();
      }
    }
    return response;
  }
}
