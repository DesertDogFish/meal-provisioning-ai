/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.2): contract mock-паритета
 * стагинга импорта каталога (R3). Форма — backend StagingController/
 * StagingRecipeResponse: GET /admin/staging[?status=], GET /:id, POST /:id/approve,
 * POST /:id/reject; approve/reject — void, статус и reviewedAt меняются.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockServer } from './mockServer';
import { resetStagingSeed } from './mockStaging';

const RESPONSE_KEYS = ['id', 'source', 'rawPayload', 'status', 'suggestedName',
  'suggestedMealType', 'suggestedIngredients', 'reviewedAt', 'reviewedByEmail',
  'rejectionReason', 'createdAt'] as const;

describe('CONTRACT-STAGING: /admin/staging (mock ≡ StagingController)', () => {
  beforeEach(() => resetStagingSeed());

  it('GET список — полная форма StagingRecipeResponse', () => {
    const list = mockServer.handleRequest<any[]>('GET', '/admin/staging', null);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const key of RESPONSE_KEYS) expect(list[0]).toHaveProperty(key);
  });

  it('GET ?status=PENDING — фильтр по статусу', () => {
    const pending = mockServer.handleRequest<any[]>('GET', '/admin/staging?status=PENDING', null);
    expect(pending.every(r => r.status === 'PENDING')).toBe(true);
  });

  it('GET /:id — один черновик; неизвестный id → 404', () => {
    const one = mockServer.handleRequest<any>('GET', '/admin/staging/1', null);
    expect(one.id).toBe(1);
    expect(() => mockServer.handleRequest('GET', '/admin/staging/999', null))
      .toThrow(expect.objectContaining({ status: 404 }));
  });

  it('POST /:id/approve — void, статус → APPROVED + reviewedAt/reviewedByEmail', () => {
    const res = mockServer.handleRequest('POST', '/admin/staging/1/approve', { name: 'x', mealType: 'DINNER', baseServings: 4, ingredients: [] });
    expect(res).toBeUndefined();
    const after = mockServer.handleRequest<any>('GET', '/admin/staging/1', null);
    expect(after.status).toBe('APPROVED');
    expect(after.reviewedAt).toBeTruthy();
    expect(after.reviewedByEmail).toBeTruthy();
    expect(after.rejectionReason).toBeNull();
  });

  it('POST /:id/reject — void, статус → REJECTED + причина', () => {
    mockServer.handleRequest('POST', '/admin/staging/2/reject', { reason: 'дубль' });
    const after = mockServer.handleRequest<any>('GET', '/admin/staging/2', null);
    expect(after.status).toBe('REJECTED');
    expect(after.rejectionReason).toBe('дубль');
  });

  it('POST /admin/staging — создание черновика (PENDING)', () => {
    const created = mockServer.handleRequest<any>('POST', '/admin/staging', {
      source: 'AI', suggestedName: 'Новое блюдо', suggestedMealType: 'LUNCH',
    });
    expect(created.status).toBe('PENDING');
    expect(created.id).toBeDefined();
    const list = mockServer.handleRequest<any[]>('GET', '/admin/staging', null);
    expect(list.some(r => r.id === created.id)).toBe(true);
  });
});
