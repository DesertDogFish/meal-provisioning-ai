/** Barrel / re-export layer for the split mockTrips route handlers (R8). */

export { handleTripsPart1 } from './mockTripsPart1';
export { handleTripsPart2 } from './mockTripsPart2';
export { handleTripsPart3 } from './mockTripsPart3';
export { MAX_CHECKLIST_BOUGHT_ITEMS, isoDay } from './mockTripsShared';

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
