import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import * as syncLogs from './syncLogs';

afterEach(() => {
  api.setMode('real');
});

describe('api/syncLogs (mock parity)', () => {
  it('getSyncLogs returns array', async () => {
    api.setMode('mock');
    const res = await syncLogs.getSyncLogs();
    expect(Array.isArray(res)).toBe(true);
  });

  it('getSyncLogsKpi returns data', async () => {
    api.setMode('mock');
    const res = await syncLogs.getSyncLogsKpi('7');
    expect(res).toBeDefined();
  });
});