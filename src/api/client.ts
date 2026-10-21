/**
 * CR-5: Единая точка входа в данные
 * Два адаптера: mock (по умолчанию в превью) и real (для продакшена)
 */

export interface ApiResponse<T> {
  data: T;
  status: number;
  error?: string;
}

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}

class ApiClient {
  private baseUrl: string;
  private mode: 'mock' | 'real';

  constructor() {
    // CR-5.1: авто-детект режима
    const storedMode = localStorage.getItem('apiMode');
    const envMode = (import.meta as any).env?.VITE_API_MODE;
    
    if (storedMode === 'mock' || storedMode === 'real') {
      this.mode = storedMode;
    } else if (envMode === 'mock' || envMode === 'real') {
      this.mode = envMode;
    } else {
      this.mode = 'mock'; // По умолчанию mock в превью
    }
    
    this.baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080/api/v1';
  }

  getMode(): 'mock' | 'real' {
    return this.mode;
  }

  setMode(mode: 'mock' | 'real') {
    this.mode = mode;
    localStorage.setItem('apiMode', mode);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    options?: { failMode?: string }
  ): Promise<T> {
    // Имитация задержки 200-400 мс для mock
    if (this.mode === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
      
      // Режим ошибок для тестирования
      if (options?.failMode && path.includes(options.failMode)) {
        throw { status: 500, message: 'Mock server error', detail: 'Simulated failure' };
      }
      
      // Импортируем mock server динамически
      const { mockServer } = await import('./mockServer');
      return mockServer.handleRequest(method, path, body);
    }

    // Real API
    const url = `${this.baseUrl}${path}`;
    const token = localStorage.getItem('accessToken');
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw { status: response.status, message: error.title || 'Error', detail: error.detail };
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  async get<T>(path: string, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: any, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: any, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async del<T>(path: string, options?: { failMode?: string }): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

export const api = new ApiClient();
