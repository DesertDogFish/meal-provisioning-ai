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
/** Fix-2 (п.6): отметки «взято» в чеклисте закупки.
 * Осознанное отклонение от AGENTS §9 (серверное хранение появится вместе с R2/R4);
 * до этого — общий стейдж похода, как у исключений. */
const BOUGHT_KEY = (tripId: string) => `trip-checklist-bought-${tripId}`;
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

// ===================== Чеклист: отметки «взято» =====================

export function loadBought(tripId: string): Set<string> {
  const raw = readJson<unknown>(BOUGHT_KEY(tripId), []);
  return Array.isArray(raw)
    ? new Set(raw.filter((x): x is string => typeof x === 'string'))
    : new Set();
}

export function setBought(tripId: string, next: Set<string>) {
  writeJson(BOUGHT_KEY(tripId), [...next]);
  notify(tripId, 'bought');
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
