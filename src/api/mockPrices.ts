/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * роуты цен: GET /prices, GET /admin/prices, POST /admin/ingredient-prices.
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import type { IngredientPrice } from '../types';
import { products, prices } from './mockState';

export function tryPriceRoutes<T>(srv: any, method: string, pathWithoutQuery: string, body?: any): { hit: true; result: T } | { hit: false } {
  // P0-3: чтение цен — GET /prices ≡ POST /admin/ingredient-prices (реальный путь бэкенда).
  // (E2E-05: TripDetailPage/AdminPage/PriceOverridesTab грузили список цен и ловили 404)
  if (pathWithoutQuery === '/prices' && method === 'GET') {
    // V20: справочник цен — только глобальные продукты; цены похода — /trips/:id/prices.
    // Паритет с UserPriceController: последний действующий срез на каждый продукт.
    return { hit: true, result: srv.latestPerIngredient(prices.filter(pr => {
      const p = products.find(x => x.id === pr.ingredientId);
      return p && !(p as any).tripId;
    })) as T };
  }
  // Обратная совместимость со старыми тестами/кодом на /admin/prices (только чтение)
  if (pathWithoutQuery === '/admin/prices' && method === 'GET') {
    return { hit: true, result: srv.latestPerIngredient([...prices]) as T };
  }
  // P0-3: POST /admin/ingredient-prices (плоский путь реального бэкенда) —
  // эквивалентен legacy POST /admin/products/:id/prices, контракт DUPLICATE_PRICE_DATE тот же.
  if (pathWithoutQuery.startsWith('/admin/ingredient-prices') && method === 'POST') {
    const dup = prices.find(
      pr => String(pr.ingredientId) === String(body.ingredientId) && pr.effectiveFrom === body.effectiveFrom
    );
    if (dup) {
      throw {
        status: 409,
        message: 'DUPLICATE_PRICE_DATE',
        detail: `Price for ${body.effectiveFrom} already exists`,
      } as any;
    }
    const entry: IngredientPrice = {
      id: `p_${Date.now()}`,
      ingredientId: String(body.ingredientId),
      pricePerUnit: body.pricePerUnit,
      currency: body.currency || 'RUB',
      effectiveFrom: body.effectiveFrom,
    };
    prices.push(entry);
    return { hit: true, result: entry as T };
  }
  return { hit: false };
}
