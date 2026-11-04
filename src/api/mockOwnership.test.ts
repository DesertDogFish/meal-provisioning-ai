/// <reference types="vitest/globals" />
/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 11) — KB-34.
 *
 * Mock-паритет ownership (R3). На бэкенде КАЖДЫЙ роут похода резолвит его
 * через `tripRepository.findByIdWithDaysAndMeals(tripId, userId)` (TripService),
 * поэтому чужой поход неотличим от несуществующего — 404 TRIP_NOT_FOUND для
 * обеих ролей (SecurityIntegrationTest), а `GET /trips` отдаёт только свои
 * (`findByUserId`). Mock-сервер искал поход одним `trips.find(t => t.id === id)`
 * и отдавал чужие данные любому: прямой URL /trips/trip1 под админом показывал
 * и позволял править чужой поход.
 *
 * Владелец берётся из токена сессии — тот же канал, что `/auth/me`
 * (`mock-access-token-<id>`). Без токена сессия не определена и mock остаётся
 * пермиссивным (прежний дефолт зафиксирован в mockTripsUpdate.test.ts;
 * реальный API на запрос без токена отвечает 401, а не данными).
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { mockServer } from './mockServer';

function req<T>(method: string, path: string, body?: unknown): T {
  return mockServer.handleRequest<T>(method, path, body);
}

function expectStatus(method: string, path: string, status: number, body?: unknown) {
  let err: any = null;
  try {
    req(method, path, body);
  } catch (e) {
    err = e;
  }
  expect(err, `${method} ${path} — ожидалась ошибка ${status}`).toBeTruthy();
  expect(err.status, `${method} ${path}`).toBe(status);
  return err;
}

/** user@provision.app (id 2) — владелец сид-походов trip1/trip2. */
const OWNER_TOKEN = 'mock-access-token-2';
/** admin@provision.app (id 1) — своих походов не имеет. */
const FOREIGN_TOKEN = 'mock-access-token-1';

/** Все роуты похода, которые обязаны проверять владельца. */
const TRIP_ROUTES: [string, string, unknown?][] = [
  ['GET', '/trips/trip1'],
  ['GET', '/trips/trip1/prices'],
  ['GET', '/trips/trip1/recipes'],
  ['GET', '/trips/trip1/summary/shopping'],
  ['GET', '/trips/trip1/summary/person'],
  ['GET', '/trips/trip1/manual-items'],
  ['GET', '/trips/trip1/substitutions'],
  ['GET', '/trips/trip1/ingredient-edits'],
  ['GET', '/trips/trip1/shopping-exclusions'],
  ['GET', '/trips/trip1/price-overrides'],
  ['GET', '/trips/trip1/meals/m1/composition'],
  ['PUT', '/trips/trip1', { name: 'Чужой поход' }],
  ['PUT', '/trips/trip1/shopping-exclusions', { ingredientIds: ['ing1'] }],
  ['PUT', '/trips/trip1/price-overrides', { overrides: [] }],
  ['PUT', '/trips/trip1/price-overrides/ing1', { actualPrice: 1 }],
  ['PUT', '/trips/trip1/meals/m1/composition', { items: [] }],
  ['POST', '/trips/trip1/days/d1/meals', { recipeId: 'rec1', mealType: 'LUNCH' }],
  ['POST', '/trips/trip1/manual-items', { ingredientName: 'Чужое', unit: 'PCS', amount: 1 }],
  ['POST', '/trips/trip1/substitutions', { recipeId: 'rec1', fromIngredientId: 'ing1', toIngredientId: 'ing2', ratio: 1 }],
  ['POST', '/trips/trip1/ingredient-removals', { recipeId: 'rec1', ingredientId: 'ing1' }],
  ['DELETE', '/trips/trip1/days/d1/meals/m1'],
  ['DELETE', '/trips/trip1/manual-items/mi-1'],
  ['DELETE', '/trips/trip1/substitutions/s-1'],
  ['DELETE', '/trips/trip1/shopping-exclusions/ing1'],
  ['DELETE', '/trips/trip1/ingredient-removals/r-1'],
  ['DELETE', '/trips/trip1/price-overrides/ing1'],
];

describe('KB-34: чужой поход в mock → 404 (паритет с TripService)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('пользователь без походов получает 404 на GET /trips/trip1', () => {
    localStorage.setItem('accessToken', FOREIGN_TOKEN);
    expectStatus('GET', '/trips/trip1', 404);
  });

  it('форма 404 — тот же контракт, что у «поход не найден»: { status, message, detail }', () => {
    localStorage.setItem('accessToken', FOREIGN_TOKEN);
    const err = expectStatus('GET', '/trips/trip1', 404);
    expect(err.message).toBe('Not found');
    expect(String(err.detail)).toContain('trip1');
  });

  it('владелец свой поход получает', () => {
    localStorage.setItem('accessToken', OWNER_TOKEN);
    const trip = req<any>('GET', '/trips/trip1');
    expect(trip.id).toBe('trip1');
    expect(String(trip.userId)).toBe('2');
  });

  it('все роуты похода проверяют владельца: чужой → 404', () => {
    localStorage.setItem('accessToken', FOREIGN_TOKEN);
    for (const [method, path, body] of TRIP_ROUTES) {
      expectStatus(method, path, 404, body);
    }
  });

  it('те же роуты для владельца не отдают 404 (проверка не «закрутила гайки» всем)', () => {
    localStorage.setItem('accessToken', OWNER_TOKEN);
    // PUT/DELETE с фиктивными id под-ресурсов могут отдать 400/404 по своей
    // причине — важно лишь, что НЕ «Trip trip1 not found».
    for (const [method, path, body] of TRIP_ROUTES) {
      let detail: unknown = null;
      try {
        req(method, path, body);
      } catch (e: any) {
        detail = e?.detail;
      }
      expect(String(detail ?? ''), `${method} ${path}`).not.toContain('Trip trip1 not found');
    }
  });

  it('GET /trips — только свои походы (паритет findByUserId)', () => {
    localStorage.setItem('accessToken', FOREIGN_TOKEN);
    expect(req<any[]>('GET', '/trips')).toHaveLength(0);

    localStorage.setItem('accessToken', OWNER_TOKEN);
    const mine = req<any[]>('GET', '/trips');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every(t => String(t.userId) === '2')).toBe(true);
    // прогресс карточек сохранён (cleanup-п.8)
    expect(mine[0].progress).toBeTruthy();
  });

  it('PUT чужого похода не меняет данные (404 до мутации)', () => {
    localStorage.setItem('accessToken', FOREIGN_TOKEN);
    expectStatus('PUT', '/trips/trip1', 404, { name: 'Перехваченное имя' });

    localStorage.setItem('accessToken', OWNER_TOKEN);
    expect(req<any>('GET', '/trips/trip1').name).not.toBe('Перехваченное имя');
  });

  it('без токена сессия не определена — mock пермиссивен (прежний дефолт)', () => {
    const trip = req<any>('GET', '/trips/trip1');
    expect(trip.id).toBe('trip1');
    expect(req<any[]>('GET', '/trips').length).toBeGreaterThan(0);
  });

  it('токен неизвестного пользователя — сессия не определена (не «все походы чужие») ', () => {
    localStorage.setItem('accessToken', 'mock-access-token-999');
    expect(req<any>('GET', '/trips/trip1').id).toBe('trip1');
  });
});
