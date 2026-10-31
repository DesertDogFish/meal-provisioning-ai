/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 3, KB-32).
 *
 * Контракт текстового поля даты: пользователь видит и набирает ДД.ММ.ГГГГ,
 * форма/бэкенд хранят ISO YYYY-MM-DD. Тест — на чистом парсере/форматтере
 * (R2: слой утилиты); поведение компонента — в DatePicker.test.tsx.
 */
import { describe, expect, it } from 'vitest';
import {
  parseDateInput, formatDateInput, isCompleteDateText, DATE_INPUT_PATTERN,
} from './dateInput';

describe('parseDateInput — набор с клавиатуры → ISO', () => {
  it('ДД.ММ.ГГГГ и Д.М.ГГГГ', () => {
    expect(parseDateInput('10.11.2026')).toBe('2026-11-10');
    expect(parseDateInput('1.7.2026')).toBe('2026-07-01');
    expect(parseDateInput(' 05.03.2027 ')).toBe('2027-03-05');
  });
  it('слэш-разделитель тоже принимается (раскладка/привычка)', () => {
    expect(parseDateInput('10/11/2026')).toBe('2026-11-10');
  });
  it('ISO-ввод сохраняется (e2e fill и вставка из буфера)', () => {
    expect(parseDateInput('2026-11-10')).toBe('2026-11-10');
    expect(parseDateInput('2026-1-5')).toBe('2026-01-05');
  });
  it('двухзначный год → 20xx', () => {
    expect(parseDateInput('10.11.26')).toBe('2026-11-10');
  });
  it('несуществующая дата и мусор → пустая строка', () => {
    expect(parseDateInput('31.02.2026')).toBe('');
    expect(parseDateInput('00.00.2026')).toBe('');
    expect(parseDateInput('10.11')).toBe('');
    expect(parseDateInput('привет')).toBe('');
    expect(parseDateInput('')).toBe('');
    expect(parseDateInput('10.11.20266')).toBe('');
  });
});

describe('formatDateInput — ISO → то, что видит пользователь', () => {
  it('значение поля в ДД.ММ.ГГГГ, а не ISO (KB-32)', () => {
    expect(formatDateInput('2026-10-10')).toBe('10.10.2026');
    expect(formatDateInput('2026-01-05')).toBe('05.01.2026');
  });
  it('пусто/мусор → пустая строка (виден плейсхолдер)', () => {
    expect(formatDateInput('')).toBe('');
    expect(formatDateInput(null)).toBe('');
    expect(formatDateInput(undefined)).toBe('');
    expect(formatDateInput('не дата')).toBe('');
  });
  it('входящий ДД.ММ.ГГГГ не портится (идемпотентность)', () => {
    expect(formatDateInput('10.10.2026')).toBe('10.10.2026');
  });
});

describe('isCompleteDateText — коммит на вводе, а не только на blur', () => {
  it('полный текст коммитится сразу (Playwright fill не делает blur)', () => {
    expect(isCompleteDateText('10.11.2026')).toBe(true);
    expect(isCompleteDateText('2026-11-10')).toBe(true);
  });
  it('частичный ввод не коммитится', () => {
    expect(isCompleteDateText('10.11')).toBe(false);
    expect(isCompleteDateText('10.11.20')).toBe(false);
    expect(isCompleteDateText('')).toBe(false);
  });
  it('подсказка формата — ДД.ММ.ГГГГ', () => {
    expect(DATE_INPUT_PATTERN).toBe('ДД.ММ.ГГГГ');
  });
});
