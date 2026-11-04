/**
 * KB-15: отметки «взято» чеклиста похода — серверный источник истины.
 *
 * Раньше отметки жили ТОЛЬКО в localStorage (`trip-checklist-bought-{tripId}`),
 * поэтому на другом устройстве/в другой сессии чеклист был «чистым».
 * Теперь сервер хранит набор пар {ingredientId, neededStamp}, а localStorage
 * остаётся локальным кэшем и буфером офлайн-записи («в магазине нет связи»):
 *  - каждое переключение → идемпотентный PUT всего набора (best effort);
 *  - при загрузке похода локальный набор объединяется с серверным, недостающие
 *    серверу локальные отметки досылаются (см. tripStaging.refreshBoughtFromServer).
 *
 * Клиентский ключ совпадает с `checklistRowKey` (utils/checklist.ts:115):
 * `<ingredientId>@<needed*1000>` — отметка привязана к потребности, поэтому
 * изменение количества автоматически снимает «взято».
 *
 * ВАЖНО: `getServerBought` возвращает null при ошибке/недоступности сервера —
 * пустой набор ≠ недоступность, иначе офлайн-отметки были бы затёрты пустотой.
 * Неизвестный формат ответа (не массив) тоже null: контракт не подтверждён, и
 * трактовать его как «на сервере пусто» значило бы затереть серверные отметки.
 *
 * Контракт после аудита KB-15 (два MAJOR):
 *  A) `neededStamp = 0` — ЛЕГАЛЬНОЕ значение (нулевая потребность: «взять всё»
 *     одним кликом кладёт ключ `<id>@0`; backend — `@PositiveOrZero`). Поэтому
 *     штамп 0 не фильтруется, а неотправляемыми считаются только НЕЦЕЛЫЕ и
 *     ОТРИЦАТЕЛЬНЫЕ штампы (isSendableBoughtKey) — иначе один мусорный ключ
 *     валил бы весь PUT (400), а dirty-флаг становился вечным;
 *  B) ingredientId в mock-режиме СТРОКОВЫЙ ('ing7'): mock принимает его
 *     (сравнение `String(p.id) === String(ingredientId)`), поэтому клиент
 *     отправляет строковый id как есть. На боевом backend id числовые —
 *     numeric-строка по-прежнему уходит числом (Long), регресса нет.
 */
import { api } from './client';

export interface ServerChecklistBoughtItem {
  /** backend — Long, mock-каталог — 'ingN'; клиент поддерживает оба (см. выше B). */
  ingredientId: number | string;
  /** needed * 1000; 0 — валиден (нулевая потребность). */
  neededStamp: number;
}

/** Клиентский ключ отметки из серверной пары (обратен parseBoughtKey). */
export function boughtKey(ingredientId: string | number, neededStamp: number): string {
  return `${String(ingredientId)}@${neededStamp}`;
}

/**
 * Разбор клиентского ключа `<id>@<stamp>`; битые ключи → null.
 *
 * Штамп — ЦЕЛОЕ НЕОТРИЦАТЕЛЬНОЕ число (ключ собирается как `Math.round(needed*1000)`,
 * поэтому 0 — норма, а дробь/минус означают испорченный кэш). Отрицательный или
 * дробный штамп, пустой id, нечисловой штамп → null: такой ключ не отправляется
 * на сервер (один битый элемент валит идемпотентный PUT целиком — 400 на набор).
 */
export function parseBoughtKey(key: string): { ingredientId: string; neededStamp: number } | null {
  if (typeof key !== 'string') return null;
  const idx = key.indexOf('@');
  if (idx <= 0) return null;
  const ingredientId = key.slice(0, idx);
  const rawStamp = key.slice(idx + 1).trim();
  // только десятичное целое без знака: '-5', '1.5', '0x10', 'abc', '' → битый ключ
  if (!/^\d+$/.test(rawStamp)) return null;
  const stamp = Number(rawStamp);
  if (!Number.isSafeInteger(stamp)) return null;
  return { ingredientId, neededStamp: stamp };
}

/**
 * Можно ли отправить ключ на сервер (единственный критерий отправляемости).
 * Всё, что не разбирается parseBoughtKey, остаётся локально, но на сервер не
 * уезжает и dirty-флаг держать не должно (tripStaging вычищает такие ключи из
 * кэша после успешного PUT).
 */
export function isSendableBoughtKey(key: string): boolean {
  return parseBoughtKey(key) !== null;
}

/**
 * Серверный id: числовые id отправляем числом (backend `Long ingredientId`),
 * строковые ('ingN' в mock-режиме) — строкой как есть. Отбрасываем только
 * пустые строки: mock принимает строковые id, и отбрасывание делало набор
 * вручную добавленных позиций неотправляемым (dirty навсегда), а смешанный
 * набор — «частично отправленным», после чего следующая гидрация молча стирала
 * строковые отметки (аудит KB-15, MAJOR B).
 */
function toServerId(id: string): number | string | null {
  const trimmed = id.trim();
  if (trimmed === '') return null;
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
}

/**
 * Прочитать серверный набор отметок как клиентские ключи.
 * null = сервер недоступен/ошибка (НЕ пустой набор) — вызывающий не должен
 * перезаписывать локальный кэш.
 */
export async function getServerBought(tripId: string): Promise<string[] | null> {
  try {
    const data = await api.get<Array<ServerChecklistBoughtItem | string>>(`/trips/${tripId}/checklist-bought`);
    // Не-массив = контракт не выполнен (прокси/ошибка/другой формат) → это
    // НЕДОСТУПНОСТЬ (null), а не пустой набор: иначе refresh принял бы «[]» за
    // истину и стёр серверные отметки в локальном кэше.
    if (!Array.isArray(data)) return null;
    const keys: string[] = [];
    for (const item of data) {
      if (item == null) continue;
      if (typeof item === 'object') {
        const { ingredientId, neededStamp } = item as ServerChecklistBoughtItem;
        if (ingredientId == null) continue;
        const stamp = Number(neededStamp);
        if (!Number.isFinite(stamp)) continue;
        keys.push(boughtKey(ingredientId, Math.round(stamp)));
      } else if (typeof item === 'string' && isSendableBoughtKey(item)) {
        keys.push(item); // legacy/упрощённая форма: готовый ключ
      }
    }
    return keys;
  } catch {
    return null;
  }
}

/** Итог отправки набора: что уехало и что отброшено как неотправляемое. */
export interface SyncBoughtResult {
  /** PUT принят сервером (true) / не выполнен либо отвергнут (false). */
  ok: boolean;
  /** Сколько пар реально ушло в payload. */
  sent: number;
  /**
   * Ключи, которые невозможно отправить (битые/дробные/отрицательные, пустой
   * id). На ok НЕ влияют: сервер получил полный валидный остаток набора.
   * Вызывающий (tripStaging) вычищает их из локального кэша — иначе они
   * навсегда держали бы dirty-флаг.
   */
  rejected: string[];
}

/** Короткое описание ошибки api-клиента для диагностики (статус + текст). */
function describeError(err: unknown): { status?: number; detail: string } {
  const e = err as { status?: number; detail?: string; message?: string } | null;
  return {
    status: typeof e?.status === 'number' ? e.status : undefined,
    detail: String(e?.detail ?? e?.message ?? err ?? 'unknown'),
  };
}

/**
 * Идемпотентно заменить серверный набор отметок (полная замена `items`).
 * Ошибка → `{ ok: false }` (не бросаем): локальный кэш уже сохранён,
 * офлайн-сценарий продолжает работать, набор досылается при следующей загрузке.
 *
 * Диагностика (аудит KB-15, R10): ошибка PUT больше не «немая» — в консоль
 * уходят tripId, число элементов и статус/текст ошибки; отброшенные ключи
 * логируются отдельно.
 */
export async function syncServerBought(tripId: string, keys: Iterable<string>): Promise<SyncBoughtResult> {
  const items: ServerChecklistBoughtItem[] = [];
  const rejected: string[] = [];
  let sawKey = false;
  for (const key of keys) {
    sawKey = true;
    const parsed = parseBoughtKey(key);
    if (!parsed) {
      rejected.push(String(key));
      continue;
    }
    const ingredientId = toServerId(parsed.ingredientId);
    if (ingredientId == null) {
      rejected.push(String(key));
      continue;
    }
    items.push({ ingredientId, neededStamp: parsed.neededStamp });
  }
  if (rejected.length > 0) {
    console.warn(
      // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
      `[checklist-bought] ${rejected.length} unsendable key(s) skipped for trip ${tripId}:`,
      rejected.slice(0, 10),
    );
  }
  if (sawKey && items.length === 0) {
    // Ключи есть, но ни один не пригоден к отправке. Пустая ПОЛНАЯ замена
    // стёрла бы ВСЕ серверные отметки — такую отправку не делаем и сообщаем
    // «не синхронизировано»: набор остаётся dirty и не затёрт серверным снимком
    // (см. tripStaging.refreshBoughtFromServer).
    console.warn(`[checklist-bought] nothing sendable for trip ${tripId} — PUT skipped`);
    return { ok: false, sent: 0, rejected };
  }
  try {
    await api.put(`/trips/${tripId}/checklist-bought`, { items });
    return { ok: true, sent: items.length, rejected };
  } catch (err) {
    const { status, detail } = describeError(err);
    console.warn(
      `[checklist-bought] PUT failed for trip ${tripId}: ${items.length} item(s), ` +
      `status=${status ?? 'n/a'}, ${detail}`,
    );
    return { ok: false, sent: 0, rejected };
  }
}
