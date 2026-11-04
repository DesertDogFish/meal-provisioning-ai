/**
 * CONTRACT-MENU-APPROVAL: утверждение меню ① — mock ↔ real
 * (trip-workflow-redesign пп.2–3, 03.11.2026).
 *
 * Эталон — backend `TripResponse` (record, порядок ключей):
 *   [id, name, startDate, endDate, defaultPeople, notes, menuApproved,
 *    createdAt, days, progress]
 * и `TripService.toggleMenuApproval` / `POST /api/v1/trips/{id}/menu-approval`:
 *   200 + полный TripResponse, toggle null↔now, чужой/неизвестный поход — 404.
 * Mock обязан держать ту же семантику (owner-only через findOwnTrip).
 *
 * Запуск: `npm run test:contract` или `npx vitest run src/api/contractMenuApproval.test.ts`.
 */
import { describe, it, expect } from 'vitest';

import { mockServer } from './mockServer';

const TRIP_ID = 'trip1'; // сид: меню утверждено (mockData, redesign п.3)

const toggle = () =>
  mockServer.handleRequest<any>('POST', `/trips/${TRIP_ID}/menu-approval`);

describe('CONTRACT-MENU-APPROVAL: /trips/:id/menu-approval mock ↔ real', () => {
  it('сид trip1: menuApproved — булево в GET /trips и GET /trips/:id', () => {
    const list = mockServer.handleRequest<any[]>('GET', '/trips');
    const one = list.find(t => t.id === TRIP_ID)!;
    expect(typeof one.menuApproved).toBe('boolean');
    const single = mockServer.handleRequest<any>('GET', `/trips/${TRIP_ID}`);
    expect(typeof single.menuApproved).toBe('boolean');
    expect(single.menuApproved).toBe(one.menuApproved);
  });

  it('POST toggle: 200 + булево menuApproved меняет знак и согласовано с GET', () => {
    const before = mockServer.handleRequest<any>('GET', `/trips/${TRIP_ID}`).menuApproved;
    const first = toggle();
    expect(typeof first.menuApproved).toBe('boolean');
    expect(first.menuApproved).toBe(!before);
    expect(mockServer.handleRequest<any>('GET', `/trips/${TRIP_ID}`).menuApproved)
      .toBe(first.menuApproved);
    const second = toggle();
    expect(second.menuApproved).toBe(before); // вернули сид-состояние
  });

  it('неизвестный поход — 404 (паритет owner-only NotFound)', () => {
    expect(() => mockServer.handleRequest('POST', '/trips/nope/menu-approval'))
      .toThrowError(/404|Not found/i);
  });
});
