import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';
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

