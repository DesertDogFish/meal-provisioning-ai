import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';
export const mockIngredients: Ingredient[] = [
  // emisCode — софт-привязка к позиции локального справочника ЕМИСС (V26/V28);
  // ing14/ing15 намеренно без привязки (NOT_LINKED), ing17 — позиция без цен (NO_DATA).
  { id: 'ing1', name: 'Гречка', unit: 'KG', category: 'Крупы', kcalPer100g: 340, emisCode: '2307', createdAt: '2024-01-01' },
  { id: 'ing2', name: 'Рис', unit: 'KG', category: 'Крупы', kcalPer100g: 360, emisCode: '2301', createdAt: '2024-01-01' },
  { id: 'ing3', name: 'Овсяные хлопья', unit: 'KG', category: 'Крупы', kcalPer100g: 350, emisCode: '2309', createdAt: '2024-01-01' },
  { id: 'ing4', name: 'Вода', unit: 'L', category: 'Жидкости', kcalPer100g: 0, emisCode: '3306', createdAt: '2024-01-01' },
  { id: 'ing5', name: 'Масло подсолнечное', unit: 'L', category: 'Масла', kcalPer100g: 884, emisCode: '803', createdAt: '2024-01-01' },
  { id: 'ing6', name: 'Тушёнка говяжья', unit: 'PCS', category: 'Консервы', kcalPer100g: 250, pieceWeightG: 325, packSize: 8, roundToPacks: true, emisCode: '303', createdAt: '2024-01-01' }, // CONTRACT-P1: образец упаковки
  { id: 'ing7', name: 'Хлеб', unit: 'PCS', category: 'Хлеб', kcalPer100g: 250, pieceWeightG: 400, emisCode: '2207', createdAt: '2024-01-01' },
  { id: 'ing8', name: 'Сыр твёрдый', unit: 'KG', category: 'Молочные', kcalPer100g: 350, emisCode: '1204', createdAt: '2024-01-01' },
  { id: 'ing9', name: 'Колбаса варёная', unit: 'KG', category: 'Мясо', kcalPer100g: 260, emisCode: '201', createdAt: '2024-01-01' },
  { id: 'ing10', name: 'Чай', unit: 'PCS', category: 'Напитки', kcalPer100g: 0, pieceWeightG: 2, emisCode: '1905', createdAt: '2024-01-01' },
  { id: 'ing11', name: 'Сахар', unit: 'KG', category: 'Бакалея', kcalPer100g: 400, emisCode: '1601', createdAt: '2024-01-01' },
  { id: 'ing12', name: 'Соль', unit: 'KG', category: 'Бакалея', kcalPer100g: 0, emisCode: '2002', createdAt: '2024-01-01' },
  { id: 'ing13', name: 'Макароны', unit: 'KG', category: 'Крупы', kcalPer100g: 350, emisCode: '2403', createdAt: '2024-01-01' },
  { id: 'ing14', name: 'Лук', unit: 'KG', category: 'Овощи', kcalPer100g: 40, createdAt: '2024-01-01' },
  { id: 'ing15', name: 'Морковь', unit: 'KG', category: 'Овощи', kcalPer100g: 35, createdAt: '2024-01-01' },
  { id: 'ing16', name: 'Сгущёнка', unit: 'PCS', category: 'Консервы', kcalPer100g: 320, pieceWeightG: 380, emisCode: '1127', createdAt: '2024-01-01' },
  { id: 'ing17', name: 'Сухое молоко', unit: 'KG', category: 'Молочные', kcalPer100g: 500, emisCode: '1115', createdAt: '2024-01-01' },
  { id: 'ing18', name: 'Рыбные консервы', unit: 'PCS', category: 'Консервы', kcalPer100g: 150, pieceWeightG: 250, emisCode: '604', createdAt: '2024-01-01' },
];

