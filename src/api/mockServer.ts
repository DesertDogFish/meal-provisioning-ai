/**
 * CR-5: Mock-сервер для прототипа
 * Эмулирует API бэкенда с in-memory базой данных
 */

import { mockIngredients, mockPrices, mockRecipes, mockTrips, mockProductCategories } from '../data/mockData';
import { Ingredient, Recipe, Trip, ProductCategory, IngredientPrice } from '../types';
import { calculateRecipeKcal } from '../utils/calc';

// In-memory хранилище
let products: Ingredient[] = [...mockIngredients];
let categories: ProductCategory[] = [...mockProductCategories];
let prices: IngredientPrice[] = [...mockPrices];
let recipes: Recipe[] = [...mockRecipes];
let trips: Trip[] = [...mockTrips];

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

let users: MockUser[] = [
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
    // Маршрутизация
    if (path.startsWith('/auth/')) {
      return this.handleAuth(method, path, body) as T;
    }
    if (path.startsWith('/product-categories')) {
      return this.handleCategories(method, path) as T;
    }
    if (path.startsWith('/admin/products')) {
      return this.handleProducts(method, path, body) as T;
    }
    if (path.startsWith('/recipes')) {
      return this.handleRecipes(method, path, body) as T;
    }
    if (path.startsWith('/trips')) {
      return this.handleTrips(method, path, body) as T;
    }
    if (path === '/meta') {
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
  handleTrips(method: string, _path: string, _body?: any): any {
    if (method === 'GET') {
      return trips;
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
