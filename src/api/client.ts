/**
 * CR-5: Единая точка входа в данные
 * Два адаптера: mock (in-memory + localStorage) и real (fetch + VITE_API_URL)
 * Выбор режима: localStorage → VITE_API_MODE → auto-пинг GET /api/v1/meta
 */

import type { UnitOfMeasure } from '../types';

export interface ApiError {
  status: number;
  type?: string;
  title: string;
  detail?: string;
  instance?: string;
  errors?: Array<{ field: string; message: string; rejectedValue?: unknown }>;
  usedIn?: Array<{ resourceType: string; resourceId: number; resourceName: string }>;
}

export class ApiClientError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.detail || error.title);
    this.name = 'ApiClientError';
  }
}

export type ApiMode = 'mock' | 'real';

const SEED_VERSION = '1.0.0';
const LS_MODE_KEY = 'apiMode';
const LS_SEED_KEY = 'seedVersion';

export class ApiClient {
  private mode: ApiMode = 'mock';
  private baseUrl: string;
  private modeResolved = false;
  private resolvePromise: Promise<void> | null = null;

  constructor() {
    // NOTE: window['meta'] — намеренно нестатический доступ: Vite заменяет статическое
    // обращение import.meta.env.* на литералы при сборке, из-за чего тестовые подмены
    // (vi.stubEnv / присваивание) не применяются. В браузере window.meta пуст → fallback.
    // window.meta.env — канал подмены env в тестах; сам объект meta может быть
    // задан без вложенного env, поэтому берём env из meta с fallback.
    const injectedMeta = (window as unknown as { meta?: { env?: Record<string, string> } }).meta;
    const env: Record<string, string> =
      injectedMeta?.env ??
      injectedMeta ??
      ((import.meta as any).env || {});
    this.baseUrl = env.VITE_API_URL || 'http://localhost:8080/api/v1';
    
    const storedMode = localStorage.getItem(LS_MODE_KEY) as ApiMode | null;
    const envMode = env.VITE_API_MODE as ApiMode | undefined;
    
    if (storedMode === 'mock' || storedMode === 'real') {
      this.mode = storedMode;
      this.modeResolved = true;
    } else if (envMode === 'mock' || envMode === 'real') {
      this.mode = envMode;
      this.modeResolved = true;
    } else {
      this.mode = 'mock'; // default
    }
    
    // Проверка seedVersion
    const storedSeed = localStorage.getItem(LS_SEED_KEY);
    if (storedSeed !== SEED_VERSION) {
      localStorage.setItem(LS_SEED_KEY, SEED_VERSION);
      // При смене версии сида можно очистить данные
    }
  }

  getMode(): ApiMode {
    return this.mode;
  }

  isResolved(): boolean {
    return this.modeResolved;
  }

  async resolveMode(): Promise<ApiMode> {
    if (this.modeResolved) return this.mode;
    if (this.resolvePromise) return this.resolvePromise.then(() => this.mode);
    
    this.resolvePromise = (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 700);
        
        const response = await fetch(`${this.baseUrl}/meta`, {
          signal: controller.signal,
          method: 'GET'
        });
        clearTimeout(timeout);
        
        if (response.ok) {
          this.mode = 'real';
        }
      } catch {
        this.mode = 'mock';
      } finally {
        this.modeResolved = true;
        localStorage.setItem(LS_MODE_KEY, this.mode);
      }
    })();
    
    await this.resolvePromise;
    return this.mode;
  }

  setMode(mode: ApiMode) {
    this.mode = mode;
    this.modeResolved = true;
    localStorage.setItem(LS_MODE_KEY, mode);
  }

  resetSeedData() {
    localStorage.removeItem(LS_SEED_KEY);
    localStorage.removeItem('mockData');
    localStorage.setItem(LS_SEED_KEY, SEED_VERSION);
  }

  private getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { failMode?: string; params?: Record<string, string> }
  ): Promise<T> {
    // Авто-резолв режима если ещё не определён
    if (!this.modeResolved) {
      await this.resolveMode();
    }

    let fullPath = path;
    if (options?.params) {
      const params = new URLSearchParams(options.params);
      fullPath += (path.includes('?') ? '&' : '?') + params.toString();
    }

    if (this.mode === 'mock') {
      // Имитация задержки 200-400 мс
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
      
      // Режим ошибок для тестирования
      if (options?.failMode && fullPath.includes(options.failMode)) {
        throw new ApiClientError({
          status: 500,
          title: 'Mock Server Error',
          detail: `Simulated failure for route: ${options.failMode}`
        });
      }
      
      const { mockServer } = await import('./mockServer');
      return mockServer.handleRequest<T>(method, fullPath, body);
    }

    // Real API
    const url = `${this.baseUrl}${fullPath}`;
    const token = this.getToken();
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      let errorData: ApiError;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          status: response.status,
          title: 'Unknown Error',
          detail: response.statusText
        };
      }
      throw new ApiClientError(errorData);
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  async get<T>(path: string, options?: { failMode?: string; params?: Record<string, string> }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async del<T>(path: string, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

export const api = new ApiClient();

// Утилиты для контракта
export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  KG: 'кг',
  L: 'л',
  PCS: 'шт',
  PACK: 'уп'
};

export function humanize(amount: number, unit: UnitOfMeasure): string {
  if (amount == null || isNaN(amount)) return '—';
  switch (unit) {
    case 'KG':
      return amount < 1 ? `${Math.round(amount * 1000)} г` : `${amount.toFixed(2)} кг`;
    case 'L':
      return amount < 1 ? `${Math.round(amount * 1000)} мл` : `${amount.toFixed(2)} л`;
    case 'PCS':
      return `${Math.round(amount)} шт`;
    case 'PACK':
      return `${Math.round(amount)} уп`;
    default:
      return `${amount}`;
  }
}

export function formatMoney(value: number | null | undefined, currency = 'RUB'): string {
  if (value == null) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency === 'RUB' ? '₽' : currency}`;
}
