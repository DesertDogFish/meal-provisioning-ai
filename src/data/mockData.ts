import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping } from '../types';

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
