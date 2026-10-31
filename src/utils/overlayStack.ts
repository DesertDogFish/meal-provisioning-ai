/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 14): иерархия
 * оверлеев.
 *
 * Правило дизайн-пака: «Esc закрывает ВЕРХНИЙ оверлей». Каждый оверлей
 * (<Modal>, <BottomSheet>) вешает свой window-keydown, поэтому без общего
 * стека одно нажатие Esc закрывало всю стопку сразу: ConfirmDialog поверх
 * модалки состава обнулял и диалог, и несохранённый состав под ним.
 *
 * Стек — массив «живых» оверлеев в порядке открытия; `isTopOverlay` отвечает,
 * имеет ли данный оверлей право реагировать на Esc.
 */

export interface OverlayEntry {
  readonly id: number;
}

const stack: OverlayEntry[] = [];
let seq = 0;

/** Зарегистрировать открытый оверлей (вызывается в effect на монтировании). */
export function pushOverlay(): OverlayEntry {
  const entry: OverlayEntry = { id: ++seq };
  stack.push(entry);
  return entry;
}

/** Снять оверлей с вершины стека (вызывается в cleanup). */
export function popOverlay(entry: OverlayEntry): void {
  const idx = stack.indexOf(entry);
  if (idx >= 0) stack.splice(idx, 1);
}

/** Текущий оверлей — верхний? Только он реагирует на Esc. */
export function isTopOverlay(entry: OverlayEntry): boolean {
  return stack.length > 0 && stack[stack.length - 1] === entry;
}

/** Глубина стека — для тестов/диагностики. */
export function overlayDepth(): number {
  return stack.length;
}
