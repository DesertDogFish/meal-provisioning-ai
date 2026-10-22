/**
 * CR-5: Mock-сервер для прототипа
 * Эмулирует API бэкенда с in-memory базой данных
 */

import { mockIngredients, mockRecipes, mockTrips, mockProductCategories } from '../data/mockData';
import { Ingredient, Recipe, Trip, ProductCategory } from '../types';
import { calculateRecipeKcal } from '../utils/calc';

// In-memory хранилище
const products: Ingredient[] = [...mockIngredients];
const categories: ProductCategory[] = [...mockProductCategories];
const recipes: Recipe[] = [...mockRecipes];
const trips: Trip[] = [...mockTrips];

// Price overrides хранилище (tripId -> ingredientId -> override)
const priceOverrides: Record<string, Record<string, { actualPrice: number; comment?: string }>> = {};

// Auth хранилище
interface MockUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

const users: MockUser[] = [
  {
    id: '1',
    email: 'admin@provision.app',
    password: 'password123',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
    createdAt: '2024-01-01'
  },
  {
    id: '2',
    email: 'user@provision.app',
    password: 'password123',
    firstName: 'John',
    lastName: 'Doe',
    role: 'USER',
    createdAt: '2024-01-15'
  }
];

// Утилиты
const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const UNIT_LABELS: Record<string, string> = {
  KG: 'кг',
  L: 'л',
  PCS: 'шт',
  PACK: 'уп'
};

// Обработчик запросов
export const mockServer = {
  handleRequest<T>(method: string, path: string, body?: any): T {
    // Отрезаем query string для матчинга маршрута
    const pathWithoutQuery = path.split('?')[0];
    
    // Маршрутизация
    if (pathWithoutQuery.startsWith('/auth/')) {
      return this.handleAuth(method, path, body) as T;
    }
    if (pathWithoutQuery.startsWith('/product-categories')) {
      return this.handleCategories(method, path) as T;
    }
    if (pathWithoutQuery.startsWith('/admin/products')) {
      return this.handleProducts(method, path, body) as T;
    }
    if (pathWithoutQuery.startsWith('/recipes')) {
      return this.handleRecipes(method, path, body) as T;
    }
    if (pathWithoutQuery.startsWith('/trips')) {
      return this.handleTrips(method, path, body) as T;
    }
    if (pathWithoutQuery === '/meta') {
      return { version: '1.0.0', build: new Date().toISOString(), db: 'mock', application: 'provision' } as T;
    }

    throw { status: 404, message: 'Not found', detail: `Route ${path} not implemented in mock` };
  },

  // Категории
  handleCategories(method: string, _path: string): any {
    if (method === 'GET') {
      return categories.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    throw { status: 405, message: 'Method not allowed' };
  },

  // Продукты
  handleProducts(method: string, path: string, body?: any): any {
    // Проверяем fail из query string
    const url = new URL(`http://localhost${path}`);
    const failMode = url.searchParams.get('fail');
    if (failMode === 'products') {
      throw { status: 500, message: 'Mock server error' };
    }
    
    const parts = path.split('/').filter(Boolean);
    
    // GET /admin/products/check-name
    if (parts.includes('check-name')) {
      const url = new URL(`http://localhost${path}`);
      const name = url.searchParams.get('name') || '';
      const unit = url.searchParams.get('unit') || '';
      
      const normalizedName = normalize(name);
      const existing = products.find(p => 
        normalize(p.name) === normalizedName && p.unit === unit
      );
      
      if (existing) {
        return { duplicate: true, existingId: existing.id, existingName: existing.name, sameUnit: true };
      }
      
      const softDuplicate = products.find(p => normalize(p.name) === normalizedName && p.unit !== unit);
      if (softDuplicate) {
        return { duplicate: true, existingId: softDuplicate.id, existingName: softDuplicate.name, sameUnit: false };
      }
      
      return { duplicate: false };
    }

    // GET /admin/products
    if (method === 'GET' && parts[parts.length - 1] === 'products') {
      return {
        content: products.map(p => ({
          ...p,
          unitLabel: UNIT_LABELS[p.unit] || p.unit,
          categoryName: p.category,
          usageRecipes: recipes.filter(r => r.ingredients.some(i => i.ingredientId === p.id)).length,
          bindingStatus: p.code ? 'BOUND' : 'UNBOUND'
        })),
        totalElements: products.length,
        page: 0,
        size: 100
      };
    }

    // POST /admin/products
    if (method === 'POST') {
      const nameNorm = normalize(body.name);
      const duplicate = products.find(p => normalize(p.name) === nameNorm && p.unit === body.unit);
      
      if (duplicate) {
        throw { status: 409, message: 'DUPLICATE_PRODUCT', detail: 'Product with this name and unit already exists' };
      }

      // CR-1: валидация piece_weight_g для PCS/PACK
      if ((body.unit === 'PCS' || body.unit === 'PACK') && body.kcalPer100g && !body.pieceWeightG) {
        throw { status: 400, message: 'VALIDATION_ERROR', detail: 'pieceWeightG is required for PCS/PACK when kcalPer100g is set' };
      }

      const newProduct: Ingredient = {
        id: `ing_${Date.now()}`,
        name: body.name,
        unit: body.unit,
        unitLabel: UNIT_LABELS[body.unit],
        category: categories.find(c => c.id === body.categoryId)?.name || 'Прочее',
        categoryId: body.categoryId,
        packSize: body.packSize,
        roundToPacks: body.roundToPacks,
        kcalPer100g: body.kcalPer100g,
        pieceWeightG: body.pieceWeightG,
        createdAt: new Date().toISOString()
      };

      products.push(newProduct);
      return newProduct;
    }

    // PUT /admin/products/:id
    if (method === 'PUT' && parts.length === 3) {
      const id = parts[2];
      const index = products.findIndex(p => p.id === id);
      
      if (index === -1) {
        throw { status: 404, message: 'Not found' };
      }

      products[index] = {
        ...products[index],
        name: body.name,
        unit: body.unit,
        unitLabel: UNIT_LABELS[body.unit],
        category: categories.find(c => c.id === body.categoryId)?.name || products[index].category,
        packSize: body.packSize,
        roundToPacks: body.roundToPacks,
        kcalPer100g: body.kcalPer100g,
        pieceWeightG: body.pieceWeightG
      };

      return products[index];
    }

    // DELETE /admin/products/:id
    if (method === 'DELETE' && parts.length === 3) {
      const id = parts[2];
      const index = products.findIndex(p => p.id === id);
      
      if (index === -1) {
        throw { status: 404, message: 'Not found' };
      }

      products.splice(index, 1);
      return null;
    }

    throw { status: 404, message: 'Not found' };
  },

  // Рецепты
  handleRecipes(method: string, _path: string, _body?: any): any {
    if (method === 'GET') {
      return recipes.map(r => {
        const ingredients = r.ingredients.map(ri => {
          const ing = products.find(p => p.id === ri.ingredientId);
          return {
            ...ri,
            ingredient: ing,
            unitLabel: ing ? UNIT_LABELS[ing.unit] : ri.ingredient?.unit
          };
        });

        // CR-1: расчёт калорийности из продуктов
        const kcalResult = calculateRecipeKcal(
          ingredients.map(i => ({
            amount: i.amount,
            unit: i.ingredient?.unit || 'KG',
            kcalPer100g: i.ingredient?.kcalPer100g,
            pieceWeightG: i.ingredient?.pieceWeightG,
            name: i.ingredient?.name || ''
          })),
          r.baseServings
        );

        return {
          ...r,
          ingredients,
          calculatedCaloriesPerServing: kcalResult.caloriesPerServing,
          missingKcalIngredients: kcalResult.missingKcalIngredients
        };
      });
    }

    throw { status: 405, message: 'Method not allowed' };
  },

  // Походы
  handleTrips(method: string, path: string, body?: any): any {
    const parts = path.split('/').filter(Boolean);
    
    // GET /trips
    if (parts.length === 1 && method === 'GET') {
      return trips;
    }
    
    // GET /trips/:id
    if (parts.length === 2 && method === 'GET') {
      const tripId = parts[1];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      return trip;
    }
    
    // GET /trips/:id/summary/shopping
    if (parts.length === 4 && parts[2] === 'summary' && parts[3] === 'shopping' && method === 'GET') {
      const tripId = parts[1];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      
      // Простая реализация: возвращаем фиктивные данные
      // В реальности нужно считать из trip.days и recipes
      const items = [
        {
          ingredientId: '1',
          ingredientName: 'Гречка',
          unit: 'KG',
          totalAmount: 1.8,
          plannedUnitPrice: 200,
          actualUnitPrice: priceOverrides[tripId]?.['1']?.actualPrice || 200,
          plannedCost: 360,
          actualCost: (priceOverrides[tripId]?.['1']?.actualPrice || 200) * 1.8,
          overridden: !!priceOverrides[tripId]?.['1'],
          hasPlannedPrice: true
        },
        {
          ingredientId: '2',
          ingredientName: 'Тушёнка говяжья',
          unit: 'PCS',
          totalAmount: 9,
          plannedUnitPrice: 210,
          actualUnitPrice: priceOverrides[tripId]?.['2']?.actualPrice || 210,
          plannedCost: 1890,
          actualCost: (priceOverrides[tripId]?.['2']?.actualPrice || 210) * 9,
          overridden: !!priceOverrides[tripId]?.['2'],
          hasPlannedPrice: true
        },
        {
          ingredientId: '3',
          ingredientName: 'Соль',
          unit: 'KG',
          totalAmount: 0.045,
          plannedUnitPrice: null,
          actualUnitPrice: priceOverrides[tripId]?.['3']?.actualPrice || null,
          plannedCost: null,
          actualCost: priceOverrides[tripId]?.['3']?.actualPrice ? priceOverrides[tripId]['3'].actualPrice * 0.045 : null,
          overridden: !!priceOverrides[tripId]?.['3'],
          hasPlannedPrice: false
        },
        {
          ingredientId: '4',
          ingredientName: 'Овсяные хлопья',
          unit: 'KG',
          totalAmount: 0.32,
          plannedUnitPrice: 150,
          actualUnitPrice: priceOverrides[tripId]?.['4']?.actualPrice || 150,
          plannedCost: 48,
          actualCost: (priceOverrides[tripId]?.['4']?.actualPrice || 150) * 0.32,
          overridden: !!priceOverrides[tripId]?.['4'],
          hasPlannedPrice: true
        },
        {
          ingredientId: '5',
          ingredientName: 'Вода',
          unit: 'L',
          totalAmount: 1.0,
          plannedUnitPrice: 45,
          actualUnitPrice: priceOverrides[tripId]?.['5']?.actualPrice || 45,
          plannedCost: 45,
          actualCost: (priceOverrides[tripId]?.['5']?.actualPrice || 45) * 1.0,
          overridden: !!priceOverrides[tripId]?.['5'],
          hasPlannedPrice: true
        }
      ];
      
      const totalPlannedCost = items.reduce((sum, i) => sum + (i.plannedCost || 0), 0);
      const totalActualCost = items.reduce((sum, i) => sum + (i.actualCost || 0), 0);
      const deltaPercent = totalPlannedCost > 0 ? ((totalActualCost - totalPlannedCost) / totalPlannedCost) * 100 : null;
      
      return {
        items,
        totalPlannedCost,
        totalActualCost,
        deltaPercent,
        overriddenCount: items.filter(i => i.overridden).length,
        hasMissingPrices: items.some(i => !i.hasPlannedPrice),
        missingIngredients: items.filter(i => !i.hasPlannedPrice).map(i => i.ingredientName)
      };
    }
    
    // GET /trips/:id/summary/person
    if (parts.length === 4 && parts[2] === 'summary' && parts[3] === 'person' && method === 'GET') {
      const tripId = parts[1];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      
      // Простая реализация: возвращаем фиктивные данные
      const totalPersonMeals = 13; // Из FIX-1
      const defaultPeople = trip.defaultPeople || 4;
      
      // Получаем shopping data для расчёта
      const shoppingData = this.handleTrips('GET', `/trips/${tripId}/summary/shopping`, null);
      
      return {
        ingredients: shoppingData.items.map((i: any) => ({
          ingredientName: i.ingredientName,
          unit: i.unit,
          amountPerDefaultPerson: i.totalAmount / defaultPeople,
          amountPerPersonMeal: i.totalAmount / totalPersonMeals,
          plannedCostPerDefaultPerson: i.plannedCost ? i.plannedCost / defaultPeople : null,
          actualCostPerDefaultPerson: i.actualCost ? i.actualCost / defaultPeople : null,
          plannedCostPerPersonMeal: i.plannedCost ? i.plannedCost / totalPersonMeals : null,
          actualCostPerPersonMeal: i.actualCost ? i.actualCost / totalPersonMeals : null
        })),
        tripSummary: {
          totalPlannedCost: shoppingData.totalPlannedCost,
          totalActualCost: shoppingData.totalActualCost,
          deltaPercent: shoppingData.deltaPercent,
          overriddenCount: shoppingData.overriddenCount,
          hasMissingPrices: shoppingData.hasMissingPrices,
          missingIngredients: shoppingData.missingIngredients,
          totalPersonMeals,
          plannedCostPerDefaultPerson: shoppingData.totalPlannedCost / defaultPeople,
          actualCostPerDefaultPerson: shoppingData.totalActualCost / defaultPeople,
          plannedCostPerPersonMeal: shoppingData.totalPlannedCost / totalPersonMeals,
          actualCostPerPersonMeal: shoppingData.totalActualCost / totalPersonMeals,
          caloriesPerPersonMeal: null // Не считаем в mock
        }
      };
    }
    
    // PUT /trips/:id/price-overrides (bulk)
    if (parts.length === 3 && parts[2] === 'price-overrides' && method === 'PUT') {
      const tripId = parts[1];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      
      if (!Array.isArray(body)) {
        throw { status: 400, message: 'Bad request', detail: 'Expected array of overrides' };
      }
      
      if (!priceOverrides[tripId]) {
        priceOverrides[tripId] = {};
      }
      
      body.forEach((override: any) => {
        if (override.actualPrice === null) {
          delete priceOverrides[tripId][override.ingredientId];
        } else {
          priceOverrides[tripId][override.ingredientId] = {
            actualPrice: override.actualPrice,
            comment: override.comment
          };
        }
      });
      
      return { status: 'ok' };
    }
    
    // PUT /trips/:id/price-overrides/:ingredientId
    if (parts.length === 4 && parts[2] === 'price-overrides' && method === 'PUT') {
      const tripId = parts[1];
      const ingredientId = parts[3];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      
      if (!priceOverrides[tripId]) {
        priceOverrides[tripId] = {};
      }
      
      if (body.actualPrice === null) {
        delete priceOverrides[tripId][ingredientId];
      } else {
        priceOverrides[tripId][ingredientId] = {
          actualPrice: body.actualPrice,
          comment: body.comment
        };
      }
      
      return {
        ingredientId,
        actualPrice: body.actualPrice,
        comment: body.comment
      };
    }
    
    // DELETE /trips/:id/price-overrides/:ingredientId
    if (parts.length === 4 && parts[2] === 'price-overrides' && method === 'DELETE') {
      const tripId = parts[1];
      const ingredientId = parts[3];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      
      if (priceOverrides[tripId]) {
        delete priceOverrides[tripId][ingredientId];
      }
      
      return null;
    }
    
    // GET /trips/:id/price-overrides
    if (parts.length === 3 && parts[2] === 'price-overrides' && method === 'GET') {
      const tripId = parts[1];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) {
        throw { status: 404, message: 'Not found', detail: `Trip ${tripId} not found` };
      }
      
      const overrides = priceOverrides[tripId] || {};
      return Object.entries(overrides).map(([ingredientId, data]) => ({
        ingredientId,
        ...data
      }));
    }

    throw { status: 405, message: 'Method not allowed' };
  },

  // Авторизация
  handleAuth(method: string, path: string, body?: any): any {
    if (path === '/auth/register' && method === 'POST') {
      const { email, password, firstName, lastName } = body;
      
      // Проверка существования пользователя
      if (users.find(u => u.email === email)) {
        throw { status: 409, message: 'Conflict', detail: 'Email already registered' };
      }
      
      // Создание нового пользователя
      const newUser: MockUser = {
        id: String(users.length + 1),
        email,
        password,
        firstName,
        lastName,
        role: 'USER',
        createdAt: new Date().toISOString()
      };
      users.push(newUser);
      
      // Возвращаем токены
      return {
        accessToken: `mock-access-token-${newUser.id}`,
        refreshToken: `mock-refresh-token-${newUser.id}`,
        tokenType: 'Bearer'
      };
    }
    
    if (path === '/auth/login' && method === 'POST') {
      const { email, password } = body;
      const user = users.find(u => u.email === email && u.password === password);
      
      if (!user) {
        throw { status: 401, message: 'Unauthorized', detail: 'Invalid email or password' };
      }
      
      return {
        accessToken: `mock-access-token-${user.id}`,
        refreshToken: `mock-refresh-token-${user.id}`,
        tokenType: 'Bearer'
      };
    }
    
    if (path === '/auth/me' && method === 'GET') {
      // В реальном приложении здесь будет проверка токена
      // Для мока возвращаем первого пользователя
      const user = users[0];
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      };
    }
    
    if (path === '/auth/logout' && method === 'POST') {
      return null;
    }
    
    throw { status: 404, message: 'Not found', detail: `Auth route ${path} not implemented` };
  }
};
