/**
 * Fix-3 / PLAN R2: серверные исключения закупки — источник истины для
 * «soft-disable» позиций. Клиентский стейдж (tripStaging) остаётся мгновенным
 * кэшем для перерисовки, но при загрузке страницы набор сверяется с сервером,
 * а каждое переключение синхронизируется идемпотентным PUT (весь набор).
 *
 * Ограничение: по-дневные исключения (ключ '<dayDate>::<id>', Fix-2 п.5) на
 * сервере пока не хранятся — контракт расширения описан в PLAN (R2, шаг 2).
 * Синхронизируются только глобальные ключи (чистые ingredientId).
 */
import { api } from './client';

/** Прочитать серверный набор исключений (ошибка сети/роута → пустой набор). */
export async function getServerExclusions(tripId: string): Promise<string[]> {
  try {
    const data = await api.get<Array<string | number>>(`/trips/${tripId}/shopping-exclusions`);
    return Array.isArray(data) ? data.map(String) : [];
  } catch {
    return [];
  }
}

/** Идемпотентно заменить серверный набор (только глобальные ключи, без '::'). */
export async function syncServerExclusions(tripId: string, keys: Iterable<string>): Promise<void> {
  const globals = [...keys].filter(k => !k.includes('::'));
  try {
    await api.put(`/trips/${tripId}/shopping-exclusions`, { ingredientIds: globals });
  } catch {
    /* mock/офлайн/403 — клиентский стейдж уже сохранён, не ломаем UI */
  }
}
