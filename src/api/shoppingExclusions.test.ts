import { describe, it, expect, vi } from 'vitest';

vi.mock('./client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), del: vi.fn() },
}));

import { api } from './client';
import {
  exclusionKey, parseExclusionKey, getServerExclusions, syncServerExclusions,
} from './shoppingExclusions';

describe('shoppingExclusions (Fix-5 / R2 шаг 2) — клиентские ключи ↔ серверная форма', () => {
  it('глобальное исключение: ключ без даты', () => {
    expect(exclusionKey('42', null)).toBe('42');
    expect(exclusionKey(42, undefined)).toBe('42');
    expect(parseExclusionKey('42')).toEqual({ ingredientId: '42', dayDate: null });
  });

  it('по-дневное исключение: ключ <дата>::<id>, round-trip', () => {
    const key = exclusionKey('7', '2026-06-02');
    expect(key).toBe('2026-06-02::7');
    expect(parseExclusionKey(key)).toEqual({ ingredientId: '7', dayDate: '2026-06-02' });
    expect(exclusionKey(parseExclusionKey(key).ingredientId, parseExclusionKey(key).dayDate)).toBe(key);
  });

  it('GET: объектная форма → ключи (глобальные и дневные)', async () => {
    (api.get as any).mockResolvedValue([
      { ingredientId: 5, dayDate: null },
      { ingredientId: 7, dayDate: '2026-06-02' },
    ]);
    const keys = await getServerExclusions('t1');
    expect(keys).toEqual(['5', '2026-06-02::7']);
  });

  it('GET: legacy-форма (плоский список id) тоже читается', async () => {
    (api.get as any).mockResolvedValue([5, '7']);
    expect(await getServerExclusions('t1')).toEqual(['5', '7']);
  });

  it('GET: ошибка сети → пустой набор (не ломаем страницу)', async () => {
    (api.get as any).mockRejectedValue(new Error('network'));
    expect(await getServerExclusions('t1')).toEqual([]);
  });

  it('PUT: отправляет канон-форму items (dayDate для дневных ключей)', async () => {
    (api.put as any).mockResolvedValue([]);
    await syncServerExclusions('t1', ['5', '2026-06-02::7']);
    expect(api.put).toHaveBeenCalledWith('/trips/t1/shopping-exclusions', {
      items: [
        { ingredientId: '5', dayDate: null },
        { ingredientId: '7', dayDate: '2026-06-02' },
      ],
    });
  });

  it('PUT: ошибка сети не пробрасывается (best effort)', async () => {
    (api.put as any).mockRejectedValue(new Error('403'));
    await expect(syncServerExclusions('t1', ['5'])).resolves.toBeUndefined();
  });
});
