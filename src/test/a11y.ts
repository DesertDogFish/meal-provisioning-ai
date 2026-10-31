/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 6).
 *
 * Probe «кнопки без accessible name» из harness'а визуального осмотра,
 * перенесённый в репозиторий как регресс-страж: раньше иконочные кнопки
 * («Правка», «Удалить», глазик пароля, крестики модалок/тостов) несли только
 * `title` или не несли ничего — скринридер объявлял их «button» без имени.
 *
 * Порядок вычисления имени — по W3C Accname (упрощённо, без aria-labelledby,
 * который требует runtime-резолва другого узла):
 *   aria-label → текст содержимого → title.
 *
 * Скрытые элементы (`hidden`, `display:none` через класс, `aria-hidden`)
 * в подсчёт не входят: они не попадают в дерево доступности.
 */

/** Доступное имя элемента (упрощённый Accname) или пустая строка. */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();
  // картинка/иконка с alt внутри кнопки — тоже источник имени
  const alt = el.querySelector('img[alt]')?.getAttribute('alt');
  if (alt && alt.trim()) return alt.trim();
  return '';
}

/** Кнопка не участвует в дереве доступности (скрыта/помечена декоративной). */
function isExposed(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('hidden')) return false;
  const cls = el.className;
  if (typeof cls === 'string' && /(^|\s)hidden(\s|$)/.test(cls)) return false;
  return true;
}

/**
 * Все кнопки контейнера без доступного имени.
 * Проверяются `<button>` и `role="button"` — те же элементы, что и в probe осмотра.
 */
export function namelessButtons(root: ParentNode = document): Element[] {
  const nodes = Array.from(root.querySelectorAll<Element>('button, [role="button"]'));
  return nodes.filter(el => isExposed(el) && !accessibleName(el));
}

/**
 * Assert для тестов: «probe nameless = 0» (критерий приёмки подзадачи 6).
 * Возвращает список, чтобы тест сам сформировал сообщение об ошибке.
 */
export function expectNoNamelessButtons(root: ParentNode = document): void {
  const bad = namelessButtons(root);
  if (bad.length > 0) {
    const dump = bad
      .map(el => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}"> ${el.innerHTML.slice(0, 80)}`)
      .join('\n  ');
    throw new Error(`Найдены кнопки без accessible name (${bad.length}):\n  ${dump}`);
  }
}
