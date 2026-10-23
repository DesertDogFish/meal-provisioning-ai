import { Trip, TripDay, TripMeal, IngredientPrice, ShoppingItem, DayShopping, MenuDay, PersonSummary, TripSummary, UnitOfMeasure } from '../types';
import { calculateKcal } from './calc';

export function getEffectivePeople(trip: Trip, day: TripDay, meal?: TripMeal): number {
  if (meal?.peopleOverride) return meal.peopleOverride;
  if (day.peopleOverride) return day.peopleOverride;
  return trip.defaultPeople;
}

export function calculateAmountPerPerson(amount: number, baseServings: number, people: number): number {
  return (amount / baseServings) * people;
}

export function findPriceForDate(prices: IngredientPrice[], date: string): IngredientPrice | undefined {
  const sorted = prices
    .filter(p => p.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return sorted[0];
}

export function formatAmount(amount: number, unit: string): string {
  if (unit === 'KG') {
    if (amount < 1) return `${Math.round(amount * 1000)} г`;
    return `${amount.toFixed(2)} кг`;
  }
  if (unit === 'L') {
    if (amount < 1) return `${Math.round(amount * 1000)} мл`;
    return `${amount.toFixed(2)} л`;
  }
  if (unit === 'PCS') {
    return `${Math.round(amount)} шт`;
  }
  if (unit === 'PACK') {
    return `${Math.round(amount)} уп`;
  }
  return `${Math.round(amount)} ${unit}`;
}

/**
 * FIX: признак «продукт отключён» (enabled=false). Отключённые продукты не должны
 * попадать ни в меню, ни в закупку, ни в чеки/сводки. undefined = включён (обратная совместимость).
 */
export function isIngredientDisabled(ri: any): boolean {
  return ri?.ingredient?.enabled === false;
}

export function calculateMenuByDays(trip: Trip, recipes: Map<string, any>): MenuDay[] {
  if (!trip.days) return [];
  return trip.days.map(day => ({
    dayDate: day.dayDate,
    effectivePeople: getEffectivePeople(trip, day),
    meals: (day.meals || []).map(meal => {
      const recipe = recipes.get(meal.recipeId);
      const people = getEffectivePeople(trip, day, meal);
      return {
        mealType: meal.mealType,
        recipeName: recipe?.name || 'Unknown',
        servings: people,
        // FIX: отключённые продукты не отражаются в меню
        ingredients: (recipe?.ingredients || [])
          .filter((ri: any) => !isIngredientDisabled(ri))
          .map((ri: any) => ({
            name: ri.ingredient?.name || 'Unknown',
            amount: calculateAmountPerPerson(ri.amount, recipe.baseServings, people),
            unit: ri.ingredient?.unit || 'PCS'
          }))
      };
    })
  }));
}

export function calculateShoppingList(trip: Trip, recipes: Map<string, any>, prices: IngredientPrice[]): ShoppingItem[] {
  const items: Map<string, ShoppingItem> = new Map();
  
  if (!trip.days) return [];
  
  for (const day of trip.days) {
    for (const meal of (day.meals || [])) {
      const recipe = recipes.get(meal.recipeId);
      if (!recipe) continue;
      const people = getEffectivePeople(trip, day, meal);
      
      for (const ri of recipe.ingredients) {
        const amountPerMeal = calculateAmountPerPerson(ri.amount, recipe.baseServings, people);
        const existing = items.get(ri.ingredientId);
        
        if (existing) {
          existing.totalAmount += amountPerMeal;
          // Обновляем стоимость, если есть цена на эту дату
          const price = findPriceForDate(prices.filter(p => p.ingredientId === ri.ingredientId), day.dayDate);
          if (price) {
            existing.estimatedCost = (existing.estimatedCost || 0) + amountPerMeal * price.pricePerUnit;
            existing.hasPrice = true;
          }
        } else {
          const price = findPriceForDate(prices.filter(p => p.ingredientId === ri.ingredientId), day.dayDate);
          items.set(ri.ingredientId, {
            ingredientId: ri.ingredientId,
            ingredientName: ri.ingredient?.name || 'Unknown',
            unit: ri.ingredient?.unit || 'PCS',
            totalAmount: amountPerMeal,
            estimatedCost: price ? amountPerMeal * price.pricePerUnit : undefined,
            hasPrice: !!price
          });
        }
      }
    }
  }
  
  return Array.from(items.values());
}

export function calculateDayShopping(trip: Trip, recipes: Map<string, any>, prices: IngredientPrice[]): DayShopping[] {
  if (!trip.days) return [];
  
  return trip.days.map(day => {
    const items: Map<string, ShoppingItem> = new Map();
    let dayCost = 0;
    let hasMissingPrices = false;
    
    for (const meal of (day.meals || [])) {
      const recipe = recipes.get(meal.recipeId);
      if (!recipe) continue;
      const people = getEffectivePeople(trip, day, meal);
      
      for (const ri of recipe.ingredients) {
        const amountPerMeal = calculateAmountPerPerson(ri.amount, recipe.baseServings, people);
        const existing = items.get(ri.ingredientId);
        
        if (existing) {
          existing.totalAmount += amountPerMeal;
        } else {
          items.set(ri.ingredientId, {
            ingredientId: ri.ingredientId,
            ingredientName: ri.ingredient?.name || 'Unknown',
            unit: ri.ingredient?.unit || 'PCS',
            totalAmount: amountPerMeal,
            hasPrice: false
          });
        }
      }
    }
    
    for (const item of items.values()) {
      const ingredientPrices = prices.filter(p => p.ingredientId === item.ingredientId);
      const price = findPriceForDate(ingredientPrices, day.dayDate);
      if (price) {
        item.estimatedCost = item.totalAmount * price.pricePerUnit;
        item.hasPrice = true;
        dayCost += item.estimatedCost;
      } else {
        hasMissingPrices = true;
      }
    }
    
    return {
      dayDate: day.dayDate,
      items: Array.from(items.values()),
      dayCost,
      hasMissingPrices
    };
  });
}

export function calculatePersonSummary(trip: Trip, recipes: Map<string, any>, prices: IngredientPrice[]): { summary: PersonSummary[]; tripSummary: TripSummary } {
  const shopping = calculateShoppingList(trip, recipes, prices);
  
  let totalPersonMeals = 0;
  let totalCalories = 0;
  
  if (trip.days) {
    for (const day of trip.days) {
      for (const meal of (day.meals || [])) {
        const people = getEffectivePeople(trip, day, meal);
        totalPersonMeals += people;
        const recipe = recipes.get(meal.recipeId);
        
        // CR-1: расчёт ккал из продуктов по формуле ядра
        if (recipe?.ingredients) {
          let mealCalories = 0;
          let hasAllKcal = true;
          
          for (const ri of recipe.ingredients) {
            const ing = ri.ingredient;
            if (!ing) continue;
            
            const amountPerMeal = calculateAmountPerPerson(ri.amount, recipe.baseServings, people);
            const kcal = calculateKcal(
              amountPerMeal,
              ing.unit as UnitOfMeasure,
              ing.kcalPer100g,
              ing.pieceWeightG
            );
            
            if (kcal === null) {
              hasAllKcal = false;
              break;
            }
            mealCalories += kcal;
          }
          
          if (hasAllKcal) {
            totalCalories += mealCalories;
          }
        }
      }
    }
  }
  
  const personSummary: PersonSummary[] = shopping.map(item => ({
    ingredientName: item.ingredientName,
    unit: item.unit,
    amountPerDefaultPerson: item.totalAmount / trip.defaultPeople,
    amountPerPersonMeal: totalPersonMeals > 0 ? item.totalAmount / totalPersonMeals : 0,
    costPerDefaultPerson: item.estimatedCost ? item.estimatedCost / trip.defaultPeople : undefined,
    costPerPersonMeal: item.estimatedCost && totalPersonMeals > 0 ? item.estimatedCost / totalPersonMeals : undefined,
  }));
  
  const totalCost = shopping.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
  const missingIngredients = shopping.filter(i => !i.hasPrice).map(i => i.ingredientName);
  
  return {
    summary: personSummary,
    tripSummary: {
      totalCost,
      hasMissingPrices: missingIngredients.length > 0,
      missingIngredients,
      totalPersonMeals,
      costPerDefaultPerson: totalCost / trip.defaultPeople,
      costPerPersonMeal: totalPersonMeals > 0 ? totalCost / totalPersonMeals : 0,
      caloriesPerPersonMeal: totalPersonMeals > 0 ? totalCalories / totalPersonMeals : undefined
    }
  };
}
