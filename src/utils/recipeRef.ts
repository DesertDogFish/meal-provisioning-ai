/**
 * Navigation-п.5 (2026-10-31): резолв trip-снепшота блюда в глобальный каталог —
 * единый источник для ссылок `/recipes?edit=` (Fix-2 п.7, модалка состава) и
 * `/recipes?view=` (sheet просмотра блюда из меню похода).
 *
 * real-режим: trip-копия блюда имеет `snapshotOf` → id оригинала в каталоге.
 * mock-режим: id копии несёт суффикс `::t<tripId>` → базовый id.
 */
export function globalCatalogRecipeId(
  recipeId: string | number,
  tripRecipes: { id: string | number; snapshotOf?: string | number | null }[],
): string {
  const id = String(recipeId);
  const snap = tripRecipes.find(r => String(r.id) === id);
  if (snap?.snapshotOf != null) return String(snap.snapshotOf);
  if (id.includes('::t')) return id.split('::t')[0];
  return id;
}
