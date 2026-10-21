import { ProblemDetail, ValidationErrorDetail, ConflictErrorDetail, ErrorCode, HttpStatus, FieldError, UsedInResource } from '../types/errors';

/**
 * Base error class for application errors
 * Analog of backend ErrorResponse
 */
export class AppError extends Error {
  public readonly problemDetail: ProblemDetail;
  public readonly timestamp: Date;

  constructor(problemDetail: ProblemDetail) {
    super(problemDetail.detail || problemDetail.title);
    this.name = 'AppError';
    this.problemDetail = problemDetail;
    this.timestamp = new Date();
  }

  /**
   * Convert to ProblemDetail object
   */
  toProblemDetail(): ProblemDetail {
    return {
      ...this.problemDetail,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(errors: FieldError[], detail?: string) {
    const problemDetail: ValidationErrorDetail = {
      type: 'about:blank',
      title: 'Validation Error',
      status: HttpStatus.BAD_REQUEST,
      detail: detail || 'One or more fields failed validation',
      errors,
    };
    super(problemDetail);
    this.name = 'ValidationError';
  }

  get errors(): FieldError[] {
    return (this.problemDetail as ValidationErrorDetail).errors;
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(detail: string = 'Authentication required') {
    super({
      type: 'about:blank',
      title: 'Unauthorized',
      status: HttpStatus.UNAUTHORIZED,
      detail,
    });
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends AppError {
  constructor(detail: string = 'Access denied') {
    super({
      type: 'about:blank',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      detail,
    });
    this.name = 'ForbiddenError';
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super({
      type: 'about:blank',
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: id ? `${resource} with id '${id}' not found` : `${resource} not found`,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(detail: string, usedIn?: UsedInResource[]) {
    const problemDetail: ConflictErrorDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail,
      usedIn,
    };
    super(problemDetail);
    this.name = 'ConflictError';
  }

  get usedIn(): UsedInResource[] | undefined {
    return (this.problemDetail as ConflictErrorDetail).usedIn;
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends AppError {
  constructor(detail: string = 'An unexpected error occurred') {
    super({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail,
    });
    this.name = 'InternalError';
  }
}

/**
 * Invalid operation error (400)
 */
export class InvalidOperationError extends AppError {
  constructor(detail: string) {
    super({
      type: 'about:blank',
      title: 'Invalid Operation',
      status: HttpStatus.BAD_REQUEST,
      detail,
    });
    this.name = 'InvalidOperationError';
  }
}
