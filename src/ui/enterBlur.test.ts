/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { installEnterBlur } from './enterBlur';

describe('installEnterBlur — «Готово» закрывает экранную клавиатуру', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = installEnterBlur();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  const enter = (el: HTMLElement) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };

  it('числовое поле теряет фокус по Enter', () => {
    const input = document.createElement('input');
    input.type = 'number';
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);
    enter(input);
    expect(document.activeElement).not.toBe(input);
  });

  it('поле с inputmode=decimal тоже блюрится', () => {
    const input = document.createElement('input');
    input.setAttribute('inputmode', 'decimal');
    document.body.appendChild(input);
    input.focus();
    enter(input);
    expect(document.activeElement).not.toBe(input);
  });

  it('текстовый поиск не трогаем (Enter там выбирает совпадение)', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.focus();
    enter(input);
    expect(document.activeElement).toBe(input);
  });
});
