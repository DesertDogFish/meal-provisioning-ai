import { describe, it, expect, vi } from 'vitest';
import { resolveConflict } from '../sync/ConflictResolver';

describe('ConflictResolver', () => {
  it('server-wins returns server version', () => {
    const local = { id: '1', name: 'local', updatedAt: '2026-01-01' };
    const server = { id: '1', name: 'server', updatedAt: '2026-01-02' };
    const result = resolveConflict(local, server, 'server-wins');
    expect(result.name).toBe('server');
  });

  it('client-wins returns local version', () => {
    const local = { id: '1', name: 'local', updatedAt: '2026-01-01' };
    const server = { id: '1', name: 'server', updatedAt: '2026-01-02' };
    const result = resolveConflict(local, server, 'client-wins');
    expect(result.name).toBe('local');
  });

  it('merge returns newer version', () => {
    const local = { id: '1', name: 'local', updatedAt: '2026-01-03' };
    const server = { id: '1', name: 'server', updatedAt: '2026-01-02' };
    const result = resolveConflict(local, server, 'merge');
    expect(result.name).toBe('local');
  });

  it('merge returns server if server newer', () => {
    const local = { id: '1', name: 'local', updatedAt: '2026-01-01' };
    const server = { id: '1', name: 'server', updatedAt: '2026-01-02' };
    const result = resolveConflict(local, server, 'merge');
    expect(result.name).toBe('server');
  });
});