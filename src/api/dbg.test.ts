import { it } from 'vitest';
import { mockServer } from './mockServer';
const GET = '/trips/trip1/meals/m3/composition';
const p = (b: unknown) => mockServer.handleRequest<any>('PUT', GET, b);
it('dbg8', () => {
  const r2 = p({ items: [{ ingredientId: 'ing14', state: 'RECIPE' }, { ingredientId: 'ing15', state: 'RECIPE' }], substitutions: [{ fromIngredientId: 'ing14', toIngredientId: 'ing15', ratio: 1 }] });
  console.log('FRESH subs:', JSON.stringify(r2.substitutions));
  const r3 = p({ items: [{ ingredientId: 'ing14', state: 'SCALED', ratio: 2 }], substitutions: [] });
  console.log('SCALE eff:', r3.items.find((i: any) => i.ingredientId === 'ing14')?.effectiveAmount);
  const r4 = p({ items: [{ ingredientId: 'ing14', state: 'RECIPE' }, { ingredientId: 'ing15', state: 'RECIPE' }], substitutions: [{ fromIngredientId: 'ing14', toIngredientId: 'ing15', ratio: 1 }] });
  console.log('SUBS after SCALE:', JSON.stringify(r4.substitutions));
  console.log('ing14:', JSON.stringify(r4.items.find((i: any) => i.ingredientId === 'ing14')));
});
