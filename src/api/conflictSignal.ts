/**
 * BL-41 (AU-13, аудит 30.10.2026): сигнал «оптимистичная блокировка сорвалась».
 *
 * Бэкенд держит `@Version` на агрегатах похода и на конфликте отвечает
 * `409 CONCURRENT_MODIFICATION` («Данные изменились, пока вы их редактировали»).
 * Раньше такой ответ доходил до вызывающего кода как обычная ошибка: диалог
 * «обновите данные» не показывался, пользователь молча оставался на устаревшем
 * экране (или повторял правку и получал тот же 409).
 *
 * Здесь — единственная точка, через которую конфликт поднимается на уровень UI:
 * `client.ts` вызывает `notifyConcurrentModification()` на любой 409 с этим кодом,
 * а страница похода подписывается и показывает диалог с повторной загрузкой.
 *
 * Почему событие, а не исключение до каждого вызывающего: конфликт может
 * прилететь из ЛЮБОЙ мутации (состав приёма, правки состава, цены, чеклист) —
 * прокидывать его через десяток колбэков значило бы забыть один.
 */

export const CONCURRENT_MODIFICATION_CODE = 'CONCURRENT_MODIFICATION';

type Listener = () => void;

const listeners = new Set<Listener>();

/** Подписка на конфликт. Возвращает функцию отписки (для useEffect). */
export function onConcurrentModification(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Разослать сигнал всем подписчикам. Ошибка одного подписчика не должна
 * ломать остальные и не должна глушить исходное исключение запроса.
 */
export function notifyConcurrentModification(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (err) {
      console.error('[conflict-signal] listener failed:', err);
    }
  }
}

/** Сброс подписчиков — только для тестов (изоляция между сценариями). */
export function resetConcurrentModificationListeners(): void {
  listeners.clear();
}

/**
 * Является ли ошибка конфликтом оптимистичной блокировки.
 *
 * Учитываем обе формы, в которых ошибка доходит до кода:
 *  - real: `ApiClientError` → статус и detail лежат в `err.error` (message = detail);
 *  - mock/плоский объект: `{ status, detail }` в корне.
 * 409 без кода CONCURRENT_MODIFICATION — ДРУГОЙ конфликт (уникальность, занятый
 * email, уже идущая синхронизация), его нельзя показывать как «данные устарели».
 */
export function isConcurrentModification(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: unknown;
    detail?: unknown;
    title?: unknown;
    message?: unknown;
    error?: { status?: unknown; detail?: unknown; title?: unknown };
  };
  const status = Number(e.status ?? e.error?.status);
  const detail = String(e.detail ?? e.error?.detail ?? e.message ?? '');
  const title = String(e.title ?? e.error?.title ?? '');
  return status === 409
    && (detail.includes(CONCURRENT_MODIFICATION_CODE) || title.includes(CONCURRENT_MODIFICATION_CODE));
}
