import { afterEach, describe, expect, it } from 'vitest';
import { api } from './client';
import * as catalogImport from './catalogImport';

afterEach(() => {
  api.setMode('real');
});

describe('api/catalogImport (mock parity)', () => {
  it('module exports functions', () => {
    expect(typeof catalogImport.approveStaging).toBe('function');
    expect(typeof catalogImport.rejectStaging).toBe('function');
  });
});