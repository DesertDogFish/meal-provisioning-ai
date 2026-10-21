// Тесты для calc.ts
// Запуск: node src/utils/calc.test.ts

import { calculateKcal, calculateRecipeKcal, humanize, getUnitLabel } from './calc';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    console.log(`✅ ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}: expected ${expected}, got ${actual}`);
    failed++;
  }
}

console.log('\n=== KCAL-01: овсянка 350 ккал/100г, 0.08 KG → 280 ккал ===');
const kcal1 = calculateKcal(0.08, 'KG', 350, null);
assertEqual(kcal1, 280, 'KCAL-01 passed');

console.log('\n=== KCAL-02: тушёнка PCS, piece_weight 325, 250 ккал/100г, 1 шт → 812.5 ккал ===');
const kcal2 = calculateKcal(1, 'PCS', 250, 325);
assertEqual(kcal2, 812.5, 'KCAL-02 passed');

console.log('\n=== KCAL-03: молоко 60 ккал/100мл, 0.25 L → 150 ккал ===');
const kcal3 = calculateKcal(0.25, 'L', 60, null);
assertEqual(kcal3, 150, 'KCAL-03 passed');

console.log('\n=== KCAL-04: сводка "на человека" ===');
const ingredients = [
  { amount: 0.08, unit: 'KG' as const, kcalPer100g: 350, pieceWeightG: null, name: 'Овсянка' },
  { amount: 0.25, unit: 'L' as const, kcalPer100g: 60, pieceWeightG: null, name: 'Молоко' },
];
const recipeKcal = calculateRecipeKcal(ingredients, 1);
assertEqual(recipeKcal.caloriesPerServing, 430, 'KCAL-04 passed');
assertEqual(recipeKcal.missingKcalIngredients.length, 0, 'KCAL-04 no missing');

console.log('\n=== KCAL-05: валидация pieceWeightG для PCS ===');
const kcal5 = calculateKcal(1, 'PCS', 250, null);
assertEqual(kcal5, null, 'KCAL-05 passed: returns null without pieceWeightG');

console.log('\n=== KCAL-06: рецепт без ккал → null + чип ===');
const ingredientsMissing = [
  { amount: 0.01, unit: 'KG' as const, kcalPer100g: null, pieceWeightG: null, name: 'Соль' },
];
const recipeKcalMissing = calculateRecipeKcal(ingredientsMissing, 1);
assertEqual(recipeKcalMissing.caloriesPerServing, null, 'KCAL-06 passed: calories is null');
assert(recipeKcalMissing.missingKcalIngredients.includes('Соль'), 'KCAL-06: missing ingredient listed');

console.log('\n=== UNIT-01: PACK → "уп" ===');
assertEqual(getUnitLabel('PACK'), 'уп', 'UNIT-01 passed');

console.log('\n=== UNIT-02: нет "PCS" в UI ===');
assertEqual(getUnitLabel('PCS'), 'шт', 'UNIT-02 passed: PCS → шт');

console.log('\n=== UNIT-03: старые PCS → "шт" ===');
const humanized = humanize(2, 'PCS');
assertEqual(humanized, '2 шт', 'UNIT-03 passed');

console.log('\n=== humanize: 0.8 KG → "800 г" ===');
assertEqual(humanize(0.8, 'KG'), '800 г', 'humanize KG < 1');

console.log('\n=== humanize: 1.5 KG → "1.50 кг" ===');
assertEqual(humanize(1.5, 'KG'), '1.50 кг', 'humanize KG >= 1');

console.log('\n=== humanize: 0.25 L → "250 мл" ===');
assertEqual(humanize(0.25, 'L'), '250 мл', 'humanize L < 1');

console.log('\n=== humanize: 3 PACK → "3 уп" ===');
assertEqual(humanize(3, 'PACK'), '3 уп', 'humanize PACK');

console.log('\n=== humanize: null → "—" ===');
assertEqual(humanize(null as any, 'KG'), '—', 'humanize null');

console.log('\n=== Итоги ===');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

export const testResults = { passed, failed };
