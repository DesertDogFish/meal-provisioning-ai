/**
 * Fix-3 / PLAN R2: серверные исключения закупки — источник истины для
 * «soft-disable» позиций. Клиентский стейдж (tripStaging) остаётся мгновенным
 * кэшем для перерисовки, но при загрузке страницы набор сверяется с сервером,
 * а каждое переключение синхронизируется идемпотентным PUT (весь набор).
 *
 * Fix-5 / R2 (шаг 2): контракт расширен по-дневными исключениями —
 * элемент {ingredientId, dayDate|null}; dayDate=null = весь поход.
 * Клиентский ключ множества: '<ingredientId>' (глобальное) либо
 * '<dayDate>::<ingredientId>' (по-дневное) — см. calculations.isRowExcluded.
 */
import { api } from './client';

export interface ServerExclusionItem {
  ingredientId: string | number;
  dayDate?: string | null;
}

/** Ключ клиентского множества из серверного элемента. */
export function exclusionKey(ingredientId: string | number, dayDate?: string | null): string {
  return dayDate ? `${dayDate}::${ingredientId}` : String(ingredientId);
}

/** Разбор клиентского ключа на ingredientId/dayDate для отправки на сервер. */
export function parseExclusionKey(key: string): { ingredientId: string; dayDate: string | null } {
  const idx = key.indexOf('::');
  if (idx < 0) return { ingredientId: key, dayDate: null };
  return { ingredientId: key.slice(idx + 2), dayDate: key.slice(0, idx) };
}

/** Прочитать серверный набор исключений как клиентские ключи (ошибка → []). */
export async function getServerExclusions(tripId: string): Promise<string[]> {
  try {
    const data = await api.get<Array<ServerExclusionItem | string | number>>(`/trips/${tripId}/shopping-exclusions`);
    if (!Array.isArray(data)) return [];
    return data.map(item =>
      item != null && typeof item === 'object'
        ? exclusionKey(item.ingredientId, item.dayDate)
        : String(item), // legacy-форма: плоский список id (глобальные)
    );
  } catch {
    return [];
  }
}

/** Идемпотентно заменить серверный набор (канон-форма items с dayDate). */
export async function syncServerExclusions(tripId: string, keys: Iterable<string>): Promise<void> {
  const items = [...keys].map(k => parseExclusionKey(k));
  try {
    await api.put(`/trips/${tripId}/shopping-exclusions`, { items });
  } catch {
    /* mock/офлайн/403 — клиентский стейдж уже сохранён, не ломаем UI */
  }
}
