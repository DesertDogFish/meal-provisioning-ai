/**
 * Fix-2 (список 26.10, п.3/4): normalizeRecipe — сборка ingredient-объекта из
 * плоского DTO бэкенда. Backend RecipeIngredientResponse расширен полями
 * categoryName/packSize/roundToPacks/pieceWeightG/kcalPer100g — без их маппинга
 * чеклист и чек в real-режиме не-админа попадали целиком в «Прочее» и не знали
 * фасовку (вкладки «Чеклист»/«Ввести чек» строят категории и упаковки из этих данных).
 */
import { describe, it, expect } from 'vitest';
import { normalizeRecipe } from './client';
import type { Recipe } from '../types';

const flatRecipe = (ingredientRow: Record<string, unknown>): Recipe =>
  ({
    id: '7',
    name: 'Каша гречневая',
    mealType: 'BREAKFAST',
    baseServings: 2,
    source: 'MANUAL',
    createdAt: '2026-01-01T00:00:00',
    ingredients: [{ ingredientId: '12', amount: 0.2, ...ingredientRow }],
  } as unknown as Recipe);

describe('normalizeRecipe — плоский DTO real-бэкенда (Fix-2)', () => {
  it('расширенный плоский DTO: категория/фасовка/ккал попадают в ingredient-объект', () => {
    const out = normalizeRecipe(flatRecipe({
      ingredientName: 'Гречка',
      unit: 'KG',
      unitLabel: 'кг',
      categoryName: 'Крупы',
      packSize: 0.9,
      roundToPacks: true,
      pieceWeightG: null,
      kcalPer100g: 343,
    }));
    const ing = out.ingredients[0].ingredient!;
    expect(ing.id).toBe('12');
    expect(ing.name).toBe('Гречка');
    expect(ing.unit).toBe('KG');
    expect(ing.category).toBe('Крупы');
    expect(ing.packSize).toBe(0.9);
    expect(ing.roundToPacks).toBe(true);
    expect(ing.kcalPer100g).toBe(343);
  });

  it('старый плоский DTO (без новых полей): category пустая, фасовка undefined — не падаем', () => {
    const out = normalizeRecipe(flatRecipe({ ingredientName: 'Соль', unit: 'KG' }));
    const ing = out.ingredients[0].ingredient!;
    expect(ing.category).toBe('');
    expect(ing.packSize).toBeUndefined();
    expect(ing.roundToPacks).toBeUndefined();
  });

  it('вложенный ingredient (mock) сохраняется как есть', () => {
    const nested = { id: 'ing1', name: 'Гречка', unit: 'KG', category: 'Крупы', packSize: 0.9, createdAt: '' };
    const recipe = {
      id: 'r1', name: 'x', mealType: 'LUNCH', baseServings: 1, source: 'MANUAL', createdAt: '',
      ingredients: [{ ingredientId: 'ing1', amount: 1, ingredient: nested }],
    } as unknown as Recipe;
    const out = normalizeRecipe(recipe);
    expect(out.ingredients[0].ingredient).toBe(nested);
  });

  it('отсутствие ingredientName — фолбэк «Неизвестный», unit — «PCS»', () => {
    const out = normalizeRecipe(flatRecipe({}));
    const ing = out.ingredients[0].ingredient!;
    expect(ing.name).toBe('Неизвестный');
    expect(ing.unit).toBe('PCS');
  });
});
