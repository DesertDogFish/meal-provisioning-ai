import { describe, it, expect, vi } from 'vitest';

import { NetworkMonitor } from './NetworkMonitor';

describe('NetworkMonitor', () => {
  it('isOnline returns boolean', () => {
    const nm = new NetworkMonitor();
    expect(typeof nm.isOnline()).toBe('boolean');
  });

  it('subscribe returns unsubscribe function', () => {
    const nm = new NetworkMonitor();
    const cb = vi.fn();
    const unsub = nm.subscribe(cb);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});