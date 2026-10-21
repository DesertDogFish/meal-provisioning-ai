import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';

export const mockProductCategories: ProductCategory[] = [
  { id: 'cat1', name: 'Крупы', slug: 'krupy', sortOrder: 1 },
  { id: 'cat2', name: 'Консервы', slug: 'konservy', sortOrder: 2 },
  { id: 'cat3', name: 'Напитки', slug: 'napitki', sortOrder: 3 },
  { id: 'cat4', name: 'Молочное', slug: 'molochnoe', sortOrder: 4 },
  { id: 'cat5', name: 'Овощи и зелень', slug: 'ovoshchi', sortOrder: 5 },
  { id: 'cat6', name: 'Фрукты и сухофрукты', slug: 'frukty', sortOrder: 6 },
  { id: 'cat7', name: 'Сладкое', slug: 'sladkoe', sortOrder: 7 },
  { id: 'cat8', name: 'Бакалея', slug: 'bakaleya', sortOrder: 8 },
  { id: 'cat9', name: 'Специи', slug: 'spetsii', sortOrder: 9 },
  { id: 'cat10', name: 'Мясо', slug: 'myaso', sortOrder: 10 },
  { id: 'cat11', name: 'Рыба', slug: 'ryba', sortOrder: 11 },
  { id: 'cat12', name: 'Хлеб', slug: 'hleb', sortOrder: 12 },
  { id: 'cat13', name: 'Масла', slug: 'masla', sortOrder: 13 },
  { id: 'cat14', name: 'Жидкости', slug: 'zhidkosti', sortOrder: 14 },
  { id: 'cat99', name: 'Прочее', slug: 'prochee', sortOrder: 99 },
];

export const mockUsers: User[] = [
  { id: '1', email: 'admin@provision.app', firstName: 'Admin', lastName: 'User', role: 'ADMIN', createdAt: '2024-01-01' },
  { id: '2', email: 'user@provision.app', firstName: 'John', lastName: 'Doe', role: 'USER', createdAt: '2024-01-15' },
];

export const mockIngredients: Ingredient[] = [
  { id: 'ing1', name: 'Гречка', unit: 'KG', category: 'Крупы', caloriesPerUnit: 3400, createdAt: '2024-01-01' },
  { id: 'ing2', name: 'Рис', unit: 'KG', category: 'Крупы', caloriesPerUnit: 3600, createdAt: '2024-01-01' },
  { id: 'ing3', name: 'Овсяные хлопья', unit: 'KG', category: 'Крупы', caloriesPerUnit: 3500, createdAt: '2024-01-01' },
  { id: 'ing4', name: 'Вода', unit: 'L', category: 'Жидкости', caloriesPerUnit: 0, createdAt: '2024-01-01' },
  { id: 'ing5', name: 'Масло подсолнечное', unit: 'L', category: 'Масла', caloriesPerUnit: 8840, createdAt: '2024-01-01' },
  { id: 'ing6', name: 'Тушёнка говяжья', unit: 'PCS', category: 'Консервы', caloriesPerUnit: 250, createdAt: '2024-01-01' },
  { id: 'ing7', name: 'Хлеб', unit: 'PCS', category: 'Хлеб', caloriesPerUnit: 2500, createdAt: '2024-01-01' },
  { id: 'ing8', name: 'Сыр твёрдый', unit: 'KG', category: 'Молочные', caloriesPerUnit: 3500, createdAt: '2024-01-01' },
  { id: 'ing9', name: 'Колбаса варёная', unit: 'KG', category: 'Мясо', caloriesPerUnit: 2600, createdAt: '2024-01-01' },
  { id: 'ing10', name: 'Чай', unit: 'PCS', category: 'Напитки', caloriesPerUnit: 0, createdAt: '2024-01-01' },
  { id: 'ing11', name: 'Сахар', unit: 'KG', category: 'Бакалея', caloriesPerUnit: 4000, createdAt: '2024-01-01' },
  { id: 'ing12', name: 'Соль', unit: 'KG', category: 'Бакалея', caloriesPerUnit: 0, createdAt: '2024-01-01' },
  { id: 'ing13', name: 'Макароны', unit: 'KG', category: 'Крупы', caloriesPerUnit: 3500, createdAt: '2024-01-01' },
  { id: 'ing14', name: 'Лук', unit: 'KG', category: 'Овощи', caloriesPerUnit: 400, createdAt: '2024-01-01' },
  { id: 'ing15', name: 'Морковь', unit: 'KG', category: 'Овощи', caloriesPerUnit: 350, createdAt: '2024-01-01' },
  { id: 'ing16', name: 'Сгущёнка', unit: 'PCS', category: 'Консервы', caloriesPerUnit: 300, createdAt: '2024-01-01' },
  { id: 'ing17', name: 'Сухое молоко', unit: 'KG', category: 'Молочные', caloriesPerUnit: 5000, createdAt: '2024-01-01' },
  { id: 'ing18', name: 'Рыбные консервы', unit: 'PCS', category: 'Консервы', caloriesPerUnit: 200, createdAt: '2024-01-01' },
];

export const mockPrices: IngredientPrice[] = [
  { id: 'p1', ingredientId: 'ing1', pricePerUnit: 120, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p2', ingredientId: 'ing2', pricePerUnit: 100, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p3', ingredientId: 'ing3', pricePerUnit: 80, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p4', ingredientId: 'ing4', pricePerUnit: 30, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p5', ingredientId: 'ing5', pricePerUnit: 150, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p6', ingredientId: 'ing6', pricePerUnit: 180, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p7', ingredientId: 'ing7', pricePerUnit: 60, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p8', ingredientId: 'ing8', pricePerUnit: 600, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p9', ingredientId: 'ing9', pricePerUnit: 450, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p10', ingredientId: 'ing10', pricePerUnit: 5, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p11', ingredientId: 'ing11', pricePerUnit: 70, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p12', ingredientId: 'ing12', pricePerUnit: 30, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p13', ingredientId: 'ing13', pricePerUnit: 90, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p14', ingredientId: 'ing14', pricePerUnit: 40, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p15', ingredientId: 'ing15', pricePerUnit: 50, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p16', ingredientId: 'ing16', pricePerUnit: 120, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p17', ingredientId: 'ing17', pricePerUnit: 350, currency: 'RUB', effectiveFrom: '2024-01-01' },
  { id: 'p18', ingredientId: 'ing18', pricePerUnit: 150, currency: 'RUB', effectiveFrom: '2024-01-01' },
];

export const mockRecipes: Recipe[] = [
  {
    id: 'rec1', name: 'Гречка с тушёнкой', mealType: 'LUNCH', category: 'ВТОРОЕ', cookMinutes: 25, baseServings: 4, caloriesPerServing: 450, source: 'MANUAL',
    ingredients: [
      { ingredientId: 'ing1', amount: 0.4 },
      { ingredientId: 'ing6', amount: 1 },
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

export const mockTrips: Trip[] = [
  {
    id: 'trip1', userId: '2', name: 'Поход на Карельский перешеек', startDate: '2024-07-15', endDate: '2024-07-18',
    defaultPeople: 4, notes: 'Озеро, рыбалка, палатки', createdAt: '2024-06-01',
    days: [
      {
        id: 'd1', tripId: 'trip1', dayDate: '2024-07-15',
        meals: [
          { id: 'm1', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'rec2', sortOrder: 1 },
          { id: 'm2', tripDayId: 'd1', mealType: 'BREAKFAST', recipeId: 'rec4', sortOrder: 2 },
          { id: 'm3', tripDayId: 'd1', mealType: 'LUNCH', recipeId: 'rec1', sortOrder: 3 },
          { id: 'm4', tripDayId: 'd1', mealType: 'SNACK', recipeId: 'rec5', sortOrder: 4 },
          { id: 'm5', tripDayId: 'd1', mealType: 'DINNER', recipeId: 'rec3', sortOrder: 5 },
        ]
      },
      {
        id: 'd2', tripId: 'trip1', dayDate: '2024-07-16', peopleOverride: 3,
        meals: [
          { id: 'm6', tripDayId: 'd2', mealType: 'BREAKFAST', recipeId: 'rec7', sortOrder: 1 },
          { id: 'm7', tripDayId: 'd2', mealType: 'LUNCH', recipeId: 'rec8', sortOrder: 2 },
          { id: 'm8', tripDayId: 'd2', mealType: 'DINNER', recipeId: 'rec6', sortOrder: 3 },
        ]
      },
      {
        id: 'd3', tripId: 'trip1', dayDate: '2024-07-17',
        meals: [
          { id: 'm9', tripDayId: 'd3', mealType: 'BREAKFAST', recipeId: 'rec2', sortOrder: 1 },
          { id: 'm10', tripDayId: 'd3', mealType: 'LUNCH', recipeId: 'rec1', sortOrder: 2 },
          { id: 'm11', tripDayId: 'd3', mealType: 'DINNER', recipeId: 'rec3', sortOrder: 3 },
        ]
      },
      {
        id: 'd4', tripId: 'trip1', dayDate: '2024-07-18',
        meals: [
          { id: 'm12', tripDayId: 'd4', mealType: 'BREAKFAST', recipeId: 'rec7', sortOrder: 1 },
          { id: 'm13', tripDayId: 'd4', mealType: 'LUNCH', recipeId: 'rec8', sortOrder: 2 },
        ]
      },
    ]
  },
  {
    id: 'trip2', userId: '2', name: 'Яхтенный поход по Финскому заливу', startDate: '2024-08-01', endDate: '2024-08-05',
    defaultPeople: 6, notes: 'Яхта, 5 дней в море', createdAt: '2024-06-15',
    days: [
      {
        id: 'd5', tripId: 'trip2', dayDate: '2024-08-01',
        meals: [
          { id: 'm14', tripDayId: 'd5', mealType: 'BREAKFAST', recipeId: 'rec2', sortOrder: 1 },
          { id: 'm15', tripDayId: 'd5', mealType: 'LUNCH', recipeId: 'rec1', sortOrder: 2 },
          { id: 'm16', tripDayId: 'd5', mealType: 'DINNER', recipeId: 'rec6', sortOrder: 3 },
        ]
      },
      {
        id: 'd6', tripId: 'trip2', dayDate: '2024-08-02',
        meals: [
          { id: 'm17', tripDayId: 'd6', mealType: 'BREAKFAST', recipeId: 'rec7', sortOrder: 1 },
          { id: 'm18', tripDayId: 'd6', mealType: 'LUNCH', recipeId: 'rec8', sortOrder: 2 },
          { id: 'm19', tripDayId: 'd6', mealType: 'DINNER', recipeId: 'rec3', sortOrder: 3 },
        ]
      },
    ]
  },
];

export const mockStagingRecipes: StagingRecipe[] = [
  {
    id: 'stg1', source: 'API', status: 'PENDING',
    rawPayload: {
      title: 'Pasta with tomato sauce',
      servings: 4,
      ingredients: [
        { name: 'pasta', amount: 400, unit: 'g' },
        { name: 'tomato sauce', amount: 300, unit: 'g' },
        { name: 'olive oil', amount: 30, unit: 'ml' },
        { name: 'garlic', amount: 2, unit: 'pcs' },
      ]
    },
    suggestedName: 'Паста с томатным соусом',
    suggestedMealType: 'DINNER',
    suggestedIngredients: [
      { externalName: 'pasta', amount: 0.4, unit: 'KG', mappedIngredientId: 'ing13' },
      { externalName: 'tomato sauce', amount: 0.3, unit: 'KG' },
      { externalName: 'olive oil', amount: 0.03, unit: 'L', mappedIngredientId: 'ing5' },
      { externalName: 'garlic', amount: 2, unit: 'PCS' },
    ],
    createdAt: '2024-06-20'
  },
  {
    id: 'stg2', source: 'AI', status: 'PENDING',
    rawPayload: {
      recipe: 'Energy porridge for hiking',
      people: 4,
      components: [
        { name: 'гречка', quantity: '300г' },
        { name: 'сгущёнка', quantity: '1 банка' },
        { name: 'масло сливочное', quantity: '50г' },
        { name: 'орехи', quantity: '100г' },
      ]
    },
    suggestedName: 'Энергетическая каша',
    suggestedMealType: 'BREAKFAST',
    suggestedIngredients: [
      { externalName: 'гречка', amount: 0.3, unit: 'KG', mappedIngredientId: 'ing1' },
      { externalName: 'сгущёнка', amount: 1, unit: 'PCS', mappedIngredientId: 'ing16' },
      { externalName: 'масло сливочное', amount: 0.05, unit: 'KG' },
      { externalName: 'орехи', amount: 0.1, unit: 'KG' },
    ],
    createdAt: '2024-06-22'
  }
];

export const mockMappings: IngredientMapping[] = [
  { id: 'map1', externalName: 'buckwheat', source: 'API', internalIngredientId: 'ing1' },
  { id: 'map2', externalName: 'rolled oats', source: 'API', internalIngredientId: 'ing3' },
  { id: 'map3', externalName: 'rice', source: 'API', internalIngredientId: 'ing2' },
  { id: 'map4', externalName: 'гречка', source: 'AI', internalIngredientId: 'ing1' },
  { id: 'map5', externalName: 'овсянка', source: 'AI', internalIngredientId: 'ing3' },
  { id: 'map6', externalName: 'pasta', source: 'API', internalIngredientId: 'ing13' },
];
