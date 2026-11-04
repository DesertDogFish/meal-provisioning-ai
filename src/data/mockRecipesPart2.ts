import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';
export const mockRecipesPart2: Recipe[] = [
  {
    id: 'rec33', name: 'Лапша б/п с сыром', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 5, baseServings: 1, caloriesPerServing: 350, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 1 },
      { ingredientId: 'ing8', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.4 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec34', name: 'Лапша б/п с куриной тушенкой', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 5, baseServings: 1, caloriesPerServing: 420, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 1 },
      { ingredientId: 'ing6', amount: 0.5 },
      { ingredientId: 'ing4', amount: 0.4 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec35', name: 'Кускус с соевым мясом и томатами', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 360, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.09 },
      { ingredientId: 'ing6', amount: 0.03 },
      { ingredientId: 'ing15', amount: 0.01 },
      { ingredientId: 'ing14', amount: 0.003 },
      { ingredientId: 'ing4', amount: 0.25 },
      { ingredientId: 'ing5', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec36', name: 'Булгур с говяжьей тушенкой', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 20, baseServings: 1, caloriesPerServing: 450, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.09 },
      { ingredientId: 'ing6', amount: 0.5 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.3 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec37', name: 'Рис с рыбными консервами', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 20, baseServings: 1, caloriesPerServing: 430, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.09 },
      { ingredientId: 'ing18', amount: 0.5 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.3 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec38', name: 'Пюре с паштетом', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 380, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 0.08 },
      { ingredientId: 'ing4', amount: 0.25 },
      { ingredientId: 'ing6', amount: 0.04 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec39', name: 'Пюре с плавленым сыром', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 360, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 0.08 },
      { ingredientId: 'ing8', amount: 0.5 },
      { ingredientId: 'ing4', amount: 0.25 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec40', name: 'Сэндвич на хлебцах с паштетом', mealType: 'LUNCH', category: 'БУТЕРБРОДЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 300, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing7', amount: 2 },
      { ingredientId: 'ing6', amount: 0.05 },
      { ingredientId: 'ing14', amount: 0.001 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec41', name: 'Сэндвич на хлебцах с сыром и колбасой', mealType: 'LUNCH', category: 'БУТЕРБРОДЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 410, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing7', amount: 2 },
      { ingredientId: 'ing8', amount: 0.04 },
      { ingredientId: 'ing9', amount: 0.04 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec42', name: 'Галеты с салом и чесноком', mealType: 'LUNCH', category: 'БУТЕРБРОДЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 380, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing7', amount: 3 },
      { ingredientId: 'ing9', amount: 0.03 },
      { ingredientId: 'ing14', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec43', name: 'Фасолевый салат с сухариками', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 260, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing6', amount: 0.5 },
      { ingredientId: 'ing7', amount: 0.03 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing5', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  // УЖИНЫ (15)
  {
    id: 'rec44', name: 'Плов походный', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 40, baseServings: 1, caloriesPerServing: 520, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.1 },
      { ingredientId: 'ing6', amount: 0.25 },
      { ingredientId: 'ing15', amount: 0.03 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing5', amount: 0.01 },
      { ingredientId: 'ing12', amount: 0.002 },
      { ingredientId: 'ing11', amount: 0.001 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec45', name: 'Рис с куриной тушенкой и морковью', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 470, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.1 },
      { ingredientId: 'ing6', amount: 0.25 },
      { ingredientId: 'ing15', amount: 0.02 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing11', amount: 0.002 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec46', name: 'Пюре с тушенкой и луком', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 460, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 0.1 },
      { ingredientId: 'ing6', amount: 0.25 },
      { ingredientId: 'ing4', amount: 0.3 },
      { ingredientId: 'ing14', amount: 0.015 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec47', name: 'Чечевица с копчёной колбасой', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 440, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.1 },
      { ingredientId: 'ing9', amount: 0.04 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing5', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec48', name: 'Фасоль в томате с рисом', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 25, baseServings: 1, caloriesPerServing: 420, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing6', amount: 0.5 },
      { ingredientId: 'ing2', amount: 0.06 },
      { ingredientId: 'ing15', amount: 0.02 },
      { ingredientId: 'ing14', amount: 0.02 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec49', name: 'Гуляш из соевого мяса с пюре', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 400, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing6', amount: 0.04 },
      { ingredientId: 'ing13', amount: 0.09 },
      { ingredientId: 'ing15', amount: 0.015 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing11', amount: 0.001 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec50', name: 'Уха из рыбных консервов', mealType: 'DINNER', category: 'СУПЫ', cookMinutes: 25, baseServings: 1, caloriesPerServing: 300, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing18', amount: 0.5 },
      { ingredientId: 'ing13', amount: 0.06 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.4 },
      { ingredientId: 'ing12', amount: 0.002 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec51', name: 'Паста с сыром и салом', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 20, baseServings: 1, caloriesPerServing: 520, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 0.11 },
      { ingredientId: 'ing8', amount: 0.03 },
      { ingredientId: 'ing9', amount: 0.02 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec52', name: 'Гречка с сушёными грибами', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 410, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing1', amount: 0.1 },
      { ingredientId: 'ing18', amount: 0.015 },
      { ingredientId: 'ing14', amount: 0.03 },
      { ingredientId: 'ing5', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec53', name: 'Пшено с тушенкой', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 460, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.1 },
      { ingredientId: 'ing6', amount: 0.25 },
      { ingredientId: 'ing14', amount: 0.02 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec54', name: 'Кускус с тушенкой и томатами', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 470, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.09 },
      { ingredientId: 'ing6', amount: 0.25 },
      { ingredientId: 'ing15', amount: 0.015 },
      { ingredientId: 'ing4', amount: 0.25 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec55', name: 'Лапша с куриной тушенкой и овощами', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 25, baseServings: 1, caloriesPerServing: 480, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 0.1 },
      { ingredientId: 'ing6', amount: 0.25 },
      { ingredientId: 'ing15', amount: 0.02 },
      { ingredientId: 'ing14', amount: 0.02 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec56', name: 'Карри походное с рисом', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 35, baseServings: 1, caloriesPerServing: 490, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.1 },
      { ingredientId: 'ing6', amount: 0.035 },
      { ingredientId: 'ing17', amount: 0.015 },
      { ingredientId: 'ing11', amount: 0.003 },
      { ingredientId: 'ing5', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  // ПЕРЕКУСЫ И НАПИТКИ (16)
  {
    id: 'rec57', name: 'Халва с галетами', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 510, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing11', amount: 0.05 },
      { ingredientId: 'ing7', amount: 2 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec58', name: 'Колбаса с галетами', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 430, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing9', amount: 0.04 },
      { ingredientId: 'ing7', amount: 2 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec59', name: 'Мёд с орехами', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 550, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing11', amount: 0.03 },
      { ingredientId: 'ing8', amount: 0.03 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec60', name: 'Энергетические шарики', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 470, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing16', amount: 0.04 },
      { ingredientId: 'ing8', amount: 0.03 },
      { ingredientId: 'ing11', amount: 0.01 },
      { ingredientId: 'ing11', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec61', name: 'Печенье овсяное', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 440, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.06 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec62', name: 'Какао на сухом молоке', mealType: 'SNACK', category: 'НАПИТКИ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 180, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing11', amount: 0.015 },
      { ingredientId: 'ing17', amount: 0.02 },
      { ingredientId: 'ing11', amount: 0.015 },
      { ingredientId: 'ing4', amount: 0.3 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec63', name: 'Компот из сухофруктов', mealType: 'SNACK', category: 'НАПИТКИ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 120, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing16', amount: 0.04 },
      { ingredientId: 'ing11', amount: 0.01 },
      { ingredientId: 'ing4', amount: 0.4 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec64', name: 'Чай с лимоном', mealType: 'SNACK', category: 'НАПИТКИ', cookMinutes: 5, baseServings: 1, caloriesPerServing: 60, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing10', amount: 0.003 },
      { ingredientId: 'ing15', amount: 0.1 },
      { ingredientId: 'ing11', amount: 0.01 },
      { ingredientId: 'ing4', amount: 0.3 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec65', name: 'Кофе со сгущёнкой', mealType: 'SNACK', category: 'НАПИТКИ', cookMinutes: 5, baseServings: 1, caloriesPerServing: 140, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing10', amount: 0.008 },
      { ingredientId: 'ing16', amount: 0.15 },
      { ingredientId: 'ing4', amount: 0.25 },
    ],
    createdAt: '2024-01-01'
  },
];
