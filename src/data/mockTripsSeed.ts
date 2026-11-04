import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';
export const mockTrips: Trip[] = [
  {
    id: 'trip1', userId: '2', name: 'Поход на Карельский перешеек', startDate: '2024-07-15', endDate: '2024-07-18',
    defaultPeople: 4, notes: 'Озеро, рыбалка, палатки', createdAt: '2024-06-01',
    // redesign п.3: демо-поход с закупкой/чеками — меню утверждено (воркфлоу выглядит естественно)
    menuApproved: true,
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
    // redesign п.3: один демо-поход остаётся НЕутверждённым — для проверки этапа ①
    menuApproved: false,
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

