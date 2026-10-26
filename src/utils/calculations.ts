import { Trip, TripDay, TripMeal, IngredientPrice, ShoppingItem, DayShopping, MenuDay, PersonSummary, TripSummary, UnitOfMeasure } from '../types';
import { calculateKcal } from './calc';
import { formatQty } from './format';

/**
 * Release-1.0 (UI-consistency): бэкенд в DTO рецепта отдаёт плоские поля
 * (ingredientId/ingredientName/unit/unitLabel — RecipeResponse.RecipeIngredientResponse),
 * а mock и нормализованный GET /recipes — вложенный объект ingredient.
 * Читаем ОБЕ формы, иначе в UI протекает «Unknown» и единица «шт» по умолчанию.
 */
export function ingOf(ri: any): { name: string; unit: any; enabled?: boolean; kcalPer100g?: number; pieceWeightG?: number } {
  const ing = ri?.ingredient;
  if (ing && typeof ing === 'object') return ing;
  return {
    name: ri?.ingredientName ?? 'Unknown',
    unit: ri?.unit ?? 'PCS',
    enabled: ri?.enabled,
    kcalPer100g: ri?.kcalPer100g,
    pieceWeightG: ri?.pieceWeightG,
  };
}

export function getEffectivePeople(trip: Trip, day: TripDay, meal?: TripMeal): number {
  if (meal?.peopleOverride) return meal.peopleOverride;
  if (day.peopleOverride) return day.peopleOverride;
  return trip.defaultPeople;
}

/**
 * U33 (список 26.10): «на одного человека» должно делиться на РЕАЛЬНОЕ количество
 * людей, а не на defaultPeople. Реальное = среднее эффективных людей по дням
 * (peopleOverride дня учитывается; meal-override усредняется через день).
 * Без override'ов совпадает с defaultPeople — обратная совместимость расчётов.
 */
export function realTripPeople(trip: Trip): number {
  const days = trip.days ?? [];
  if (days.length === 0) return Math.max(1, trip.defaultPeople || 1);
  const total = days.reduce((sum, d) => sum + getEffectivePeople(trip, d), 0);
  return Math.max(1, total / days.length);
}

export function calculateAmountPerPerson(amount: number, baseServings: number, people: number): number {
  return (amount / baseServings) * people;
}

/**
 * FIX (T0, зелёный main): единый контракт единиц для всей кодовой базы —
 * KG/L хранят БАЗОВЫЕ единицы (кг/л), PCS/PACK — штуки/упаковки.
 * Обоснование контракта: backend KcalCalculator.java, фикстуры
 * contract.test.ts (гречка 1.8 KG → план 360 ₽ = 1.8 × 200 ₽/кг),
 * calc.test.ts KCAL-01 (0.08 KG → 280 ккал), TripForm-поток e2e.
 * Ранее существовали две взаимоисключающие интерпретации:
 *  - «граммы» (багфикс «284 046 ₽»: toBaseUnits делил на 1000) — ломала
 *    CR-1 ккал (250186 вместо 436) и стоимость в calculations.test.ts
 *    (CI: expected 120.08 to be close to 200);
 *  - «базовые единицы» — ломала расчётные ассерты баг-теста агрегации
 *    стоимости по дням (calculations.bug.test.ts), чья фикстура была
 *    написана в граммах (amount: 800).
 * Теперь toBaseUnits/costOf — identity (количество уже в базовых единицах,
 * цена — за базовую единицу), а фикстура calculations.bug.test.ts приведена
 * к контракту (800 г → 0.8 кг). Смысловое ядро баг-теста (цена каждой даты,
 * а не endDate) сохранено: 0.8×180 + 0.8×250 = 344 ₽ ≠ 400 ₽.
 */
export function toBaseUnits(amount: number, _unit: string): number {
  return amount;
}

/** Стоимость позиции: количество (базовые единицы) × цена за базовую единицу. */
export function costOf(amount: number, unit: string, pricePerUnit: number): number {
  return toBaseUnits(amount, unit) * pricePerUnit;
}

export function findPriceForDate(prices: IngredientPrice[], date: string): IngredientPrice | undefined {
  const sorted = prices
    .filter(p => p.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return sorted[0];
}

/** Количество с единицей (см. formatQty — единые правила вывода Release-1.0). */
export function formatAmount(amount: number, unit: string): string {
  return formatQty(amount, unit);
}

/**
 * FIX: признак «продукт отключён» (enabled=false). Отключённые продукты не должны
 * попадать ни в меню, ни в закупку, ни в чеки/сводки. undefined = включён (обратная совместимость).
 */
export function isIngredientDisabled(ri: any): boolean {
  return ingOf(ri).enabled === false;
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
        // U30: recipeId нужен странице для сопоставления серверных правок состава
        recipeId: meal.recipeId,
        // FIX: отключённые продукты не отражаются в меню
        ingredients: (recipe?.ingredients || [])
          .filter((ri: any) => !isIngredientDisabled(ri))
          .map((ri: any) => ({
            name: ingOf(ri).name || 'Unknown',
            amount: calculateAmountPerPerson(ri.amount, recipe.baseServings, people),
            unit: ingOf(ri).unit || 'PCS',
            // U30: id ингредиента — для overlay серверных правок (EXTRA/SUBST/EXCLUDE)
            ingredientId: String(ri.ingredientId ?? ri?.ingredient?.id ?? ''),
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
        // Release-1.0: выключенные продукты не попадают ни в меню, ни в закупку (паритет)
        if (isIngredientDisabled(ri)) continue;
        const amountPerMeal = calculateAmountPerPerson(ri.amount, recipe.baseServings, people);
        const existing = items.get(ri.ingredientId);
        
        if (existing) {
          existing.totalAmount += amountPerMeal;
          // Обновляем стоимость, если есть цена на эту дату
          const price = findPriceForDate(prices.filter(p => p.ingredientId === ri.ingredientId), day.dayDate);
          if (price) {
            // BUGFIX: единицы — г/мл против ₽/кг; см. costOf()
            existing.estimatedCost = (existing.estimatedCost || 0) + costOf(amountPerMeal, existing.unit, price.pricePerUnit);
            existing.hasPrice = true;
          }
        } else {
          const price = findPriceForDate(prices.filter(p => p.ingredientId === ri.ingredientId), day.dayDate);
          const unit = ingOf(ri).unit || 'PCS';
          items.set(ri.ingredientId, {
            ingredientId: ri.ingredientId,
            ingredientName: ingOf(ri).name || 'Unknown',
            unit,
            totalAmount: amountPerMeal,
            estimatedCost: price ? costOf(amountPerMeal, unit, price.pricePerUnit) : undefined,
            hasPrice: !!price
          });
        }
      }
    }
  }
  
  return Array.from(items.values());
}

/**
 * Release-1.0 (UI-consistency): ОДНА формула плановой суммы закупки для всех
 * поверхностей (KPI шапки, «Закупка», «По дням», «На человека»). Позиции из
 * excluded (soft-disable) в сумму не входят — поэтому KPI больше не спорит с «Итого».
 */
export function shoppingPlannedTotal(items: ShoppingItem[], excluded?: ReadonlySet<string>): number {
  return items.reduce((sum, it) => {
    if (excluded?.has(String(it.ingredientId))) return sum;
    return sum + (it.estimatedCost ?? 0);
  }, 0);
}

export function calculateDayShopping(
  trip: Trip,
  recipes: Map<string, any>,
  prices: IngredientPrice[],
  excluded?: ReadonlySet<string>
): DayShopping[] {
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
        // Release-1.0: исключённые позиции (soft-disable) не влияют ни на одну сумму
        if (excluded?.has(String(ri.ingredientId))) continue;
        // Release-1.0: выключенные продукты не попадают ни в меню, ни в закупку (паритет)
        if (isIngredientDisabled(ri)) continue;
        const amountPerMeal = calculateAmountPerPerson(ri.amount, recipe.baseServings, people);
        const existing = items.get(ri.ingredientId);
        
        if (existing) {
          existing.totalAmount += amountPerMeal;
        } else {
          items.set(ri.ingredientId, {
            ingredientId: ri.ingredientId,
            ingredientName: ingOf(ri).name || 'Unknown',
            unit: ingOf(ri).unit || 'PCS',
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
        // BUGFIX: единицы — г/мл против ₽/кг; см. costOf()
        item.estimatedCost = costOf(item.totalAmount, item.unit, price.pricePerUnit);
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

export function calculatePersonSummary(trip: Trip, recipes: Map<string, any>, prices: IngredientPrice[], realPeople?: number): { summary: PersonSummary[]; tripSummary: TripSummary } {
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
            // Release-1.0: выключенные продукты не участвуют ни в суммах, ни в ккал
            if (isIngredientDisabled(ri)) continue;
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
  
  // U33 (список 26.10): «на человека» — по РЕАЛЬНОМУ количеству людей
  // (среднее по дням с учётом peopleOverride), а не по defaultPeople.
  const people = Math.max(1, realPeople ?? realTripPeople(trip));

  const personSummary: PersonSummary[] = shopping.map(item => ({
    ingredientName: item.ingredientName,
    unit: item.unit,
    amountPerDefaultPerson: item.totalAmount / people,
    amountPerPersonMeal: totalPersonMeals > 0 ? item.totalAmount / totalPersonMeals : 0,
    costPerDefaultPerson: item.estimatedCost ? item.estimatedCost / people : undefined,
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
      costPerDefaultPerson: totalCost / people,
      costPerPersonMeal: totalPersonMeals > 0 ? totalCost / totalPersonMeals : 0,
      caloriesPerPersonMeal: totalPersonMeals > 0 ? totalCalories / totalPersonMeals : undefined
    }
  };
}
