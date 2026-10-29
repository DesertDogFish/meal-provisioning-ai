/**
 * Подзадача 24 (план plans/2026-10-29-full-audit.md): разбор ответов бэкенда.
 *
 * 4xx/5xx → ApiClientError (RFC7807 ProblemDetail: status/type/title/detail/instance/
 * field-errors/usedIn), 204 и 200 с пустым телом → null, иначе JSON.
 * Выделено из client.ts без изменения логики; client.ts реэкспортирует ApiError/
 * ApiClientError, поэтому публичный контракт не меняется.
 */

export interface ApiError {
  status: number;
  type?: string;
  title: string;
  detail?: string;
  instance?: string;
  errors?: Array<{ field: string; message: string; rejectedValue?: unknown }>;
  // Контракт совпадает с бэкендом ErrorResponse.UsedInResource (record):
  // resourceType / resourceId / resourceName (id — число, Long→String Jackson не применяется к error-телам).
  usedIn?: Array<{ resourceType: string; resourceId: number; resourceName: string }>;
}

export class ApiClientError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.detail || error.title);
    this.name = 'ApiClientError';
  }
}

/**
 * Разбор ответа бэкенда: 4xx/5xx → ApiClientError (ProblemDetail),
 * 204/пустое тело → null, иначе JSON.
 */
export async function readEnvelope<T>(response: Response): Promise<T> {
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

  // Fix-15 (баг «Failed to execute 'json' on 'Response': Unexpected end of
  // JSON input»): эндпоинты, отвечающие 200 с ПУСТЫМ телом, роняли парсинг —
  // вызывающий код получал исключение при фактически успешной операции.
  // Пустой текст → null. Ответы-фейки в тестах могут не иметь text() — фолбэк на .json().
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (!text.trim()) return null as T;
    return JSON.parse(text) as T;
  }
  return response.json();
}
