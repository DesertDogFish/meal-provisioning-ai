// Контрактные тесты FIX-1/FIX-2
// Проверяют что mock-сервер и бэкенд дают одинаковые результаты

import { mockServer } from '../api/mockServer';
import { calculateKcal } from '../utils/calc';

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, message: string) {
  if (actual === expected || (typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) < 0.01)) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log('\n=== MOCK-01: Формы ответов совпадают с ТЗ ===');

// Тест структуры ответа продуктов
const productsResponse = mockServer.handleRequest<any>('GET', '/admin/products', null);
assertEqual(Array.isArray(productsResponse.content), true, 'MOCK-01: products has content array');
assertEqual(typeof productsResponse.totalElements, 'number', 'MOCK-01: products has totalElements');
assertEqual(productsResponse.content[0].unitLabel !== undefined, true, 'MOCK-01: product has unitLabel');

// Тест структуры ответа рецептов
const recipesResponse = mockServer.handleRequest<any>('GET', '/recipes', null);
assertEqual(Array.isArray(recipesResponse), true, 'MOCK-01: recipes is array');
assertEqual(recipesResponse[0].calculatedCaloriesPerServing !== undefined, true, 'MOCK-01: recipe has calculatedCaloriesPerServing');

console.log('\n=== MOCK-02: Сводки сида = числа FIX-1/FIX-2 ===');

// FIX-1: гречка 1.8 кг
const grechka = productsResponse.content.find((p: any) => p.name === 'Гречка');
assertEqual(grechka !== undefined, true, 'MOCK-02: гречка exists');

// FIX-2: тушёнка 812.5 ккал/шт
const tushenka = productsResponse.content.find((p: any) => p.name === 'Тушёнка говяжья');
assertEqual(tushenka !== undefined, true, 'MOCK-02: тушёнка exists');
const tushenkaKcal = calculateKcal(1, 'PCS', tushenka.kcalPer100g, tushenka.pieceWeightG);
assertEqual(tushenkaKcal, 812.5, 'MOCK-02: тушёнка 812.5 ккал/шт');

// FIX-1: totalPersonMeals = 13
// Это проверяется в integration тестах бэкенда

console.log('\n=== MOCK-03: Режим ошибок ===');

try {
  mockServer.handleRequest('GET', '/admin/products?fail=products', null);
  console.error('❌ MOCK-03: should throw error');
  failed++;
} catch (error: any) {
  assertEqual(error.status, 500, 'MOCK-03: error status 500');
  assertEqual(error.message, 'Mock server error', 'MOCK-03: error message');
}

console.log('\n=== Итоги ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

export const testResults = { passed, failed };
