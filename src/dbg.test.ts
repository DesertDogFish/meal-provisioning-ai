import { describe, it } from 'vitest';
import { mockServer } from './api/mockServer';

const GET = '/trips/trip1/meals/m3/composition';
const getComposition = () => mockServer.handleRequest<any>('GET', GET);
const putComposition = (body: unknown) => mockServer.handleRequest<any>('PUT', GET, body);
const asRecipeItems = (c: any) => c.items.map((i: any) => ({ ingredientId: i.ingredientId, state: 'RECIPE' }));

describe('dbg', () => {
  it('test4 exact flow', () => {
    const before = getComposition();
    putComposition({ items: asRecipeItems(before), substitutions: [] }); // beforeEach
    const scaled = putComposition({
      items: asRecipeItems(before).map((x: any) => x.ingredientId === 'ing14' ? { ingredientId: 'ing14', state: 'SCALED', ratio: 2 } : x),
      substitutions: [],
    });
    console.log('scaled ing14 eff:', scaled.items.find((i: any) => i.ingredientId === 'ing14')?.effectiveAmount);
    console.log('raw after scale PUT:', JSON.stringify(mockServer.handleRequest<any>('GET', '/trips/trip1/substitutions')));
    const after = putComposition({
      items: asRecipeItems(scaled),
      substitutions: [{ fromIngredientId: 'ing14', toIngredientId: 'ing15', ratio: 1 }],
    });
    console.log('after ing14 eff:', after.items.find((i: any) => i.ingredientId === 'ing14')?.effectiveAmount);
    console.log('after ing15:', JSON.stringify(after.items.find((i: any) => i.ingredientId === 'ing15')));
    console.log('raw after subst PUT:', JSON.stringify(mockServer.handleRequest<any>('GET', '/trips/trip1/substitutions')));
  });
});
