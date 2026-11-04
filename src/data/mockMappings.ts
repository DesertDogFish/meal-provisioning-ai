import { Ingredient, IngredientPrice, Recipe, Trip, User, StagingRecipe, IngredientMapping, ProductCategory } from '../types';
export const mockMappings: IngredientMapping[] = [
  { id: 'map1', externalName: 'buckwheat', source: 'API', internalIngredientId: 'ing1' },
  { id: 'map2', externalName: 'rolled oats', source: 'API', internalIngredientId: 'ing3' },
  { id: 'map3', externalName: 'rice', source: 'API', internalIngredientId: 'ing2' },
  { id: 'map4', externalName: 'гречка', source: 'AI', internalIngredientId: 'ing1' },
  { id: 'map5', externalName: 'овсянка', source: 'AI', internalIngredientId: 'ing3' },
  { id: 'map6', externalName: 'pasta', source: 'API', internalIngredientId: 'ing13' },
];
