/**
 * Флаг «приложение только что стартовало» (UX-список владельца п.17).
 *
 * В Android-оболочке после рестарта WebView восстанавливает последний URL, и если он не
 * совпадает ни с одним маршрутом, пользователь попадает на «Страница не найдена» вместо
 * списка походов. Пока флаг `booting` взведён, NotFoundPage делает мгновенный
 * `navigate('/trips', { replace: true })`; после первого кадра флаг снимается, и
 * осознанный 404 внутри сессии (BL-66) продолжает показываться как раньше.
 */
let booting = true;

export function isBooting(): boolean {
  return booting;
}

export function markBooted(): void {
  booting = false;
}
