/**
 * RFC 7807 Problem Details for HTTP APIs
 * https://datatracker.ietf.org/doc/html/rfc7807
 */

export interface ProblemDetail {
  /** A URI reference that identifies the problem type */
  type: string;
  /** A short, human-readable summary of the problem type */
  title: string;
  /** The HTTP status code */
  status: number;
  /** A human-readable explanation specific to this occurrence */
  detail?: string;
  /** A URI reference that identifies the specific occurrence */
  instance?: string;
  /** Additional custom properties */
  [key: string]: unknown;
}

/**
 * Validation error detail
 */
export interface ValidationErrorDetail extends ProblemDetail {
  /** List of field validation errors */
  errors: FieldError[];
}

export interface FieldError {
  /** Field name that failed validation */
  field: string;
  /** Error message for this field */
  message: string;
  /** Rejected value */
  rejectedValue?: unknown;
}

/**
 * Conflict error detail (for used resources)
 */
export interface ConflictErrorDetail extends ProblemDetail {
  /** List of resources that use this entity */
  usedIn?: UsedInResource[];
}

export interface UsedInResource {
  /** Resource type (e.g., 'recipe', 'trip') */
  resourceType: string;
  /** Resource ID */
  resourceId: string;
  /** Resource name for display */
  resourceName: string;
}

/**
 * Error codes matching backend specification
 */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_OPERATION = 'INVALID_OPERATION',
  MISSING_PRICE = 'MISSING_PRICE',
}

/**
 * HTTP status codes
 */
export enum HttpStatus {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}
