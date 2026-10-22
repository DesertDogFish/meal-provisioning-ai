import { describe, it, expect, beforeEach } from 'vitest';
import { calculateShoppingList } from '../utils/calculations';

describe('Баг агрегации стоимости по endDate', () => {
  let trip: any;
  let recipes: Map<string, any>;
  let prices: any[];

  beforeEach(() => {
    // Поход: 10-20 мая
    trip = {
      id: '1',
      userId: '1',
      name: 'Тестовый поход',
      startDate: '2026-05-10',
      endDate: '2026-05-20',
      defaultPeople: 4,
      createdAt: '2026-01-01T00:00:00Z',
      days: [
        {
          id: '1',
          tripId: '1',
          dayDate: '2026-05-10',
          meals: [
            {
              id: '1',
              tripDayId: '1',
              mealType: 'DINNER',
              recipeId: '1',
              sortOrder: 1,
            },
          ],
        },
        {
          id: '2',
          tripId: '1',
          dayDate: '2026-05-20',
          meals: [
            {
              id: '2',
              tripDayId: '2',
              mealType: 'DINNER',
              recipeId: '1',
              sortOrder: 1,
            },
          ],
        },
      ],
    };

    // Рецепт: Гречка с тушёнкой
    recipes = new Map<string, any>([
      [
        '1',
        {
          id: '1',
          name: 'Гречка с тушёнкой',
          mealType: 'DINNER',
          baseServings: 4,
          source: 'MANUAL',
          createdAt: '2026-01-01T00:00:00Z',
          ingredients: [
            {
              ingredientId: '1',
              ingredient: {
                id: '1',
                name: 'Гречка',
                unit: 'KG',
                category: 'Крупы',
              },
              amount: 0.8,
            },
          ],
        },
      ],
    ]);

    // Цены: 180₽ до 15 мая, 250₽ с 15 мая
    prices = [
      {
        id: '1',
        ingredientId: '1',
        pricePerUnit: 180,
        currency: 'RUB',
        effectiveFrom: '2026-01-01',
      },
      {
        id: '2',
        ingredientId: '1',
        pricePerUnit: 250,
        currency: 'RUB',
        effectiveFrom: '2026-05-15',
      },
    ];
  });

  it('должен считать стоимость по дням, а не по endDate', () => {
    const shoppingList = calculateShoppingList(trip, recipes, prices);
    
    // День 10 мая: 0.8 KG × 180₽ = 144₽
    // День 20 мая: 0.8 KG × 250₽ = 200₽
    // Итого: 344₽
    
    const grechka = shoppingList.find(item => item.ingredientId === '1');
    expect(grechka).toBeDefined();
    expect(grechka?.totalAmount).toBe(1.6); // 0.8 + 0.8
    expect(grechka?.estimatedCost).toBe(344); // 144 + 200
  });

  it('не должен использовать цену endDate для всех дней', () => {
    const shoppingList = calculateShoppingList(trip, recipes, prices);
    const grechka = shoppingList.find(item => item.ingredientId === '1');
    
    // Если бы использовалась цена endDate (250₽), было бы: 1.6 × 250 = 400₽
    // Но должно быть: 144 + 200 = 344₽
    expect(grechka?.estimatedCost).not.toBe(400);
    expect(grechka?.estimatedCost).toBe(344);
  });
});
