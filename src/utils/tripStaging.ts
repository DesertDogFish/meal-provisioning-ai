import { getServerBought, syncServerBought } from '../api/checklist';
import {
  baseIngredientKey,
  getServerActualQty,
  syncServerActualQty,
  type ServerActualQtyItem,
} from '../api/checklistActual';
export interface ActualPriceDraft {
  price: number;
  total: number;
  qty?: number | null;
  neededAt?: number | null;
}
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
const BOUGHT_KEY = (tripId: string) => `trip-checklist-bought-${tripId}`;
const BOUGHT_DIRTY_KEY = (tripId: string) => `trip-checklist-bought-dirty-${tripId}`;
export const BOUGHT_SYNC_SOFT_TIMEOUT_MS = 1500;
const ACTUAL_QTY_KEY = (tripId: string) => `trip-checklist-actualqty-${tripId}`;
export interface ChecklistActual {
  amount: number;
  unit: string;
  neededAt?: number | null;
}
export function neededStamp(needed: number | null | undefined): number {
  return Math.round((Number(needed) || 0) * 1000);
}
export function factIsFresh(
  fact: unknown,
  needed: number | null | undefined,
): boolean {
  if (fact == null || typeof fact !== 'object') return false;
  const stamp = (fact as { neededAt?: number | null }).neededAt;
  if (stamp == null) return true;
  return stamp === neededStamp(needed);
}
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
    /* ignore */
  }
}
function notify(tripId: string, kind: StageKind) {
  window.dispatchEvent(new CustomEvent(STAGE_EVENT, { detail: { tripId, kind } }));
}
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
export function loadSubstitutions(tripId: string): TripSubstitution[] {
  const raw = readJson<unknown>(SUBST_KEY(tripId), []);
  return Array.isArray(raw) ? (raw as TripSubstitution[]) : [];
}
export function saveRecipeSubstitutions(tripId: string, recipeId: string, subs: TripSubstitution[]) {
  const cur = loadSubstitutions(tripId).filter(s => s.recipeId !== recipeId);
  writeJson(SUBST_KEY(tripId), [...cur, ...subs]);
  notify(tripId, 'subs');
}
const boughtDirtyMem = new Set<string>();
function readBoughtDirtyFlag(tripId: string): boolean {
  try {
    return localStorage.getItem(BOUGHT_DIRTY_KEY(tripId)) === '1';
  } catch {
    return false;
  }
}
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
    /* ignore */
  }
}
function clearBoughtDirty(tripId: string) {
  boughtDirtyMem.delete(tripId);
  try {
    localStorage.removeItem(BOUGHT_DIRTY_KEY(tripId));
  } catch {
    /* ignore */
  }
}
const boughtMutationSeq = new Map<string, number>();
const boughtSeq = (tripId: string) => boughtMutationSeq.get(tripId) ?? 0;
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
      if (res.rejected.length > 0) dropUnsendableBoughtKeys(tripId, res.rejected);
      if (!res.ok) {
        if (res.sent === 0 && loadBought(tripId).size === 0 && boughtPutLatestSeq.get(tripId) === seq) {
          clearBoughtDirty(tripId);
        }
        return false;
      }
      if (boughtPutLatestSeq.get(tripId) === seq) clearBoughtDirty(tripId);
      return true;
    });
  boughtPutQueue.set(tripId, task);
  void task.then(() => {
    if (boughtPutQueue.get(tripId) === task) boughtPutQueue.delete(tripId);
  });
  return task;
}
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
export function forgetTripBoughtSyncState(tripId: string) {
  boughtDirtyMem.delete(tripId);
  if (!boughtPutQueue.has(tripId)) {
    boughtMutationSeq.delete(tripId);
    boughtPutLatestSeq.delete(tripId);
  }
}
export async function flushBoughtPuts(tripId: string): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    const pending = boughtPutQueue.get(tripId);
    if (!pending) return;
    await pending.catch(() => false);
  }
}
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
function writeBoughtIfChanged(tripId: string, next: Set<string>) {
  const cur = loadBought(tripId);
  if (cur.size === next.size && [...next].every(k => cur.has(k))) return;
  writeJson(BOUGHT_KEY(tripId), [...next]);
  notify(tripId, 'bought');
}
export function loadBought(tripId: string): Set<string> {
  const raw = readJson<unknown>(BOUGHT_KEY(tripId), []);
  return Array.isArray(raw)
    ? new Set(raw.filter((x): x is string => typeof x === 'string'))
    : new Set();
}
export function setBought(tripId: string, next: Set<string>) {
  writeJson(BOUGHT_KEY(tripId), [...next]);
  boughtMutationSeq.set(tripId, boughtSeq(tripId) + 1);
  markBoughtDirty(tripId);
  bindOnlineFlush();
  notify(tripId, 'bought');
  void enqueueBoughtPut(tripId, [...next]);
}
export interface RefreshBoughtOptions {
  timeoutMs?: number;
}
const boughtRefreshInFlight = new Map<string, Promise<Set<string>>>();
export function refreshBoughtFromServer(
  tripId: string,
  opts: RefreshBoughtOptions = {},
): Promise<Set<string>> {
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : BOUGHT_SYNC_SOFT_TIMEOUT_MS;
  const soft = (p: Promise<Set<string>>) =>
    withSoftTimeout(p, timeoutMs).then(v => (v ?? loadBought(tripId)));
  const running = boughtRefreshInFlight.get(tripId);
  if (running) return soft(running);
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
  for (let attempt = 0; attempt < 2; attempt++) {
    const seqAtStart = boughtSeq(tripId);
    const serverKeys = await withSoftTimeout(getServerBought(tripId), opts.timeoutMs);
    if (serverKeys === null) return loadBought(tripId); // недоступен — кэш не трогаем
    if (boughtSeq(tripId) !== seqAtStart) continue;     // клик во время GET — снимок устарел
    if (!isBoughtDirty(tripId)) {
      const server = new Set(serverKeys);
      writeBoughtIfChanged(tripId, server);
      return server;
    }
    const merged = new Set<string>(serverKeys);
    for (const key of loadBought(tripId)) merged.add(key);
    writeBoughtIfChanged(tripId, merged);
    await enqueueBoughtPut(tripId, [...merged]);
    return loadBought(tripId);
  }
  return loadBought(tripId);
}
const ACTUAL_QTY_DIRTY_KEY = (tripId: string) => `trip-checklist-actualqty-dirty-${tripId}`;
const actualQtyDirtyMem = new Set<string>();
const actualQtyPutQueue = new Map<string, Promise<boolean>>();
const actualQtyLatestSeq = new Map<string, number>();
let actualQtySeqCounter = 0;
function readActualQtyDirtyFlag(tripId: string): boolean {
  try {
    return localStorage.getItem(ACTUAL_QTY_DIRTY_KEY(tripId)) === '1';
  } catch {
    return false;
  }
}
function isActualQtyDirty(tripId: string): boolean {
  if (actualQtyDirtyMem.has(tripId)) return true;
  if (!readActualQtyDirtyFlag(tripId)) return false;
  actualQtyDirtyMem.add(tripId);
  return true;
}
function markActualQtyDirty(tripId: string) {
  actualQtyDirtyMem.add(tripId);
  try {
    localStorage.setItem(ACTUAL_QTY_DIRTY_KEY(tripId), '1');
  } catch {
    /* ignore */
  }
}
function clearActualQtyDirty(tripId: string) {
  actualQtyDirtyMem.delete(tripId);
  try {
    localStorage.removeItem(ACTUAL_QTY_DIRTY_KEY(tripId));
  } catch {
    /* ignore */
  }
}
const stageSyncTrips = new Set<string>();
function enqueueActualQtyPut(tripId: string, map: Record<string, ChecklistActual>): Promise<boolean> {
  const seq = ++actualQtySeqCounter;
  actualQtyLatestSeq.set(tripId, seq);
  stageSyncTrips.add(tripId);
  bindOnlineFlush();
  const prev = actualQtyPutQueue.get(tripId) ?? Promise.resolve(true);
  const task = prev
    .catch(() => null)
    .then(() => syncServerActualQty(tripId, map))
    .catch(() => null)
    .then(res => {
      if (!res) return false;
      if (res.rejected.length > 0) dropUnsendableActualKeys(tripId, res.rejected);
      if (!res.ok) return false;
      if (actualQtyLatestSeq.get(tripId) === seq) clearActualQtyDirty(tripId);
      return true;
    });
  actualQtyPutQueue.set(tripId, task);
  void task.then(() => {
    if (actualQtyPutQueue.get(tripId) === task) actualQtyPutQueue.delete(tripId);
  });
  return task;
}
function dropUnsendableActualKeys(tripId: string, rejected: string[]) {
  const cur = loadActualQty(tripId);
  const dropped: string[] = [];
  for (const key of rejected) if (cur[key]) { delete cur[key]; dropped.push(key); }
  if (dropped.length === 0) return;
  console.warn(
    `[checklist-actual-qty] dropped ${dropped.length} unsendable key(s) from local cache of trip ${tripId}:`,
    dropped.slice(0, 10),
  );
  writeJson(ACTUAL_QTY_KEY(tripId), cur);
  notify(tripId, 'qty');
}
function applyServerActual(
  server: ServerActualQtyItem[],
  local: Record<string, ChecklistActual>,
): Record<string, ChecklistActual> {
  const out: Record<string, ChecklistActual> = {};
  const localKeys = Object.keys(local);
  for (const item of server) {
    const serverKey = String(item.ingredientId);
    const base = baseIngredientKey(serverKey);
    const existing = localKeys.find(k => k === serverKey || baseIngredientKey(k) === base);
    out[existing ?? serverKey] = { amount: item.amount, unit: item.unit };
  }
  return out;
}
function writeActualQtyIfChanged(tripId: string, next: Record<string, ChecklistActual>) {
  const cur = loadActualQty(tripId);
  const same = Object.keys(cur).length === Object.keys(next).length
    && Object.entries(next).every(([k, v]) => cur[k] && cur[k].amount === v.amount && cur[k].unit === v.unit);
  if (same) return;
  writeJson(ACTUAL_QTY_KEY(tripId), next);
  notify(tripId, 'qty');
}
export async function refreshActualQtyFromServer(
  tripId: string,
  opts: { timeoutMs?: number } = {},
): Promise<Record<string, ChecklistActual>> {
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : BOUGHT_SYNC_SOFT_TIMEOUT_MS;
  stageSyncTrips.add(tripId);
  bindOnlineFlush();
  const server = await withSoftTimeout(getServerActualQty(tripId), timeoutMs);
  if (server === null) return loadActualQty(tripId); // недоступен — кэш не трогаем
  if (isActualQtyDirty(tripId)) {
    const local = loadActualQty(tripId);
    await enqueueActualQtyPut(tripId, local);
    return loadActualQty(tripId);
  }
  const next = applyServerActual(server, loadActualQty(tripId));
  writeActualQtyIfChanged(tripId, next);
  return loadActualQty(tripId);
}
export function forgetTripActualQtySyncState(tripId: string) {
  actualQtyDirtyMem.delete(tripId);
  if (!actualQtyPutQueue.has(tripId)) {
    actualQtyLatestSeq.delete(tripId);
  }
}
export async function flushActualQtyPuts(tripId: string): Promise<void> {
  for (let guard = 0; guard < 100; guard++) {
    const pending = actualQtyPutQueue.get(tripId);
    if (!pending) return;
    await pending.catch(() => false);
  }
}
let onlineFlushBound = false;
function bindOnlineFlush() {
  if (onlineFlushBound || typeof window === 'undefined') return;
  onlineFlushBound = true;
  window.addEventListener('online', () => {
    void flushPendingStageWrites();
  });
}
export async function flushPendingStageWrites(): Promise<void> {
  for (const tripId of [...stageSyncTrips]) {
    if (isBoughtDirty(tripId)) await enqueueBoughtPut(tripId, [...loadBought(tripId)]);
    if (isActualQtyDirty(tripId)) await enqueueActualQtyPut(tripId, loadActualQty(tripId));
  }
}
export function loadActualQty(tripId: string): Record<string, ChecklistActual> {
  const raw = readJson<Record<string, ChecklistActual | number>>(ACTUAL_QTY_KEY(tripId), {});
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, ChecklistActual> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number') out[k] = { amount: v, unit: '' };
    else if (v && typeof v.amount === 'number') out[k] = v;
  }
  return out;
}
export function setActualQty(tripId: string, ingredientId: string, value: ChecklistActual | null) {
  const cur = loadActualQty(tripId);
  if (value == null || !(value.amount > 0) || !value.unit) delete cur[ingredientId];
  else cur[ingredientId] = value;
  writeJson(ACTUAL_QTY_KEY(tripId), cur);
  notify(tripId, 'qty');
  markActualQtyDirty(tripId);
  bindOnlineFlush();
  void enqueueActualQtyPut(tripId, cur);
}
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
