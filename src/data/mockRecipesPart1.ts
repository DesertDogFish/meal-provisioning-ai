import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';
export const mockRecipesPart1: Recipe[] = [
  {
    id: 'rec1', name: 'Гречка с тушёнкой', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 25, baseServings: 4, caloriesPerServing: 450, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing1', amount: 0.4 },
      // CONTRACT-P1 (PLAN.md Backlog п.1): ing6 замещает отсутствующий 'ing99' (образец substitutedFrom)
      { ingredientId: 'ing6', amount: 1, substitutedFrom: 'ing99' },
      { ingredientId: 'ing4', amount: 0.8 },
      { ingredientId: 'ing14', amount: 0.1 },
      { ingredientId: 'ing12', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec2', name: 'Овсяная каша', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 10, baseServings: 4, caloriesPerServing: 320, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.3 },
      { ingredientId: 'ing4', amount: 0.8 },
      { ingredientId: 'ing11', amount: 0.05 },
      { ingredientId: 'ing12', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec3', name: 'Рис с рыбой', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 20, baseServings: 4, caloriesPerServing: 380, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.3 },
      { ingredientId: 'ing18', amount: 1 },
      { ingredientId: 'ing4', amount: 0.6 },
      { ingredientId: 'ing5', amount: 0.03 },
      { ingredientId: 'ing12', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec4', name: 'Чай с сахаром', mealType: 'BREAKFAST', category: 'НАПИТКИ', cookMinutes: 5, baseServings: 4, caloriesPerServing: 50, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing10', amount: 4 },
      { ingredientId: 'ing11', amount: 0.04 },
      { ingredientId: 'ing4', amount: 1.0 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec5', name: 'Бутерброды с сыром', mealType: 'SNACK', category: 'БУТЕРБРОДЫ', cookMinutes: 0, baseServings: 4, caloriesPerServing: 200, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing7', amount: 0.5 },
      { ingredientId: 'ing8', amount: 0.15 },
      { ingredientId: 'ing9', amount: 0.1 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec6', name: 'Макароны по-флотски', mealType: 'DINNER', category: 'ВТОРОЕ', cookMinutes: 25, baseServings: 4, caloriesPerServing: 480, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing13', amount: 0.4 },
      { ingredientId: 'ing6', amount: 1 },
      { ingredientId: 'ing14', amount: 0.1 },
      { ingredientId: 'ing5', amount: 0.03 },
      { ingredientId: 'ing12', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec7', name: 'Каша с сухим молоком', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 15, baseServings: 4, caloriesPerServing: 350, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.25 },
      { ingredientId: 'ing17', amount: 0.05 },
      { ingredientId: 'ing4', amount: 0.7 },
      { ingredientId: 'ing11', amount: 0.03 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec8', name: 'Гречка с овощами', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 30, baseServings: 4, caloriesPerServing: 300, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing1', amount: 0.4 },
      { ingredientId: 'ing14', amount: 0.15 },
      { ingredientId: 'ing15', amount: 0.15 },
      { ingredientId: 'ing5', amount: 0.03 },
      { ingredientId: 'ing12', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  // Рецепты БЕЗ ОГНЯ (cookMinutes = 0)
  {
    id: 'rec9', name: 'Ореховый микс с изюмом', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 520, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing8', amount: 0.03 }, // Орехи
      { ingredientId: 'ing16', amount: 0.03 }, // Сухофрукты (изюм)
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec10', name: 'Шоколад с орехами', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 560, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing8', amount: 0.05 }, // Орехи
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec11', name: 'Сыр с хлебцами', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 400, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing8', amount: 0.04 }, // Сыр
      { ingredientId: 'ing7', amount: 2 }, // Хлебцы
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec12', name: 'Козинаки', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 530, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing8', amount: 0.06 }, // Орехи
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec13', name: 'Курага и чернослив', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 340, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing16', amount: 0.08 }, // Сухофрукты
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec14', name: 'Сгущёнка с галетами', mealType: 'SNACK', category: 'ПЕРЕКУСЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 420, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing16', amount: 0.25 }, // Сгущёнка
      { ingredientId: 'ing7', amount: 2 }, // Галеты
    ],
    createdAt: '2024-01-01'
  },
  // ЗАВТРАКИ (15)
  {
    id: 'rec15', name: 'Овсянка на воде с сухофруктами', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 320, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.08 },
      { ingredientId: 'ing4', amount: 0.25 },
      { ingredientId: 'ing16', amount: 0.02 },
      { ingredientId: 'ing11', amount: 0.01 },
      { ingredientId: 'ing12', amount: 0.002 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec16', name: 'Овсянка на сухом молоке', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 360, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.08 },
      { ingredientId: 'ing17', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.25 },
      { ingredientId: 'ing11', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec17', name: 'Мюсли-каша с орехами и изюмом', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 8, baseServings: 1, caloriesPerServing: 410, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.06 },
      { ingredientId: 'ing8', amount: 0.02 },
      { ingredientId: 'ing16', amount: 0.02 },
      { ingredientId: 'ing17', amount: 0.015 },
      { ingredientId: 'ing4', amount: 0.2 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec18', name: 'Пшённая каша с курагой', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 25, baseServings: 1, caloriesPerServing: 380, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.09 },
      { ingredientId: 'ing16', amount: 0.025 },
      { ingredientId: 'ing4', amount: 0.3 },
      { ingredientId: 'ing11', amount: 0.01 },
      { ingredientId: 'ing5', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec19', name: 'Рисовая каша на сухом молоке', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 25, baseServings: 1, caloriesPerServing: 370, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.08 },
      { ingredientId: 'ing17', amount: 0.025 },
      { ingredientId: 'ing4', amount: 0.3 },
      { ingredientId: 'ing11', amount: 0.015 },
      { ingredientId: 'ing12', amount: 0.002 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec20', name: 'Манная каша с изюмом', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 350, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.07 },
      { ingredientId: 'ing16', amount: 0.02 },
      { ingredientId: 'ing17', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.3 },
      { ingredientId: 'ing11', amount: 0.015 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec21', name: 'Каша Дружба', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 25, baseServings: 1, caloriesPerServing: 365, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.04 },
      { ingredientId: 'ing3', amount: 0.04 },
      { ingredientId: 'ing17', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.3 },
      { ingredientId: 'ing11', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec22', name: 'Гороховая каша с маслом', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 340, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.1 },
      { ingredientId: 'ing4', amount: 0.3 },
      { ingredientId: 'ing5', amount: 0.01 },
      { ingredientId: 'ing12', amount: 0.003 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec23', name: 'Гречневая каша с маслом', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 20, baseServings: 1, caloriesPerServing: 350, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing1', amount: 0.09 },
      { ingredientId: 'ing4', amount: 0.25 },
      { ingredientId: 'ing5', amount: 0.01 },
      { ingredientId: 'ing12', amount: 0.002 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec24', name: 'Омлет из яичного порошка с салом', mealType: 'BREAKFAST', category: 'ВТОРОЕ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 420, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing8', amount: 0.03 },
      { ingredientId: 'ing4', amount: 0.09 },
      { ingredientId: 'ing9', amount: 0.02 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing12', amount: 0.002 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec25', name: 'Походный омлет с сыром', mealType: 'BREAKFAST', category: 'ВТОРОЕ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 400, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing8', amount: 0.035 },
      { ingredientId: 'ing17', amount: 0.01 },
      { ingredientId: 'ing4', amount: 0.1 },
      { ingredientId: 'ing8', amount: 0.03 },
      { ingredientId: 'ing5', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec26', name: 'Блины походные', mealType: 'BREAKFAST', category: 'ВЫПЕЧКА', cookMinutes: 25, baseServings: 1, caloriesPerServing: 430, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing1', amount: 0.08 },
      { ingredientId: 'ing8', amount: 0.015 },
      { ingredientId: 'ing17', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.2 },
      { ingredientId: 'ing11', amount: 0.015 },
      { ingredientId: 'ing5', amount: 0.01 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec27', name: 'Хлебцы с мёдом и орехами', mealType: 'BREAKFAST', category: 'БУТЕРБРОДЫ', cookMinutes: 0, baseServings: 1, caloriesPerServing: 330, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing7', amount: 2 },
      { ingredientId: 'ing11', amount: 0.03 },
      { ingredientId: 'ing8', amount: 0.02 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec28', name: 'Овсянка с шоколадом и арахисом', mealType: 'BREAKFAST', category: 'КАШИ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 450, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing3', amount: 0.08 },
      { ingredientId: 'ing8', amount: 0.02 },
      { ingredientId: 'ing8', amount: 0.015 },
      { ingredientId: 'ing4', amount: 0.25 },
      { ingredientId: 'ing11', amount: 0.005 },
    ],
    createdAt: '2024-01-01'
  },
  // ОБЕДЫ (15)
  {
    id: 'rec29', name: 'Борщ сублимированный', mealType: 'LUNCH', category: 'СУПЫ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 210, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing18', amount: 0.08 },
      { ingredientId: 'ing4', amount: 0.4 },
      { ingredientId: 'ing12', amount: 0.001 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec30', name: 'Куриный суп с лапшой', mealType: 'LUNCH', category: 'СУПЫ', cookMinutes: 10, baseServings: 1, caloriesPerServing: 230, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing18', amount: 0.07 },
      { ingredientId: 'ing4', amount: 0.4 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec31', name: 'Грибной суп-пюре походный', mealType: 'LUNCH', category: 'СУПЫ', cookMinutes: 15, baseServings: 1, caloriesPerServing: 240, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing18', amount: 0.02 },
      { ingredientId: 'ing13', amount: 0.06 },
      { ingredientId: 'ing4', amount: 0.4 },
      { ingredientId: 'ing12', amount: 0.002 },
      { ingredientId: 'ing14', amount: 0.001 },
    ],
    createdAt: '2024-01-01'
  },
  {
    id: 'rec32', name: 'Гороховый суп с копчёной колбасой', mealType: 'LUNCH', category: 'СУПЫ', cookMinutes: 30, baseServings: 1, caloriesPerServing: 320, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing2', amount: 0.09 },
      { ingredientId: 'ing9', amount: 0.03 },
      { ingredientId: 'ing14', amount: 0.02 },
      { ingredientId: 'ing4', amount: 0.45 },
      { ingredientId: 'ing12', amount: 0.003 },
    ],
    createdAt: '2024-01-01'
  },
];
