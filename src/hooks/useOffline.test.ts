import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { useOffline } from './useOffline';

describe('useOffline', () => {
  it('returns online and offlineMode', () => {
    const { result } = renderHook(() => useOffline());
    expect(typeof result.current.online).toBe('boolean');
    expect(typeof result.current.offlineMode).toBe('boolean');
  });
});