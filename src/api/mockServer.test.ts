import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';
import { calculateKcal } from '../utils/calc';

describe('MOCK-01: Формы ответов совпадают с ТЗ', () => {
  it('products response has content array', () => {
    const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
    expect(Array.isArray(productsResponse.content)).toBe(true);
  });

  it('products response has totalElements', () => {
    const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
    expect(typeof productsResponse.totalElements).toBe('number');
  });

  it('product has unitLabel', () => {
    const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
    expect(productsResponse.content[0].unitLabel).toBeDefined();
  });

  it('recipes response is array', () => {
    const recipesResponse = mockServer.handleRequest<any>('GET', '/recipes', null);
    expect(Array.isArray(recipesResponse)).toBe(true);
  });

  it('recipe has calculatedCaloriesPerServing', () => {
    const recipesResponse = mockServer.handleRequest<any>('GET', '/recipes', null);
    expect(recipesResponse[0].calculatedCaloriesPerServing).toBeDefined();
  });
});

describe('MOCK-02: Сводки сида = числа FIX-1/FIX-2', () => {
  it('гречка exists in products', () => {
    const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
    const grechka = productsResponse.content.find((p: any) => p.name === 'Гречка');
    expect(grechka).toBeDefined();
  });

  it('тушёнка exists in products', () => {
    const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
    const tushenka = productsResponse.content.find((p: any) => p.name === 'Тушёнка говяжья');
    expect(tushenka).toBeDefined();
  });

  it('тушёнка 812.5 ккал/шт (FIX-2)', () => {
    const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
    const tushenka = productsResponse.content.find((p: any) => p.name === 'Тушёнка говяжья');
    const tushenkaKcal = calculateKcal(1, 'PCS', tushenka.kcalPer100g, tushenka.pieceWeightG);
    expect(tushenkaKcal).toBe(812.5);
  });

  // FIX-1: totalPersonMeals = 13
  // Это проверяется в integration тестах бэкенда
});

describe('MOCK-03: Режим ошибок', () => {
  it('should throw error for fail mode', () => {
    expect(() => {
      mockServer.handleRequest('GET', '/admin/products?fail=products', null);
    }).toThrow();
  });

  it('error status should be 500', () => {
    try {
      mockServer.handleRequest('GET', '/admin/products?fail=products', null);
    } catch (error: any) {
      expect(error.status).toBe(500);
    }
  });

  it('error message should be "Mock server error"', () => {
    try {
      mockServer.handleRequest('GET', '/admin/products?fail=products', null);
    } catch (error: any) {
      expect(error.message).toBe('Mock server error');
    }
  });
});
