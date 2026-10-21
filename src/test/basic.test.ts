/// <reference types="vitest/globals" />
/**
 * Простой тест для проверки работы vitest
 */

describe('Базовый тест', () => {
  it('должен работать', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('должен проверять строки', () => {
    expect('hello').toContain('hell');
  });
});
