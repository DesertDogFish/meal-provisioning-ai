import { beforeEach, describe, expect, it } from 'vitest';
import { mockServer } from './mockServer';

const GET = '/trips/trip1/meals/m3/composition';
const getComposition = () => mockServer.handleRequest<any>('GET', GET);
const putComposition = (body: unknown) => mockServer.handleRequest<any>('PUT', GET, body);
const itemOf = (c: any, id: string) => c.items.find((i: any) => i.ingredientId === id);
const asRecipeItems = (c: any) => c.items.map((i: any) => ({ ingredientId: i.ingredientId, state: 'RECIPE' }));

describe('debug', () => {
  beforeEach(() => {
    const c = getComposition();
    putComposition({ items: asRecipeItems(c), substitutions: [] });
  });
  it('test4 debug', () => {
    const before = getComposition();
    const scaled = putComposition({
      items: asRecipeItems(before).map(x => x.ingredientId === 'ing14' ? { ingredientId: 'ing14', state: 'SCALED', ratio: 2 } : x),
      substitutions: [],
    });
    console.log('scaled ing14:', JSON.stringify(itemOf(scaled, 'ing14')));
    const after = putComposition({
      items: asRecipeItems(scaled),
      substitutions: [{ fromIngredientId: 'ing14', toIngredientId: 'ing15', ratio: 1 }],
    });
    console.log('after ing14:', JSON.stringify(itemOf(after, 'ing14')));
    console.log('after ing15:', JSON.stringify(itemOf(after, 'ing15')));
    console.log('after subs:', JSON.stringify(after.substitutions));
  });
});
