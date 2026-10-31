/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 14): фокус-ловушка
 * оверлеев.
 *
 * Правило дизайн-пака: пока открыт диалог, Tab/Shift+Tab ходят ТОЛЬКО внутри
 * него — фокус не уходит под затемнение на элементы страницы. Без ловушки
 * клавиатурный пользователь «проваливался» в невидимый контент behind overlay.
 *
 * Все переводы фокуса — с `preventScroll: true`: браузерный focus() по
 * умолчанию делает scroll-into-view, а это и есть механизм KB-29 (лист
 * модалки прокручивался в момент фокуса, координатный клик глотался).
 */

/** Селектор фокусируемых элементов: только видимые и не отключённые. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Фокусируемые элементы внутри корня — в DOM-порядке. */
export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => {
    if (el.hasAttribute('hidden') || el.hasAttribute('inert')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // визуально скрытые (sr-only) элементы в Tab-цикл не берём
    if (el.classList.contains('sr-only')) return false;
    return true;
  });
}

/**
 * Обработчик Tab внутри оверлея: замыкает цикл. Вызывается из onKeyDown
 * контейнера оверлея (событие всплывает от сфокусированного потомка).
 */
export function trapTab(event: { key: string; shiftKey?: boolean; preventDefault(): void }, root: HTMLElement | null): void {
  if (event.key !== 'Tab' || !root) return;
  const items = focusableIn(root);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement as HTMLElement | null;
  const idx = active ? items.indexOf(active) : -1;
  // фокус вне цикла (например, на самом листе) — заводим внутрь
  if (idx === -1) {
    event.preventDefault();
    items[0].focus({ preventScroll: true });
    return;
  }
  const next = event.shiftKey
    ? items[(idx - 1 + items.length) % items.length]
    : items[(idx + 1) % items.length];
  // preventDefault обязателен: иначе браузер уведёт фокус за пределы оверлея
  event.preventDefault();
  if (next !== active) next.focus({ preventScroll: true });
}
