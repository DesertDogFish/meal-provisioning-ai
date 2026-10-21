import { ProblemDetail, ValidationErrorDetail, ConflictErrorDetail } from '../types/errors';
import { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, InternalError } from './errors';

type ErrorHandler = (error: ProblemDetail) => void;

/**
 * GlobalExceptionHandler - аналог Spring Boot @ControllerAdvice
 * Централизованная обработка всех ошибок приложения
 */
class GlobalExceptionHandler {
  private handlers: Map<number, ErrorHandler[]> = new Map();
  private globalHandlers: ErrorHandler[] = [];
  private errorHistory: ProblemDetail[] = [];
  private maxHistorySize = 50;

  /**
   * Register handler for specific HTTP status
   */
  onStatus(status: number, handler: ErrorHandler): void {
    const handlers = this.handlers.get(status) || [];
    handlers.push(handler);
    this.handlers.set(status, handlers);
  }

  /**
   * Register global error handler (for all errors)
   */
  onAny(handler: ErrorHandler): void {
    this.globalHandlers.push(handler);
  }

  /**
   * Handle an error - routes to appropriate handlers
   */
  handle(error: unknown): ProblemDetail {
    const problemDetail = this.toProblemDetail(error);
    
    // Add to history
    this.errorHistory.unshift(problemDetail);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.pop();
    }

    // Log to console in development
    console.error('[GlobalExceptionHandler]', problemDetail);

    // Route to status-specific handlers
    const statusHandlers = this.handlers.get(problemDetail.status) || [];
    statusHandlers.forEach(handler => handler(problemDetail));

    // Route to global handlers
    this.globalHandlers.forEach(handler => handler(problemDetail));

    return problemDetail;
  }

  /**
   * Convert any error to ProblemDetail
   */
  private toProblemDetail(error: unknown): ProblemDetail {
    // Already a ProblemDetail
    if (this.isProblemDetail(error)) {
      return error as ProblemDetail;
    }

    // AppError (our custom errors)
    if (error instanceof AppError) {
      return error.toProblemDetail();
    }

    // Native Error
    if (error instanceof Error) {
      return {
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: error.message,
        timestamp: new Date().toISOString(),
      };
    }

    // Unknown
    return {
      type: 'about:blank',
      title: 'Unknown Error',
      status: 500,
      detail: String(error),
      timestamp: new Date().toISOString(),
    };
  }

  private isProblemDetail(obj: unknown): obj is ProblemDetail {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'type' in obj &&
      'title' in obj &&
      'status' in obj
    );
  }

  /**
   * Get error history
   */
  getHistory(): ProblemDetail[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Remove all handlers
   */
  reset(): void {
    this.handlers.clear();
    this.globalHandlers = [];
  }
}

// Singleton instance
export const globalExceptionHandler = new GlobalExceptionHandler();

// ============ Helper Functions ============

/**
 * Extract validation errors from ProblemDetail
 */
export function getValidationErrors(problemDetail: ProblemDetail): { field: string; message: string }[] {
  if ('errors' in problemDetail) {
    return (problemDetail as ValidationErrorDetail).errors.map(e => ({
      field: e.field,
      message: e.message,
    }));
  }
  return [];
}

/**
 * Extract conflict info from ProblemDetail
 */
export function getConflictInfo(problemDetail: ProblemDetail): { resourceType: string; resourceId: string; resourceName: string }[] | undefined {
  if ('usedIn' in problemDetail) {
    return (problemDetail as ConflictErrorDetail).usedIn;
  }
  return undefined;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(problemDetail: ProblemDetail): string {
  switch (problemDetail.status) {
    case 400:
      return problemDetail.detail || 'Некорректные данные';
    case 401:
      return 'Требуется авторизация';
    case 403:
      return 'Доступ запрещён';
    case 404:
      return problemDetail.detail || 'Ресурс не найден';
    case 409:
      return problemDetail.detail || 'Конфликт данных';
    case 500:
      return 'Внутренняя ошибка сервера';
    default:
      return problemDetail.detail || problemDetail.title || 'Произошла ошибка';
  }
}

/**
 * Get error color based on status
 */
export type ErrorColor = 'amber' | 'orange' | 'red' | 'blue' | 'purple' | 'slate';

export function getErrorColor(status: number): ErrorColor {
  switch (status) {
    case 400: return 'amber';
    case 401: return 'orange';
    case 403: return 'red';
    case 404: return 'blue';
    case 409: return 'purple';
    case 500: return 'red';
    default: return 'slate';
  }
}

// Re-export error classes for convenience
export { AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, InternalError };
