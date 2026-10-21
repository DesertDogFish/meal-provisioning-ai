import { FieldError } from '../types/errors';
import { ValidationError } from './errors';

/**
 * Validation rules - analog of Jakarta Bean Validation annotations
 * @NotNull, @NotBlank, @Email, @Size, @Positive, @Min, @Max, @Pattern, @FutureOrPresent
 */

export type Validator<T> = (value: T, fieldName: string) => string | null;

// ============ Individual Validators ============

export function notNull<T>(value: T | null | undefined, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return `${fieldName} must not be null`;
  }
  return null;
}

export function notBlank(value: string | null | undefined, fieldName: string): string | null {
  if (!value || value.trim().length === 0) {
    return `${fieldName} must not be blank`;
  }
  return null;
}

export function email(value: string | null | undefined, fieldName: string): string | null {
  if (!value) return null; // Use notBlank for required check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return `${fieldName} must be a valid email address`;
  }
  return null;
}

export function size(value: string, fieldName: string, min: number, max: number): string | null {
  if (!value) return null;
  if (value.length < min || value.length > max) {
    return `${fieldName} must be between ${min} and ${max} characters`;
  }
  return null;
}

export function positive(value: number | null | undefined, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  if (value <= 0) {
    return `${fieldName} must be positive`;
  }
  return null;
}

export function min(value: number | null | undefined, fieldName: string, minValue: number): string | null {
  if (value === null || value === undefined) return null;
  if (value < minValue) {
    return `${fieldName} must be at least ${minValue}`;
  }
  return null;
}

export function max(value: number | null | undefined, fieldName: string, maxValue: number): string | null {
  if (value === null || value === undefined) return null;
  if (value > maxValue) {
    return `${fieldName} must be at most ${maxValue}`;
  }
  return null;
}

export function pattern(value: string | null | undefined, fieldName: string, regex: RegExp, message?: string): string | null {
  if (!value) return null;
  if (!regex.test(value)) {
    return message || `${fieldName} has invalid format`;
  }
  return null;
}

export function futureOrPresent(value: string | null | undefined, fieldName: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return `${fieldName} must be today or in the future`;
  }
  return null;
}

export function dateAfterOrEqual(value: string, fieldName: string, afterDate: string, afterFieldName: string): string | null {
  if (!value || !afterDate) return null;
  if (new Date(value) < new Date(afterDate)) {
    return `${fieldName} must be on or after ${afterFieldName}`;
  }
  return null;
}

export function oneOf<T>(value: T | null | undefined, fieldName: string, allowed: T[]): string | null {
  if (value === null || value === undefined) return null;
  if (!allowed.includes(value)) {
    return `${fieldName} must be one of: ${allowed.join(', ')}`;
  }
  return null;
}

// ============ Validation Runner ============

export interface ValidationRule {
  field: string;
  value: unknown;
  validators: ((value: unknown, field: string) => string | null)[];
}

/**
 * Validate multiple fields and throw ValidationError if any fail
 */
export function validate(rules: ValidationRule[]): void {
  const errors: FieldError[] = [];

  for (const rule of rules) {
    for (const validator of rule.validators) {
      const error = validator(rule.value, rule.field);
      if (error) {
        errors.push({
          field: rule.field,
          message: error,
          rejectedValue: rule.value,
        });
        break; // One error per field
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

/**
 * Validate and return errors without throwing
 */
export function validateReturnErrors(rules: ValidationRule[]): FieldError[] {
  const errors: FieldError[] = [];

  for (const rule of rules) {
    for (const validator of rule.validators) {
      const error = validator(rule.value, rule.field);
      if (error) {
        errors.push({
          field: rule.field,
          message: error,
          rejectedValue: rule.value,
        });
        break;
      }
    }
  }

  return errors;
}

// ============ Domain-specific Validators ============

export function validateTrip(data: {
  name?: string;
  startDate?: string;
  endDate?: string;
  defaultPeople?: number;
}): FieldError[] {
  return validateReturnErrors([
    { field: 'name', value: data.name, validators: [(v, f) => notBlank(v as string, f)] },
    { field: 'startDate', value: data.startDate, validators: [(v, f) => notBlank(v as string, f)] },
    { field: 'endDate', value: data.endDate, validators: [(v, f) => notBlank(v as string, f)] },
    { field: 'defaultPeople', value: data.defaultPeople, validators: [(v, f) => positive(v as number, f)] },
    {
      field: 'endDate',
      value: data.endDate,
      validators: [(v, f) => dateAfterOrEqual(v as string, f, data.startDate || '', 'startDate')],
    },
  ]);
}

export function validateRegistration(data: {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}): FieldError[] {
  return validateReturnErrors([
    { field: 'email', value: data.email, validators: [(v, f) => notBlank(v as string, f), (v, f) => email(v as string, f)] },
    { field: 'password', value: data.password, validators: [(v, f) => notBlank(v as string, f), (v, f) => size(v as string, f, 6, 100)] },
    { field: 'firstName', value: data.firstName, validators: [(v, f) => notBlank(v as string, f), (v, f) => size(v as string, f, 1, 50)] },
    { field: 'lastName', value: data.lastName, validators: [(v, f) => notBlank(v as string, f), (v, f) => size(v as string, f, 1, 50)] },
  ]);
}

export function validateIngredient(data: {
  name?: string;
  unit?: string;
  category?: string;
}): FieldError[] {
  return validateReturnErrors([
    { field: 'name', value: data.name, validators: [(v, f) => notBlank(v as string, f), (v, f) => size(v as string, f, 1, 100)] },
    { field: 'unit', value: data.unit, validators: [(v, f) => oneOf(v as string, f, ['KG', 'L', 'PCS'])] },
    { field: 'category', value: data.category, validators: [(v, f) => notBlank(v as string, f)] },
  ]);
}

export function validateRecipe(data: {
  name?: string;
  mealType?: string;
  baseServings?: number;
  ingredients?: unknown[];
}): FieldError[] {
  return validateReturnErrors([
    { field: 'name', value: data.name, validators: [(v, f) => notBlank(v as string, f)] },
    { field: 'mealType', value: data.mealType, validators: [(v, f) => oneOf(v as string, f, ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'])] },
    { field: 'baseServings', value: data.baseServings, validators: [(v, f) => positive(v as number, f)] },
    {
      field: 'ingredients',
      value: data.ingredients,
      validators: [(v, f) => {
        if (!v || (Array.isArray(v) && v.length === 0)) {
          return `${f} must contain at least one ingredient`;
        }
        return null;
      }],
    },
  ]);
}
