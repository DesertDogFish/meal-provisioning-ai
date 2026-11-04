/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 2, KB-осмотр 31.10):
 * ошибки валидации формы похода показывались техническим английским
 * («startDate must not be blank») и с префиксом имени поля. Здесь — контракт
 * единого маппинга field → RU-копи: клиентские валидаторы и серверные
 * ProblemDetail.errors дают один и тот же человеческий текст (R2: слой утилиты).
 */
import { describe, expect, it } from 'vitest';

import { fieldLabel, humanizeFieldError } from './validationMessages';
import { validateTrip, validateRecipe, validateRegistration } from './validation';

describe('fieldLabel — человекочитаемое имя поля', () => {
  it('известные поля формы похода', () => {
    expect(fieldLabel('name')).toBe('Название');
    expect(fieldLabel('startDate')).toBe('Дата начала');
    expect(fieldLabel('endDate')).toBe('Дата окончания');
    expect(fieldLabel('defaultPeople')).toBe('Количество человек');
  });
  it('неизвестное поле — как есть (не «undefined»)', () => {
    expect(fieldLabel('whateverElse')).toBe('whateverElse');
    expect(fieldLabel('')).toBe('Поле');
  });
});

describe('validateTrip — RU-тексты без имён полей (подзадача 2)', () => {
  it('пустая форма: «Укажите название похода», «Укажите дату начала», «Укажите дату окончания»', () => {
    const messages = validateTrip({ name: '', startDate: '', endDate: '', defaultPeople: 4 }).map(e => e.message);
    expect(messages).toContain('Укажите название похода');
    expect(messages).toContain('Укажите дату начала');
    expect(messages).toContain('Укажите дату окончания');
    // никакого технического английского и никакого «fieldName:» внутри сообщения
    for (const m of messages) {
      expect(m).not.toMatch(/must not be|must be|blank/i);
      expect(m).not.toMatch(/^(name|startDate|endDate|defaultPeople):/);
    }
  });

  it('endDate раньше startDate → «Дата окончания не может быть раньше даты начала»', () => {
    const messages = validateTrip({
      name: 'Алтай', startDate: '2026-08-10', endDate: '2026-08-05', defaultPeople: 4,
    }).map(e => e.message);
    expect(messages).toContain('Дата окончания не может быть раньше даты начала');
  });

  it('defaultPeople <= 0 → «Количество человек: значение должно быть больше нуля»', () => {
    const messages = validateTrip({
      name: 'Алтай', startDate: '2026-08-10', endDate: '2026-08-12', defaultPeople: 0,
    }).map(e => e.message);
    expect(messages).toContain('Количество человек: значение должно быть больше нуля');
  });

  it('поле ошибки остаётся в FieldError (для логов/problemDetail)', () => {
    const errors = validateTrip({ name: '', startDate: '2026-08-10', endDate: '2026-08-12', defaultPeople: 4 });
    expect(errors.map(e => e.field)).toContain('name');
  });
});

describe('validateRecipe / validateRegistration — те же RU-шаблоны', () => {
  it('блюдо без имени и состава', () => {
    const messages = validateRecipe({ name: '', ingredients: [] }).map(e => e.message);
    expect(messages).toContain('Укажите название блюда');
    expect(messages).toContain('Добавьте хотя бы один ингредиент');
  });
  it('регистрация: некорректная почта и короткий пароль', () => {
    const messages = validateRegistration({ email: 'no-at', password: '123' }).map(e => e.message);
    expect(messages).toContain('Укажите корректный адрес эл. почты');
    expect(messages).toContain('Пароль: не короче 8 символов');
  });
});

describe('humanizeFieldError — серверный ProblemDetail.errors → RU (mock-паритет копи)', () => {
  it('английские сообщения бэка локализуются по полю', () => {
    expect(humanizeFieldError({ field: 'startDate', message: 'must not be blank' })).toBe('Укажите дату начала');
    expect(humanizeFieldError({ field: 'name', message: 'must not be blank' })).toBe('Укажите название');
    expect(humanizeFieldError({ field: 'email', message: 'must be a valid email address' }))
      .toBe('Укажите корректный адрес эл. почты');
    expect(humanizeFieldError({ field: 'password', message: 'must be between 8 and 100 characters' }))
      .toBe('Пароль: не короче 8 символов');
    expect(humanizeFieldError({ field: 'defaultPeople', message: 'must be positive' }))
      .toBe('Количество человек: значение должно быть больше нуля');
  });
  it('уже русский текст проходит как есть', () => {
    expect(humanizeFieldError({ field: 'name', message: 'Поход с таким названием уже существует' }))
      .toBe('Поход с таким названием уже существует');
  });
  it('неизвестное сообщение — как есть, без технического префикса поля', () => {
    expect(humanizeFieldError({ field: 'mystery', message: 'something odd happened' })).toBe('something odd happened');
  });
  it('неизвестное поле + шаблон blank → общий текст без технического имени', () => {
    expect(humanizeFieldError({ field: 'mystery', message: 'must not be blank' })).toBe('Заполните обязательное поле');
  });
  it('пустое сообщение → текст обязательного поля', () => {
    expect(humanizeFieldError({ field: 'endDate', message: '' })).toBe('Укажите дату окончания');
  });
});
