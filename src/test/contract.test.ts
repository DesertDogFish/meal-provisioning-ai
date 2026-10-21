/// <reference types="vitest/globals" />
/**
 * Контрактные тесты FIX-1/FIX-2
 * Проверяют, что mock и real API дают одинаковые результаты
 * 
 * Запуск:
 * - CONTRACT_TARGET=mock npm test contract
 * - CONTRACT_TARGET=real npm test contract
 */

import { api } from '../api/client';

// Фикстура FIX-1: Поход 12-14 мая, люди 4/3/2
const FIX1_TRIP_ID = 'trip1';

// Фикстура FIX-2: Оверрайды цен
const FIX2_OVERRIDES = {
  grechka: 250, // план 200
  tushenka: 190, // план 210
  sol: 30 // плана нет
};

// Ожидаемые значения из ТЗ
const EXPECTED = {
  // Количество продуктов
  grechka: 1.8, // KG
  tushenka: 9, // PCS
  sol: 0.045, // KG
  
  // Плановая стоимость
  planGrechka: 360, // 1.8 * 200
  planTushenka: 1890, // 9 * 210
  planTotal: 2343, // 360 + 1890 + 48 + 45
  
  // Фактическая стоимость (с оверрайдами)
  actualGrechka: 450, // 1.8 * 250
  actualTushenka: 1710, // 9 * 190
  actualSol: 1.35, // 0.045 * 30
  actualTotal: 2254.35, // 450 + 1710 + 48 + 45 + 1.35
  
  // Дельта
  deltaPercent: -3.78, // (2254.35 - 2343) / 2343 * 100
  
  // На человека
  perPerson: 563.59, // 2254.35 / 4
  perPersonMeal: 173.41 // 2254.35 / 13
};

describe('Контрактные тесты FIX-1/FIX-2', () => {
  const target = (import.meta as any).env?.CONTRACT_TARGET || 'mock';
  
  beforeAll(async () => {
    // Устанавливаем режим
    api.setMode(target as any);
    
    // Ждём инициализации
    await new Promise(resolve => setTimeout(resolve, 500));
  });
  
  describe('FIX-1: Базовые расчёты', () => {
    it('должен вернуть правильный список закупок', async () => {
      const shopping = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/shopping`);
      
      expect(shopping).toBeDefined();
      expect(shopping.items).toBeDefined();
      expect(Array.isArray(shopping.items)).toBe(true);
      
      // Проверяем наличие ключевых продуктов
      const grechka = shopping.items.find((i: any) => i.ingredientName === 'Гречка');
      const tushenka = shopping.items.find((i: any) => i.ingredientName === 'Тушёнка говяжья');
      const sol = shopping.items.find((i: any) => i.ingredientName === 'Соль');
      
      expect(grechka).toBeDefined();
      expect(tushenka).toBeDefined();
      expect(sol).toBeDefined();
      
      // Проверяем количества
      expect(grechka.totalAmount).toBeCloseTo(EXPECTED.grechka, 2);
      expect(tushenka.totalAmount).toBeCloseTo(EXPECTED.tushenka, 0);
      expect(sol.totalAmount).toBeCloseTo(EXPECTED.sol, 3);
    });
    
    it('должен вернуть правильные плановые стоимости', async () => {
      const shopping = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/shopping`);
      
      const grechka = shopping.items.find((i: any) => i.ingredientName === 'Гречка');
      const tushenka = shopping.items.find((i: any) => i.ingredientName === 'Тушёнка говяжья');
      
      // Плановые стоимости (без оверрайдов)
      expect(grechka.plannedCost).toBeCloseTo(EXPECTED.planGrechka, 0);
      expect(tushenka.plannedCost).toBeCloseTo(EXPECTED.planTushenka, 0);
    });
    
    it('должен вернуть правильную сводку на человека', async () => {
      const summary = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/person`);
      
      expect(summary).toBeDefined();
      expect(summary.tripSummary).toBeDefined();
      expect(summary.tripSummary.totalPersonMeals).toBe(13);
    });
  });
  
  describe('FIX-2: Оверрайды цен', () => {
    beforeAll(async () => {
      // Создаём оверрайды
      await api.put(`/trips/${FIX1_TRIP_ID}/price-overrides/1`, {
        ingredientId: 1,
        actualPrice: FIX2_OVERRIDES.grechka,
        comment: 'Фикстура FIX-2'
      });
      
      await api.put(`/trips/${FIX1_TRIP_ID}/price-overrides/2`, {
        ingredientId: 2,
        actualPrice: FIX2_OVERRIDES.tushenka,
        comment: 'Фикстура FIX-2'
      });
      
      await api.put(`/trips/${FIX1_TRIP_ID}/price-overrides/3`, {
        ingredientId: 3,
        actualPrice: FIX2_OVERRIDES.sol,
        comment: 'Фикстура FIX-2'
      });
    });
    
    it('должен вернуть правильные фактические стоимости с оверрайдами', async () => {
      const shopping = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/shopping`);
      
      const grechka = shopping.items.find((i: any) => i.ingredientName === 'Гречка');
      const tushenka = shopping.items.find((i: any) => i.ingredientName === 'Тушёнка говяжья');
      const sol = shopping.items.find((i: any) => i.ingredientName === 'Соль');
      
      // Фактические стоимости (с оверрайдами)
      expect(grechka.actualCost).toBeCloseTo(EXPECTED.actualGrechka, 0);
      expect(tushenka.actualCost).toBeCloseTo(EXPECTED.actualTushenka, 0);
      expect(sol.actualCost).toBeCloseTo(EXPECTED.actualSol, 2);
      
      // Проверяем, что оверрайды применены
      expect(grechka.overridden).toBe(true);
      expect(tushenka.overridden).toBe(true);
      expect(sol.overridden).toBe(true);
    });
    
    it('должен вернуть правильную общую фактическую стоимость', async () => {
      const shopping = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/shopping`);
      
      expect(shopping.totalActualCost).toBeCloseTo(EXPECTED.actualTotal, 1);
    });
    
    it('должен вернуть правильную дельту', async () => {
      const shopping = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/shopping`);
      
      expect(shopping.deltaPercent).toBeCloseTo(EXPECTED.deltaPercent, 1);
    });
    
    it('должен вернуть правильную стоимость на человека', async () => {
      const summary = await api.get<any>(`/trips/${FIX1_TRIP_ID}/summary/person`);
      
      expect(summary.tripSummary.actualCostPerDefaultPerson).toBeCloseTo(EXPECTED.perPerson, 1);
      expect(summary.tripSummary.actualCostPerPersonMeal).toBeCloseTo(EXPECTED.perPersonMeal, 1);
    });
  });
  
  describe('Калорийность (CR-1)', () => {
    it('должен рассчитать калорийность по формуле ядра', async () => {
      const recipes = await api.get<any[]>('/recipes');
      
      // Тушёнка: 250 ккал/100г, piece_weight 325г, 1 шт → 812.5 ккал
      const tushenka = recipes.find(r => r.name.includes('Тушёнка'));
      if (tushenka) {
        expect(tushenka.calculatedCaloriesPerServing).toBeCloseTo(812.5, 1);
      }
      
      // Овсянка: 350 ккал/100г, 0.08 KG → 280 ккал
      const ovsyanka = recipes.find(r => r.name.includes('Овсянка'));
      if (ovsyanka) {
        expect(ovsyanka.calculatedCaloriesPerServing).toBeCloseTo(280, 0);
      }
    });
  });
  
  describe('Единицы измерения (CR-2)', () => {
    it('должен возвращать unitLabel для всех продуктов', async () => {
      const products = await api.get<any>('/admin/products');
      
      expect(products.content).toBeDefined();
      expect(products.content.length).toBeGreaterThan(0);
      
      products.content.forEach((product: any) => {
        expect(product.unitLabel).toBeDefined();
        expect(['кг', 'л', 'шт', 'уп']).toContain(product.unitLabel);
      });
    });
  });
});
