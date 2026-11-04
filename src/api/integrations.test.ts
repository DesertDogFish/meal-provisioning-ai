import { afterEach, describe, expect, it } from 'vitest';

import { api } from './client';
import * as integrations from './integrations';

afterEach(() => {
  api.setMode('real');
});

describe('api/integrations (mock parity)', () => {
  it('getIntegrations returns array', async () => {
    api.setMode('mock');
    const res = await integrations.getIntegrations();
    expect(Array.isArray(res)).toBe(true);
  });
});