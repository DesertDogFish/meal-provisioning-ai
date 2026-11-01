/**
 * Фаза 13 (п.4/5): общий клиентский стейдж правок «в рамках похода».
 *
 * ОДНА точка истины для:
 *  - фактических цен (черновики из инлайн-поля «Закупка» и из этапа ④ «Чеки и итог»),
 *  - soft-disable позиций (исключение продукта из расчёта без удаления),
 *  - пер-походных замещений ингредиентов в блюдах (не трогают каталог).
 *
 * Состояние живёт в localStorage по id похода и синхронизируется между
 * вкладками через событие 'storage' + собственный BroadcastEvent — поэтому
 * ввод фактической цены сразу влияет на «По дням» и «На человека» и НЕ
 * сбрасывается при размонтировании вкладок.
 */
import { getServerBought, syncServerBought } from '../api/checklist';

export interface ActualPriceDraft {
  price: number;
  /** ₽ за всю позицию по чеку (для подписей в UI) */
  total: number;
  /** Fix-5 (п.12): сколько РЕАЛЬНО куплено (в единицах продукта) — для отчёта.
   * Не заполнено = куплено ровно по расчёту. */
  qty?: number | null;
  /** Fix-7 (п.17) → Fix-8 (п.6): DEPRECATED — потребность на момент ввода.
   * Факты больше НЕ аннулируются при изменении потребности (смена числа людей
   * не должна стирать введённые закупки); поле сохранено только для
   * legacy-записей в localStorage и не читается UI. Цена за единицу
   * применяется к текущему «нужно», суммы пересчитываются автоматически. */
  neededAt?: number | null;
}

/** Замещение продукта в блюде в рамках конкретного похода (trip-level). */
export interface TripSubstitution {
  recipeId: string;
  fromIngredientId: string;
  toIngredientId: string;
  amountPerServing: number; // количество замещаемого ингредиента на порцию
  ratio: number;            // коэффициент пересчёта количества (кол-во to = from * ratio)
  comment?: string;
}

const PRICES_KEY = (tripId: string) => `trip-actual-prices-${tripId}`;
const EXCLUDED_KEY = (tripId: string) => `trip-shopping-excluded-${tripId}`;
const SUBST_KEY = (tripId: string) => `trip-substitutions-${tripId}`;
/** KB-15: отметки «взято» в чеклисте закупки. Сервер (`GET/PUT
 * /trips/:id/checklist-bought`) — источник истины, localStorage — локальный
 * кэш и буфер офлайн-записи (долг R1/R2, как у исключений). */
const BOUGHT_KEY = (tripId: string) => `trip-checklist-bought-${tripId}`;
/**
 * KB-15: признак «в локальном кэше есть отметки, которых ещё НЕТ на сервере»
 * (офлайн-правки в магазине без связи).
 *
 * Это НЕ данные похода и не новое хранилище стейджа в смысле AGENTS §12:
 * значение — единственный литерал '1', оно не описывает ни одной позиции
 * чеклиста и не читается как доменное состояние. Флаг нужен ровно для того,
 * чтобы после перезагрузки страницы без сети офлайн-отметки не были приняты
 * за «устаревший кэш» и не затёрты серверным набором (семантика «сервер
 * побеждает» применяется только к чистому кэшу). Сами отметки, как и раньше,
 * лежат в trip-checklist-bought-{tripId}; новых сущностей данных нет.
 */
const BOUGHT_DIRTY_KEY = (tripId: string) => `trip-checklist-bought-dirty-${tripId}`;
/** Мягкий таймаут ожидания сервера при гидрации отметок (печать/загрузчик/список):
 * сеть не должна вешать экран — не дождались, работаем на локальном кэше. */
export const BOUGHT_SYNC_SOFT_TIMEOUT_MS = 1500;
/** Fix-6 (п.8): сколько РЕАЛЬНО берём/взяли — свободно: {amount, unit}
 * («300 г» для майонеза в штуках, «2 кг» для картошки в штуках…). unit —
 * человеческая единица ввода ('г'|'кг'|'мл'|'л'|'шт'|'уп'). */
const ACTUAL_QTY_KEY = (tripId: string) => `trip-checklist-actualqty-${tripId}`;

export interface ChecklistActual {
  amount: number;
  unit: string;
  /** Fix-8 (п.6): DEPRECATED — см. ActualPriceDraft.neededAt (больше не читается UI) */
  neededAt?: number | null;
}

/**
 * Fix-7 (п.17) → Fix-8 (п.6): DEPRECATED — штамп потребности больше не
 * используется для аннулирования фактов. «Если я поменял количество человек
 * в походе, это не значит, что надо удалять все значения, которые я вводил
 * по закупкам»: факты (цена чека, «Взяли») переживают смену потребности,
 * суммы пересчитываются от текущего «нужно». Функция сохранена для чтения
 * legacy-записей и совместимости тестов.
 */
export function neededStamp(needed: number | null | undefined): number {
  return Math.round((Number(needed) || 0) * 1000);
}

/**
 * DEPRECATED (Fix-8, п.6): свежесть факта больше не gating-критерий —
 * потребители (закупка/дни/на человека/чек/чеклист/отчёт/KPI) применяют
 * факт при любой потребности. Функция оставлена для legacy-кода/тестов.
 */
export function factIsFresh(
  fact: unknown,
  needed: number | null | undefined,
): boolean {
  if (fact == null || typeof fact !== 'object') return false;
  const stamp = (fact as { neededAt?: number | null }).neededAt;
  if (stamp == null) return true;
  return stamp === neededStamp(needed);
}

/** Собственное событие — синхронизация между вкладками компонента в одной странице. */
const STAGE_EVENT = 'provision-trip-stage-changed';

type StageKind = 'prices' | 'excluded' | 'subs' | 'bought' | 'qty';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota/SSR — не критично */
  }
}

function notify(tripId: string, kind: StageKind) {
  window.dispatchEvent(new CustomEvent(STAGE_EVENT, { detail: { tripId, kind } }));
}

// ===================== Фактические цены =====================

export function loadActualPrices(tripId: string): Record<string, ActualPriceDraft> {
  const raw = readJson<Record<string, ActualPriceDraft>>(PRICES_KEY(tripId), {});
  return typeof raw === 'object' && raw !== null ? raw : {};
}

export function saveActualPrice(tripId: string, ingredientId: string, draft: ActualPriceDraft | null) {
  const cur = loadActualPrices(tripId);
  if (draft == null) delete cur[ingredientId];
  else cur[ingredientId] = draft;
  writeJson(PRICES_KEY(tripId), cur);
  notify(tripId, 'prices');
}

// ===================== Soft-disable позиций =====================

export function loadExcluded(tripId: string): Set<string> {
  const raw = readJson<unknown>(EXCLUDED_KEY(tripId), []);
  return Array.isArray(raw)
    ? new Set(raw.filter((x): x is string => typeof x === 'string'))
    : new Set();
}

export function setExcluded(tripId: string, next: Set<string>) {
  writeJson(EXCLUDED_KEY(tripId), [...next]);
  notify(tripId, 'excluded');
}

// ===================== Пер-походные замещения =====================

export function loadSubstitutions(tripId: string): TripSubstitution[] {
  const raw = readJson<unknown>(SUBST_KEY(tripId), []);
  return Array.isArray(raw) ? (raw as TripSubstitution[]) : [];
}

/** Сохраняет набор замещений блюда в рамках похода (пустой массив = снять все). */
export function saveRecipeSubstitutions(tripId: string, recipeId: string, subs: TripSubstitution[]) {
  const cur = loadSubstitutions(tripId).filter(s => s.recipeId !== recipeId);
  writeJson(SUBST_KEY(tripId), [...cur, ...subs]);
  notify(tripId, 'subs');
}

/** Быстрый in-memory кэш dirty-признака в рамках сессии; LS — персистентное зеркало. */
const boughtDirtyMem = new Set<string>();

function readBoughtDirtyFlag(tripId: string): boolean {
  try {
    return localStorage.getItem(BOUGHT_DIRTY_KEY(tripId)) === '1';
  } catch {
    return false;
  }
}

/**
 * «Есть несинхронизированные отметки?» — память + персистентный флаг.
 *
 * Память сессии проверяется ПЕРВОЙ: запись в LS могла не пройти (quota,
 * приватный режим, SSR) — тогда единственный след правки живёт в in-memory Set,
 * и игнорировать его значило бы потерять офлайн-отметку. Снимают флаг ровно два
 * события: успешный PUT (clearBoughtDirty) и «пустой» LS-флаг у чистого кэша.
 */
function isBoughtDirty(tripId: string): boolean {
  if (boughtDirtyMem.has(tripId)) return true;
  if (!readBoughtDirtyFlag(tripId)) return false;
  boughtDirtyMem.add(tripId);
  return true;
}

function markBoughtDirty(tripId: string) {
  boughtDirtyMem.add(tripId);
  try {
    localStorage.setItem(BOUGHT_DIRTY_KEY(tripId), '1');
  } catch {
    /* quota/SSR — в рамках сессии помнит память */
  }
}

function clearBoughtDirty(tripId: string) {
  boughtDirtyMem.delete(tripId);
  try {
    localStorage.removeItem(BOUGHT_DIRTY_KEY(tripId));
  } catch {
    /* см. markBoughtDirty */
  }
}

/**
 * Монотонный счётчик ЛОКАЛЬНЫХ правок похода: отличает «серверный снимок,
 * запрошенный ДО клика» от актуального состояния. Изменился за время GET —
 * ответ устарел и как окончательный не применяется.
 */
const boughtMutationSeq = new Map<string, number>();
const boughtSeq = (tripId: string) => boughtMutationSeq.get(tripId) ?? 0;

/**
 * Последовательная очередь PUT на поход: каждый следующий ждёт предыдущий.
 * Без неё два быстрых клика уходят параллельно, и на сервере может примениться
 * УСТАРЕВШИЙ набор (побеждает ответивший последним, а не нажатый позже).
 */
const boughtPutQueue = new Map<string, Promise<boolean>>();
const boughtPutLatestSeq = new Map<string, number>();
let boughtPutSeqCounter = 0;

function enqueueBoughtPut(tripId: string, keys: string[]): Promise<boolean> {
  const seq = ++boughtPutSeqCounter;
  boughtPutLatestSeq.set(tripId, seq);
  const prev = boughtPutQueue.get(tripId) ?? Promise.resolve(true);
  const task = prev
    .catch(() => null)
    .then(() => syncServerBought(tripId, keys))
    .catch(() => null)
    .then(res => {
      if (!res) return false;
      // Неотправляемые ключи (битые/дробные/отрицательные) не должны держать
      // dirty вечно: сервер получил полный валидный остаток набора, поэтому
      // такие ключи вычищаем из локального кэша (иначе «снятая отметка
      // воскресает» при каждой гидрации и флаг никогда не снимается).
      //
      // R12: чистим ДО разбора res.ok. Если в кэше были ТОЛЬКО неотправляемые
      // ключи, syncServerBought не делает PUT вовсе (ok=false, sent=0) —
      // ранний return оставлял их в наборе, и каждый следующий refresh видел
      // «грязный» набор без единого шанса его отправить: серверный снимок не
      // применялся никогда (вечный dirty).
      if (res.rejected.length > 0) dropUnsendableBoughtKeys(tripId, res.rejected);
      if (!res.ok) {
        // Досылать нечего И локально не осталось ни одной отметки -> сравнивать
        // с сервером больше нечего, флаг обязан сниматься (иначе — тот же
        // вечный dirty, только уже без данных). Проверяем seq: пока PUT летел,
        // пользователь мог нажать ещё раз, и его правка ещё не на сервере.
        if (res.sent === 0 && loadBought(tripId).size === 0 && boughtPutLatestSeq.get(tripId) === seq) {
          clearBoughtDirty(tripId);
        }
        return false;
      }
      // dirty снимаем только при успехе И только если это ПОСЛЕДНЯЯ отправка:
      // пока PUT летел, пользователь мог нажать ещё раз — его правка ещё не
      // на сервере, и флаг обязан остаться.
      if (boughtPutLatestSeq.get(tripId) === seq) clearBoughtDirty(tripId);
      return true;
    });
  boughtPutQueue.set(tripId, task);
  void task.then(() => {
    if (boughtPutQueue.get(tripId) === task) boughtPutQueue.delete(tripId);
  });
  return task;
}

/**
 * Убрать из локального кэша ключи, которые физически не могут уехать на сервер
 * (их отбросил syncServerBought). Без этого они оставались бы в наборе навсегда:
 * каждый refresh считал бы набор «грязным», а серверный снимок не применялся бы —
 * ровно тот баг, ради которого вводился dirty-флаг.
 */
function dropUnsendableBoughtKeys(tripId: string, rejected: string[]) {
  const cur = loadBought(tripId);
  const dropped: string[] = [];
  for (const key of rejected) if (cur.delete(key)) dropped.push(key);
  if (dropped.length === 0) return;
  console.warn(
    `[checklist-bought] dropped ${dropped.length} unsendable key(s) from local cache of trip ${tripId}:`,
    dropped.slice(0, 10),
  );
  writeJson(BOUGHT_KEY(tripId), [...cur]);
  notify(tripId, 'bought');
}

/**
 * Освободить in-memory состояние синхронизации похода (размонтирование экранов,
 * удаление похода): карты seq иначе растут по числу открытых походов за сессию.
 * LS-флаг dirty НЕ трогаем — он должен пережить перезагрузку страницы, а
 * очередь PUT не рвём: если отправка ещё в полёте, её seq нужен для снятия флага.
 */
export function forgetTripBoughtSyncState(tripId: string) {
  boughtDirtyMem.delete(tripId);
  if (!boughtPutQueue.has(tripId)) {
    boughtMutationSeq.delete(tripId);
    boughtPutLatestSeq.delete(tripId);
  }
}

/** Тест-хук: дождаться опустошения очереди PUT похода (страницам не нужен). */
export async function flushBoughtPuts(tripId: string): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    const pending = boughtPutQueue.get(tripId);
    if (!pending) return;
    await pending.catch(() => false);
  }
}

/** Мягкий таймаут: не дождались сервера — null (эквивалент недоступности). */
function withSoftTimeout<T>(p: Promise<T>, timeoutMs?: number): Promise<T | null> {
  if (!timeoutMs || timeoutMs <= 0) return p;
  return new Promise<T | null>(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    p.then(
      v => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/** Записать набор в LS + оповестить подписчиков, только если он реально изменился. */
function writeBoughtIfChanged(tripId: string, next: Set<string>) {
  const cur = loadBought(tripId);
  if (cur.size === next.size && [...next].every(k => cur.has(k))) return;
  writeJson(BOUGHT_KEY(tripId), [...next]);
  notify(tripId, 'bought');
}

// ===================== Чеклист: отметки «взято» =====================

export function loadBought(tripId: string): Set<string> {
  const raw = readJson<unknown>(BOUGHT_KEY(tripId), []);
  return Array.isArray(raw)
    ? new Set(raw.filter((x): x is string => typeof x === 'string'))
    : new Set();
}

export function setBought(tripId: string, next: Set<string>) {
  writeJson(BOUGHT_KEY(tripId), [...next]);
  // KB-15: правка ещё не на сервере -> до успешного PUT набор считаем dirty,
  // иначе серверный снимок сотрёт её (в т.ч. после перезагрузки без сети).
  boughtMutationSeq.set(tripId, boughtSeq(tripId) + 1);
  markBoughtDirty(tripId);
  notify(tripId, 'bought');
  // Fire-and-forget, но СТРОГО последовательно (очередь на поход): офлайн PUT
  // вернёт false - набор останется dirty и уедет при следующей синхронизации.
  void enqueueBoughtPut(tripId, [...next]);
}

export interface RefreshBoughtOptions {
  /** Мягкий таймаут ожидания сервера; истёк — ведём себя как при недоступности. */
  timeoutMs?: number;
}

/** Параллельные вызовы для одного похода (страница + загрузчик + модалка) делят один GET. */
const boughtRefreshInFlight = new Map<string, Promise<Set<string>>>();

/**
 * KB-15: сверить локальные отметки «взято» с сервером (источник истины).
 *
 * Семантика:
 *  - сервер недоступен/таймаут (null) → НИЧЕГО не меняем и dirty не сбрасываем:
 *    в магазине без связи локальные отметки продолжают работать;
 *  - НЕТ несинхронизированных правок (dirty=false) → серверный набор ПОЛНОСТЬЮ
 *    заменяет локальный, включая УДАЛЕНИЯ: отметка, снятая на другом
 *    устройстве, не воскресает из устаревшего кэша (PUT при этом не нужен);
 *  - ЕСТЬ несинхронизированные правки (dirty=true) → union с локальным + досылка
 *    объединения через очередь; dirty снимается при успехе последней отправки.
 *
 * Если за время GET была локальная правка (setBought), серверный ответ — снимок
 * «до клика»: окончательным он не применяется, делается повторный GET.
 *
 * Возвращает актуальный набор ключей.
 */
export function refreshBoughtFromServer(
  tripId: string,
  opts: RefreshBoughtOptions = {},
): Promise<Set<string>> {
  // Таймаут — СВОЙ у каждого вызывающего, даже если GET общий: печать/список с
  // timeoutMs не должны висеть из-за того, что параллельный вызов стартовал без
  // таймаута и держит общий промис. Сам запрос при этом один (не плодим GET).
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : BOUGHT_SYNC_SOFT_TIMEOUT_MS;
  const soft = (p: Promise<Set<string>>) =>
    withSoftTimeout(p, timeoutMs).then(v => (v ?? loadBought(tripId)));
  const running = boughtRefreshInFlight.get(tripId);
  if (running) return soft(running);
  // Тот же лимит — и внутрь задачи: иначе «зависший» GET держал бы общий
  // промис вечно, и все последующие гидрации вечно отваливались по таймауту,
  // так и не сделав новый запрос.
  const task = runBoughtRefresh(tripId, { ...opts, timeoutMs }).finally(() => {
    if (boughtRefreshInFlight.get(tripId) === task) boughtRefreshInFlight.delete(tripId);
  });
  boughtRefreshInFlight.set(tripId, task);
  return soft(task);
}

async function runBoughtRefresh(
  tripId: string,
  opts: RefreshBoughtOptions,
): Promise<Set<string>> {
  // Две попытки: вторая читает сервер после того, как локальный ввод устоялся.
  for (let attempt = 0; attempt < 2; attempt++) {
    const seqAtStart = boughtSeq(tripId);
    const serverKeys = await withSoftTimeout(getServerBought(tripId), opts.timeoutMs);
    if (serverKeys === null) return loadBought(tripId); // недоступен — кэш не трогаем
    if (boughtSeq(tripId) !== seqAtStart) continue;     // клик во время GET — снимок устарел

    if (!isBoughtDirty(tripId)) {
      // «Сервер побеждает»: полная замена, включая снятые на другом устройстве.
      const server = new Set(serverKeys);
      writeBoughtIfChanged(tripId, server);
      return server;
    }

    // Офлайн-правки: локальное не теряем — union и досылка объединения.
    const merged = new Set<string>(serverKeys);
    for (const key of loadBought(tripId)) merged.add(key);
    writeBoughtIfChanged(tripId, merged);
    await enqueueBoughtPut(tripId, [...merged]);
    return loadBought(tripId);
  }
  // Локальное состояние менялось во время обоих GET — отдаём локальный набор,
  // серверную запись не трогаем (досинхронизирует следующий refresh/правка).
  return loadBought(tripId);
}

// ===================== Чеклист: фактические количества =====================

export function loadActualQty(tripId: string): Record<string, ChecklistActual> {
  const raw = readJson<Record<string, ChecklistActual | number>>(ACTUAL_QTY_KEY(tripId), {});
  if (typeof raw !== 'object' || raw === null) return {};
  // совместимость с Fix-5 (число в базовых единицах) → unit '' = базовая единица
  const out: Record<string, ChecklistActual> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number') out[k] = { amount: v, unit: '' };
    else if (v && typeof v.amount === 'number') out[k] = v;
  }
  return out;
}

/** value=null → вернуть к расчётному значению (стереть ручной ввод). */
export function setActualQty(tripId: string, ingredientId: string, value: ChecklistActual | null) {
  const cur = loadActualQty(tripId);
  if (value == null || !(value.amount > 0) || !value.unit) delete cur[ingredientId];
  else cur[ingredientId] = value;
  writeJson(ACTUAL_QTY_KEY(tripId), cur);
  notify(tripId, 'qty');
}

// ===================== Подписка на изменения =====================

/**
 * Подписка на изменения стейджа: собственное событие + 'storage' (другие вкладки браузера).
 * Возвращает функцию отписки для useEffect.
 */
export function onTripStageChange(tripId: string, handler: () => void): () => void {
  const local = (e: Event) => {
    const detail = (e as CustomEvent<{ tripId: string }>).detail;
    if (detail?.tripId === tripId) handler();
  };
  const storage = (e: StorageEvent) => {
    const keys = [PRICES_KEY(tripId), EXCLUDED_KEY(tripId), SUBST_KEY(tripId), BOUGHT_KEY(tripId), ACTUAL_QTY_KEY(tripId)];
    if (e.key && keys.includes(e.key)) handler();
  };
  window.addEventListener(STAGE_EVENT, local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(STAGE_EVENT, local);
    window.removeEventListener('storage', storage);
  };
}
