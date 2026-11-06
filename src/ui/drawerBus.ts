/**
 * Шина открытия бокового меню.
 *
 * Зачем: мобильное верхнее табло (Layout) убрано по UX-списку владельца п.13, а кнопка
 * вызова меню переехала в шапки страниц («…перед кнопкой назад», п.23). Шапки живут
 * глубоко внутри дерева маршрутов, поэтому вместо протаскивания колбэка через все
 * страницы используется минимальная шина: страница дёргает `openAppDrawer()`,
 * Layout подписан и открывает drawer.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Открыть боковое меню (вызывается из кнопки-гамбургера в шапке страницы). */
export function openAppDrawer(): void {
  listeners.forEach((l) => l());
}

/** Подписка Layout'а. Возвращает функцию отписки. */
export function onOpenAppDrawer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
