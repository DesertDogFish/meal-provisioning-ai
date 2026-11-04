/** Shared helpers for mockTrips route handlers (split for R8). */

export const MAX_CHECKLIST_BOUGHT_ITEMS = 2000;

export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
