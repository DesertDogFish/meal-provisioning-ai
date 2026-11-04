/**
 * Роуты /trips — делегирование в разбитые по R8 модули.
 * Публичный API (`handleTripsImpl`) сохранён.
 */

import { handleTripsPart1 } from './mockTripsPart1';
import { handleTripsPart2 } from './mockTripsPart2';
import { handleTripsPart3 } from './mockTripsPart3';

export function handleTripsImpl(srv: any, method: string, path: string, body?: any): any {
  const r1 = handleTripsPart1(srv, method, path, body);
  if (r1 !== undefined) return r1;
  const r2 = handleTripsPart2(srv, method, path, body);
  if (r2 !== undefined) return r2;
  return handleTripsPart3(srv, method, path, body);
}
