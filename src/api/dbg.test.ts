import { it } from 'vitest';
import { mockServer } from './mockServer';
const GET = '/trips/trip1/meals/m3/composition';
const g = () => mockServer.handleRequest<any>('GET', GET);
const p = (b: unknown) => mockServer.handleRequest<any>('PUT', GET, b);
const asRecipeItems = (c: any) => c.items.map((i: any) => ({ ingredientId: i.ingredientId, state: 'RECIPE' }));
it('dbg', () => {
  const clean = p({ items: asRecipeItems(g()), substitutions: [] });
  const scaled = p({ items: asRecipeItems(clean).map((x: any) => x.ingredientId === 'ing14' ? { ingredientId: 'ing14', state: 'SCALED', ratio: 2 } : x), substitutions: [] });
  console.log('scaled ing14:', JSON.stringify(scaled.items.find((i: any) => i.ingredientId === 'ing14')));
  const after = p({ items: asRecipeItems(scaled), substitutions: [{ fromIngredientId: 'ing14', toIngredientId: 'ing15', ratio: 1 }] });
  console.log('after subs:', JSON.stringify(after.substitutions));
  console.log('after ing14:', JSON.stringify(after.items.find((i: any) => i.ingredientId === 'ing14')));
  console.log('after ing15:', JSON.stringify(after.items.find((i: any) => i.ingredientId === 'ing15')));
});
