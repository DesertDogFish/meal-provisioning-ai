import { FieldError } from '../types/errors';

import { ValidationError } from './errors';
// UX-осмотр 31.10 (п.2): тексты ошибок — человеческие RU, единый маппинг field→копи.
import { blankMessage, fieldLabel, fieldLabelGenitive, PASSWORD_MIN_LENGTH, passwordTooShort } from './validationMessages';

/**
 * Validation rules - analog of Jakarta Bean Validation annotations
 * @NotNull, @NotBlank, @Email, @Size, @Positive, @Min, @Max, @Pattern, @FutureOrPresent
 *
 * Сообщения — RU (подзадача 2 осмотра 31.10): раньше пользователь видел
 * техническое «startDate must not be blank». Правила и `FieldError.field`
 * не изменились (контракт с бэком сохранён), изменился только текст.
 * `subject` — контекстная формулировка, когда одно поле значит разное
 * в разных формах («название похода» vs «название блюда»).
 */

export type Validator<T> = (value: T, fieldName: string) => string | null;

// ============ Individual Validators ============

export function notNull<T>(value: T | null | undefined, fieldName: string, subject?: string): string | null {
  if (value === null || value === undefined) {
    return blankMessage(fieldName, subject);
  }
  return null;
}

export function notBlank(value: string | null | undefined, fieldName: string, subject?: string): string | null {
  if (!value || value.trim().length === 0) {
    return blankMessage(fieldName, subject);
  }
  return null;
}

export function email(value: string | null | undefined, _fieldName: string): string | null {
  if (!value) return null; // Use notBlank for required check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return 'Укажите корректный адрес эл. почты';
  }
  return null;
}

export function size(value: string, fieldName: string, min: number, max: number): string | null {
  if (!value) return null;
  if (value.length < min || value.length > max) {
    return `${fieldLabel(fieldName)}: от ${min} до ${max} символов`;
  }
  return null;
}

export function positive(value: number | null | undefined, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  if (value <= 0) {
    return `${fieldLabel(fieldName)}: значение должно быть больше нуля`;
  }
  return null;
}

export function min(value: number | null | undefined, fieldName: string, minValue: number): string | null {
  if (value === null || value === undefined) return null;
  if (value < minValue) {
    return `${fieldLabel(fieldName)}: не меньше ${minValue}`;
  }
  return null;
}

export function max(value: number | null | undefined, fieldName: string, maxValue: number): string | null {
  if (value === null || value === undefined) return null;
  if (value > maxValue) {
    return `${fieldLabel(fieldName)}: не больше ${maxValue}`;
  }
  return null;
}

export function pattern(value: string | null | undefined, fieldName: string, regex: RegExp, message?: string): string | null {
  if (!value) return null;
  if (!regex.test(value)) {
    return message || `${fieldLabel(fieldName)}: неверный формат`;
  }
  return null;
}

export function futureOrPresent(value: string | null | undefined, fieldName: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return `${fieldLabel(fieldName)}: дата не может быть в прошлом`;
  }
  return null;
}

export function dateAfterOrEqual(value: string, fieldName: string, afterDate: string, afterFieldName: string): string | null {
  if (!value || !afterDate) return null;
  if (new Date(value) < new Date(afterDate)) {
    return `${fieldLabel(fieldName)} не может быть раньше ${fieldLabelGenitive(afterFieldName)}`;
  }
  return null;
}

export function oneOf<T>(value: T | null | undefined, fieldName: string, allowed: T[]): string | null {
  if (value === null || value === undefined) return null;
  if (!allowed.includes(value)) {
    return `${fieldLabel(fieldName)}: допустимые значения — ${allowed.join(', ')}`;
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
    { field: 'name', value: data.name, validators: [(v, f) => notBlank(v as string, f, 'название похода')] },
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
    // Пароль — синхронно с бэкендом (RegisterRequest @Size(min=8, max=100),
    // подзадача 4.5 аудита 02.11.2026): короткий пароль получает адресную копи
    // passwordTooShort(), а не «от 8 до 100 символов».
    { field: 'password', value: data.password, validators: [(v, f) => notBlank(v as string, f), (v, f) => ((v as string).length < PASSWORD_MIN_LENGTH ? passwordTooShort() : size(v as string, f, PASSWORD_MIN_LENGTH, 100))] },
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
    { field: 'name', value: data.name, validators: [(v, f) => notBlank(v as string, f, 'название продукта'), (v, f) => size(v as string, f, 1, 100)] },
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
    { field: 'name', value: data.name, validators: [(v, f) => notBlank(v as string, f, 'название блюда')] },
    { field: 'mealType', value: data.mealType, validators: [(v, f) => oneOf(v as string, f, ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'])] },
    { field: 'baseServings', value: data.baseServings, validators: [(v, f) => positive(v as number, f)] },
    {
      field: 'ingredients',
      value: data.ingredients,
      validators: [(v, _f) => {
        if (!v || (Array.isArray(v) && v.length === 0)) {
          return 'Добавьте хотя бы один ингредиент';
        }
        return null;
      }],
    },
  ]);
}
