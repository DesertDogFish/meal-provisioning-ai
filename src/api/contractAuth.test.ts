/**
 * CONTRACT-AUTH: парольная политика регистрации — mock и backend говорят одно (R3).
 *
 * Подзадача 4.5 плана plans/2026-11-02-audit-security-usability-ui.md: минимум
 * длины пароля поднят 6 → 8 (NIST SP 800-63B). Эталон формы — бэкенд:
 * `RegisterRequest` `@Size(min = 8, max = 100)` + `GlobalExceptionHandler
 * .handleValidation(MethodArgumentNotValidException)` (integration-эталон —
 * `AuthIntegrationTest` AUTH-10: 400, `errors[field=password]`). Мок обязан
 * отдавать ту же ФОРМУ: title "Validation Error", detail "Validation failed",
 * errors[{field, message}] — тогда `humanizeFieldError` локализует обе цели
 * одинаково («Пароль: не короче 8 символов»).
 *
 * Запуск: `npm run test:contract` или `npx vitest run src/api/contractAuth.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';
import {
  humanizeFieldError,
  PASSWORD_MIN_LENGTH,
  passwordTooShort,
} from '../utils/validationMessages';

let seq = 0;
const register = (password: string) =>
  mockServer.handleRequest<any>('POST', '/auth/register', {
    email: `contract-auth-${Date.now()}-${seq++}@example.com`,
    password,
    firstName: 'Контракт',
    lastName: 'Тестов',
  });

describe('CONTRACT-AUTH: пароль ≥ 8 символов (mock-паритет RegisterRequest)', () => {
  it('пароль 7 символов → 400 в форме ErrorResponse.handleValidation', () => {
    let err: any = null;
    try {
      register('1234567');
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeNull();
    expect(err.status).toBe(400);
    expect(err.title).toBe('Validation Error');
    expect(err.detail).toBe('Validation failed');
    expect(Array.isArray(err.errors)).toBe(true);
    const pwd = err.errors.find((x: any) => x.field === 'password');
    expect(pwd).toBeTruthy();
    expect(pwd.message).toBe('size must be between 8 and 100 characters');
  });

  it(`пароль ${PASSWORD_MIN_LENGTH} символов → регистрация в форме AUTH-01 (юзер + пара токенов)`, () => {
    const res = register('12345678');
    expect(res.id).toBeTruthy();
    expect(res.role).toBe('USER');
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
    expect(res.tokenType).toBe('Bearer');
  });

  it('техническое сообщение бэка/мока локализуется единой копией', () => {
    expect(
      humanizeFieldError({
        field: 'password',
        message: 'size must be between 8 and 100 characters',
      }),
    ).toBe(passwordTooShort(PASSWORD_MIN_LENGTH));
    expect(passwordTooShort()).toBe('Пароль: не короче 8 символов');
  });
});
