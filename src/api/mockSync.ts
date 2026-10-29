/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * состояние и роуты синхронизации интеграций (журнал, upload, sync/prices, connect/disconnect).
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import {  } from './mockState';

// CONTRACT-P1: состояние синхронизации интеграций для SYNC_ALREADY_RUNNING
let syncRunning = false;

// U11 mock-parity: состояние /admin/integrations* (как IntegrationController +
// IntegrationService). По умолчанию интеграция подключена — в демо-режиме
// «Обновить цены» работает сразу. errorMessage='Connected successfully' — как у
// реального бэкенда (фронт не должен трактовать его как ошибку).
let integrationState: {
  id: number; provider: string; status: string; baseUrl: string;
  lastConnectedAt: string | null; lastSyncAt: string | null; errorMessage: string | null;
} = {
  id: 1,
  provider: 'ROSSTAT',
  status: 'CONNECTED',
  baseUrl: 'https://www.fedstat.ru',
  lastConnectedAt: new Date().toISOString(),
  lastSyncAt: null,
  errorMessage: 'Connected successfully',
};

// Журнал синхронизаций (SyncLogDto), свежие записи первыми
const integrationSyncLogs: Array<{
  id: number; provider: string; type: string; status: string;
  startedAt: string; finishedAt: string | null;
  createdCount: number; updatedCount: number; errorCount: number;
}> = [];

  // CONTRACT-P1 (PLAN.md Backlog п.1): синхронизация интеграций — SYNC_ALREADY_RUNNING

export function handleIntegrationsImpl(method: string, pathWithoutQuery: string): any {
  if (pathWithoutQuery.endsWith('/sync') && method === 'POST') {
    if (syncRunning) {
      throw {
        status: 409,
        message: 'SYNC_ALREADY_RUNNING',
        detail: 'A synchronization is already in progress',
      } as any;
    }
    syncRunning = true;
    return { status: 'RUNNING', startedAt: new Date().toISOString() };
  }
  // GET .../sync/status — позволяет завершить running-состояние в тестах/UI
  if (pathWithoutQuery.endsWith('/sync/status') && method === 'GET') {
    return { running: syncRunning };
  }
  if (pathWithoutQuery.endsWith('/sync/finish') && method === 'POST') {
    syncRunning = false;
    return { status: 'DONE', finishedAt: new Date().toISOString() };
  }
  throw { status: 404, message: 'Not found', detail: `Route ${pathWithoutQuery} not implemented in mock` };
}

export function trySyncRoutes<T>(method: string, pathWithoutQuery: string, path: string, body?: any): { hit: true; result: T } | { hit: false } {
  // ЗАДАЧА 2 (SyncLogsPage на api-клиент): mock-роуты журнала синков и sync/prices
  if (pathWithoutQuery === '/admin/sync-logs/kpi' && method === 'GET') {
    return { hit: true, result: { totalRuns: 0, successRate: 0, totalUpdated: 0, totalErrors: 0 } as T };
  }
  if (pathWithoutQuery === '/admin/sync-logs' && method === 'GET') {
    return { hit: true, result: [] as T };
  }
  // U11 mock-parity: список интеграций — GET /admin/integrations (IntegrationDto)
  if (pathWithoutQuery === '/admin/integrations' && method === 'GET') {
    return { hit: true, result: [{ ...integrationState }] as T };
  }
  // U11 mock-parity: журнал синхронизаций — GET /admin/integrations/sync-logs (SyncLogDto)
  if (pathWithoutQuery === '/admin/integrations/sync-logs' && method === 'GET') {
    return { hit: true, result: integrationSyncLogs.map(l => ({ ...l })) as T };
  }
  // U11 mock-parity: подключение/отключение — POST /admin/integrations/:provider/(dis)connect
  const integConn = pathWithoutQuery.match(/^\/admin\/integrations\/([^/]+)\/(connect|disconnect)$/);
  if (integConn && method === 'POST') {
    const [, provider, action] = integConn;
    if (provider !== integrationState.provider) {
      throw { status: 404, message: 'Integration not found: ' + provider, detail: `Unknown provider ${provider}` } as any;
    }
    integrationState = {
      ...integrationState,
      status: action === 'connect' ? 'CONNECTED' : 'DISCONNECTED',
      lastConnectedAt: action === 'connect' ? new Date().toISOString() : integrationState.lastConnectedAt,
      errorMessage: action === 'connect' ? 'Connected successfully' : null,
    };
    return { hit: true, result: { ...integrationState } as T };
  }

  // Загрузка выгрузки ЕМИСС вручную — POST /admin/integrations/:provider/upload
  // (паритет с IntegrationService.uploadSnapshot: 404 неизвестный провайдер,
  // 400 EMPTY_FILE, 409 SYNC_ALREADY_RUNNING, успех — { logId }; подключение
  // провайдера НЕ требуется: файл админ принес сам, портал не задействован).
  const integUpload = pathWithoutQuery.match(/^\/admin\/integrations\/([^/]+)\/upload$/);
  if (integUpload && method === 'POST') {
    const provider = integUpload[1];
    if (provider !== integrationState.provider) {
      throw { status: 404, message: 'Integration not found: ' + provider, detail: `Unknown provider ${provider}` } as any;
    }
    const fileName = String(body?.__file?.name ?? '');
    const fileSize = Number(body?.__file?.size ?? 0);
    if (!fileName || fileSize <= 0) {
      throw { status: 400, message: 'EMPTY_FILE', detail: 'Загруженный файл пуст' } as any;
    }
    if (syncRunning) {
      throw { status: 409, message: 'SYNC_ALREADY_RUNNING', detail: 'A synchronization is already in progress' } as any;
    }
    syncRunning = true;
    const log = {
      id: integrationSyncLogs.length + 1,
      provider,
      type: 'PRICES',
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      finishedAt: null as string | null,
      createdCount: 0,
      updatedCount: 0,
      errorCount: 0,
    };
    integrationSyncLogs.unshift(log);
    setTimeout(() => {
      log.status = 'SUCCESS';
      log.finishedAt = new Date().toISOString();
      log.createdCount = 3;
      log.updatedCount = 2;
      integrationState = { ...integrationState, lastSyncAt: log.finishedAt };
      syncRunning = false;
    }, 1500);
    return { hit: true, result: { logId: log.id } as T };
  }
  // U11 mock-parity: синхронизация цен — POST /admin/integrations/:provider/sync/prices.
  // Порядок проверок как в IntegrationService.syncPrices: неизвестный провайдер → 404,
  // не подключено → 409 INTEGRATION_DISCONNECTED, уже идёт → 409 SYNC_ALREADY_RUNNING.
  // Успех: 202-подобное тело { logId }, лог асинхронно становится SUCCESS (через 1.5 с)
  // со счётчиками created/updated — как фоновая executePriceSync на реальном бэкенде.
  const integSync = pathWithoutQuery.match(/^\/admin\/integrations\/([^/]+)\/sync\/prices$/);
  if (integSync && method === 'POST') {
    const provider = integSync[1];
    if (provider !== integrationState.provider) {
      throw { status: 404, message: 'Integration not found: ' + provider, detail: `Unknown provider ${provider}` } as any;
    }
    if (integrationState.status !== 'CONNECTED') {
      throw { status: 409, message: 'INTEGRATION_DISCONNECTED', detail: 'Provider is not connected' } as any;
    }
    if (syncRunning) {
      throw {
        status: 409,
        message: 'SYNC_ALREADY_RUNNING',
        detail: 'A synchronization is already in progress',
      } as any;
    }
    syncRunning = true;
    const log = {
      id: integrationSyncLogs.length + 1,
      provider,
      type: 'PRICES',
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      finishedAt: null as string | null,
      createdCount: 0,
      updatedCount: 0,
      errorCount: 0,
    };
    integrationSyncLogs.unshift(log);
    setTimeout(() => {
      log.status = 'SUCCESS';
      log.finishedAt = new Date().toISOString();
      log.createdCount = 3;
      log.updatedCount = 1;
      integrationState = { ...integrationState, lastSyncAt: log.finishedAt };
      syncRunning = false;
    }, 1500);
    return { hit: true, result: { logId: log.id } as T };
  }
  return { hit: false };
}
