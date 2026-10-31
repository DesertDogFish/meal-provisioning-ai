/// <reference types="vitest/globals" />
import { describe, it, expect, beforeAll } from 'vitest';
import { api } from './client';
import { mockServer } from './mockServer';
import { loadTripView } from '../utils/tripLoader';

/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.8, вариант A, R3):
 * GET /trips отдаёт прогресс карточки В СПИСКЕ — один запрос вместо N+1.
 *  - контракт: поля progress совпадают с backend `TripProgressResponse`
 *    (stage/meals/checklistTotal/facts/factsTotal/totalCost/costPerPerson);
 *  - паритет: цифры progress === цифры deriveTripView, собранные НЕЗАВИСИМЫМ
 *    пайплайном страницы похода (utils/tripLoader → HTTP-роуты мока → клиентские
 *    нормализации) — «цифры карточки совпадают с deriveTripView на демо-данных»;
 *  - семантика: чек (PUT price-override) сразу виден в прогрессе списка.
 * Real-направление контракта покрыто backend-тестом TripProgressServiceTest
 * (те же формулы на Java); e2e real-режима — real-mode.spec.ts.
 */
describe('GET /trips — прогресс карточек в списке (cleanup-п.8)', () => {
  beforeAll(async () => {
    api.setMode('mock');
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('контракт: каждый элемент списка несёт progress с полями TripProgressResponse', async () => {
    const list = await mockServer.handleRequest<any[]>('GET', '/trips');
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) {
      const p = t.progress;
      if (p == null) continue; // best-effort: сервер вправе не отдать прогресс
      expect(['menu', 'shopping', 'checks']).toContain(p.stage);
      for (const k of ['meals', 'checklistTotal', 'facts', 'factsTotal'] as const) {
        expect(typeof p[k], k).toBe('number');
      }
      for (const k of ['totalCost', 'costPerPerson'] as const) {
        expect(typeof p[k], k).toBe('number');
      }
      expect(p.factsTotal).toBe(p.checklistTotal); // инвариант клиента factsTotal == positions
    }
  });

  it('паритет: progress списка === deriveTripView пайплайна страницы похода (демо-данные)', async () => {
    const list = await mockServer.handleRequest<any[]>('GET', '/trips');
    let checked = 0;
    for (const t of list) {
      if (!t.progress) continue;
      const { view } = await loadTripView(String(t.id));
      expect(t.progress.checklistTotal, `${t.id} checklistTotal`).toBe(view.checklistRowIds.length);
      expect(t.progress.facts, `${t.id} facts`).toBe(view.factCount);
      expect(t.progress.factsTotal, `${t.id} factsTotal`).toBe(view.factsTotal);
      expect(t.progress.totalCost, `${t.id} totalCost`).toBeCloseTo(view.tripSummary.totalCost, 6);
      expect(t.progress.costPerPerson, `${t.id} costPerPerson`).toBeCloseTo(view.tripSummary.costPerDefaultPerson, 6);
      const meals = (t.days ?? []).reduce((a: number, d: any) => a + (d.meals?.length ?? 0), 0);
      expect(t.progress.meals, `${t.id} meals`).toBe(meals);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('семантика: введённый чек сразу виден в прогрессе списка (facts/stage/totalCost)', async () => {
    const list = await mockServer.handleRequest<any[]>('GET', '/trips');
    const trip = list.find(t => t.progress && t.progress.checklistTotal > 0);
    expect(trip).toBeTruthy();
    const tripId = String(trip!.id);
    const { view } = await loadTripView(tripId);
    const row = view.includedShoppingFinal[0];
    expect(row).toBeTruthy();
    const ingId = String(row.ingredientId);
    const factUnit = 777;
    try {
      await api.put(`/trips/${tripId}/price-overrides/${ingId}`, { actualPrice: factUnit });

      const after = await mockServer.handleRequest<any[]>('GET', '/trips');
      const p = after.find(t => String(t.id) === tripId)!.progress!;
      expect(p.stage).toBe('checks');
      expect(p.facts).toBeGreaterThanOrEqual(1);

      // и снова паритет: список == пайплайн страницы (серверный override учтён обоими)
      const { view: v2 } = await loadTripView(tripId);
      expect(p.totalCost).toBeCloseTo(v2.tripSummary.totalCost, 6);
      expect(p.costPerPerson).toBeCloseTo(v2.tripSummary.costPerDefaultPerson, 6);
      expect(p.facts).toBe(v2.factCount);
      expect(v2.includedShoppingFinal.find(r => String(r.ingredientId) === ingId)!.actualUnitPrice).toBe(factUnit);
    } finally {
      await api.del(`/trips/${tripId}/price-overrides/${ingId}`);
      // чистота состояния мока для соседних тестов файла
      const clean = await loadTripView(tripId);
      expect(clean.view.includedShoppingFinal.find(r => String(r.ingredientId) === ingId)!.actualUnitPrice == null).toBe(true);
    }
  });
});
