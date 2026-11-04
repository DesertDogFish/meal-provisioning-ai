import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Undo2, X } from 'lucide-react'; // Plus удалён: неиспользуемый импорт (lint-error на HEAD)

import type { ProblemDetail } from '../types/errors';
import {
  api, getMealComposition, putMealComposition, humanize, packHint, humanizeWeight,
} from '../api/client';
import { formatRub, categoryName } from '../utils/format'; // Release-1.0: единый формат чисел
import type { CompositionItem, CompositionPutRequest, CompositionResponse } from '../api/client';
import type { Ingredient, MealType, UnitOfMeasure } from '../types';
import { loadActualPrices, loadBought, loadActualQty, refreshBoughtFromServer, BOUGHT_SYNC_SOFT_TIMEOUT_MS } from '../utils/tripStaging'; // transparency-п.3 + KB-15
import { pluralize } from '../utils/pluralize';

import Modal from './Modal';
import { Button } from './Button';
import RecipeSearchSelect from './RecipeSearchSelect';
import ProductAddRow from './ProductAddRow';
import CustomSelect from './CustomSelect'; // Fix-6 (п.1)
import { useConfirm } from './ConfirmDialog'; // Fix-6 (п.7)
import { ProblemDetailAlert } from './ProblemDetailAlert';
import { useToast } from './ToastProvider';
import { parseAmount } from './AddMealModal';
import AmountInput from './AmountInput';

export interface Props {
  tripId: string;
  mealId: string;
  isAdmin?: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onEditCatalogRecipe?: (recipeId: string) => void;
}
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин', SNACK: 'Перекус',
};
export type DraftState = 'RECIPE' | 'SCALED' | 'EXTRA' | 'EXCLUDED' | 'REMOVED';
interface RowDraft {
  state: DraftState;
  amount?: number;
  extraAmount?: number;
  unit?: UnitOfMeasure;
}
interface SubstDraft {
  fromIngredientId: string;
  toIngredientId: string;
  ratio: number;
}
export function fmtQty(n: number | null | undefined, unit?: UnitOfMeasure | null): string {
  if (n == null || isNaN(n)) return '—';
  return unit ? humanize(n, unit) : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
export function ratioFromAmount(derived: number | null | undefined, newAmount: number): number {
  const d = Number(derived ?? 0);
  if (!(d > 0)) return 1;
  return Math.round((newAmount / d) * 10000) / 10000;
}
export function useMealCompositionModal({ tripId, mealId, isAdmin = false, onClose, onSaved, onEditCatalogRecipe }: Props): any {
  const { showError } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm(); // Fix-6 (п.7)
  const [server, setServer] = useState<CompositionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [extraRows, setExtraRows] = useState<Array<{ ingredientId: string; name: string; unit: UnitOfMeasure; amount: number; categoryId?: string }>>([]);
  const [substitutes, setSubstitutes] = useState<SubstDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<ProblemDetail | null>(null);
  const [products, setProducts] = useState<Ingredient[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [addSelected, setAddSelected] = useState<string>('');
  const [addAmount, setAddAmount] = useState<number | null>(null);
  const [mergeAsk, setMergeAsk] = useState<{ ingredientId: string; current: number; unit: UnitOfMeasure; wanted: number } | null>(null);
  const [addAsk, setAddAsk] = useState<{ name: string; unit: UnitOfMeasure; amount: number } | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [addAskCategory, setAddAskCategory] = useState<string>('');
  const [substOpenFor, setSubstOpenFor] = useState<string | null>(null);
  const [substTarget, setSubstTarget] = useState<string>('');
  const [substRatio, setSubstRatio] = useState('1');
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getMealComposition(tripId, mealId);
      setServer(data);
      setDrafts({});
      setExtraRows([]);
      setSubstitutes([]);
    } catch (err: any) {
      setLoadError(err?.detail || 'Не удалось загрузить состав приёма');
    } finally {
      setLoading(false);
    }
  }, [tripId, mealId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    void refreshBoughtFromServer(tripId, { timeoutMs: BOUGHT_SYNC_SOFT_TIMEOUT_MS });
  }, [tripId]);
  useEffect(() => {
    let cancelled = false;
    api.get<any>('/admin/products', { params: { size: '1000' } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        setProducts(
          list
            .filter((p: Ingredient) => p.enabled !== false)
            .map((p: Ingredient) => ({ ...p, category: categoryName(p) as Ingredient['category'] }))
        );
      })
      .catch(() => {});
    api.get<any>('/product-categories')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        setCategories(list.map((c: any) => ({ id: String(c.id), name: String(c.name ?? '') })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const rows = useMemo(() => {
    const base: Array<CompositionItem & { draft?: RowDraft }> = (server?.items ?? [])
      .filter((it) => drafts[String(it.ingredientId)]?.state !== 'REMOVED')
      .map((it) => ({
        ...it,
        draft: drafts[String(it.ingredientId)],
      }));
    const known = new Set(base.map((b) => String(b.ingredientId)));
    for (const e of extraRows) {
      if (known.has(e.ingredientId)) continue;
      base.push({
        ingredientId: e.ingredientId, name: e.name, unit: e.unit,
        packSize: null, pieceWeightG: null, kcalPer100g: null,
        baseAmountPerServing: null, derivedAmount: null,
        effectiveAmount: e.amount, state: 'EXTRA', ratio: null, substitutedFrom: null,
        kcalTotal: 0,
        draft: { state: 'EXTRA', extraAmount: e.amount, unit: e.unit },
      });
    }
    return base;
  }, [server, drafts, extraRows]);
  const effOf = useCallback((row: CompositionItem & { draft?: RowDraft }): number => {
    const d = row.draft;
    if (!d) return row.effectiveAmount;
    if (d.state === 'EXCLUDED' || d.state === 'REMOVED') return 0;
    if (d.state === 'SCALED') return d.amount ?? row.effectiveAmount;
    if (d.state === 'EXTRA') return d.extraAmount ?? row.effectiveAmount;
    return row.effectiveAmount;
  }, []);
  const badgeOf = (row: CompositionItem & { draft?: RowDraft }): { text: string; tone: string } => {
    const d = row.draft;
    const state: DraftState = d?.state ?? row.state;
    if (state === 'EXCLUDED') return { text: 'исключён', tone: 'var(--muted)' };
    if (state === 'EXTRA') return { text: 'добавлено · фикс. кол-во', tone: 'var(--w1, var(--wave-300))' };
    if (state === 'SCALED') {
      const derived = row.derivedAmount ?? 0;
      const eff = effOf(row);
      const ratio = derived > 0 ? Math.round((eff / derived) * 100) / 100 : (d?.amount != null ? 1 : row.ratio ?? 1);
      return { text: `×${ratio} изм.`, tone: 'var(--fire, #d97706)' };
    }
    if (row.substitutedFrom) return { text: `заменён → ${row.substitutedFrom}`, tone: 'var(--w1, var(--wave-300))' };
    return { text: 'из рецепта', tone: 'var(--muted)' };
  };
  const isDirty = Object.keys(drafts).length > 0 || extraRows.length > 0 || substitutes.length > 0;
  const resetDrafts = () => {
    setDrafts({});
    setExtraRows([]);
    setSubstitutes([]);
    setMergeAsk(null);
    setSubstOpenFor(null);
  };
  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: 'Закрыть и потерять изменения?',
        tone: 'warning',
        confirmLabel: 'Потерять изменения',
        message: <>В составе приёма есть несохранённые правки — они будут потеряны безвозвратно.</>,
      });
      if (!ok) return;
    }
    onClose();
  };
  const setDraft = (ingId: string, patch: Partial<RowDraft> | null) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (patch === null) { delete next[ingId]; return next; }
      const existing = next[ingId] ?? {};
      next[ingId] = { ...existing, ...patch, state: patch.state ?? existing.state ?? 'SCALED' } as RowDraft;
      return next;
    });
  };
  const onQuantityChange = (row: CompositionItem, raw: string) => {
    const ingId = String(row.ingredientId);
    const n = parseAmount(raw);
    if (n == null || n < 0) return;
    if (row.state === 'EXTRA') {
      const serverExtra = extraRows.find((e) => e.ingredientId === ingId);
      if (serverExtra) setExtraRows((prev) => prev.map((e) => (e.ingredientId === ingId ? { ...e, amount: n } : e)));
      else setDraft(ingId, { state: 'EXTRA', extraAmount: n, unit: row.unit });
      return;
    }
    if (n === 0) { setDraft(ingId, { state: 'EXCLUDED' }); return; }
    setDraft(ingId, { state: 'SCALED', amount: n, unit: row.unit });
  };
  const toggleExclude = (row: CompositionItem) => {
    const ingId = String(row.ingredientId);
    const cur = drafts[ingId]?.state ?? row.state;
    if (cur === 'EXCLUDED') setDraft(ingId, null);
    else setDraft(ingId, { state: 'EXCLUDED' });
  };
  const resetRow = (row: CompositionItem) => setDraft(String(row.ingredientId), null);
  const removeExtra = (row: CompositionItem) => {
    const ingId = String(row.ingredientId);
    const isDraftRow = extraRows.some((e) => e.ingredientId === ingId);
    setExtraRows((prev) => prev.filter((e) => e.ingredientId !== ingId));
    if (isDraftRow) {
      setDraft(ingId, null);
    } else {
      setDraft(ingId, { state: 'REMOVED' });
    }
  };
  const commitAdd = (prod: Ingredient, n: number) => {
    const ingId = String(prod.id);
    const existing = rows.find((r) => String(r.ingredientId) === ingId);
    if (existing) {
      if ((existing.draft?.state ?? existing.state) === 'EXTRA') {
        const se = extraRows.find((e) => e.ingredientId === ingId);
        if (se) setExtraRows((prev) => prev.map((e) => (e.ingredientId === ingId ? { ...e, amount: n } : e)));
        else setDraft(ingId, { state: 'EXTRA', extraAmount: n, unit: existing.unit });
      } else {
        setDraft(ingId, { state: 'SCALED', amount: n, unit: existing.unit });
      }
    } else {
      setExtraRows((prev) => [...prev, { ingredientId: ingId, name: prod.name, unit: prod.unit, amount: n }]);
    }
  };
  const addProduct = (confirmed = false) => {
    const n = addAmount;
    if (!addSelected || !(n != null && n > 0)) {
      showError('Укажите продукт и количество больше нуля');
      return;
    }
    const prod = products.find((p) => String(p.id) === addSelected);
    if (!prod) return;
    const ingId = String(prod.id);
    const existing = rows.find((r) => String(r.ingredientId) === ingId);
    if (existing && !confirmed) {
      const st = existing.draft?.state ?? existing.state;
      if (st === 'EXCLUDED') {
        setMergeAsk({ ingredientId: ingId, current: 0, unit: existing.unit, wanted: n });
        return;
      }
      setMergeAsk({ ingredientId: ingId, current: effOf(existing), unit: existing.unit, wanted: n });
      return;
    }
    commitAdd(prod, n);
    setAddSelected(''); setAddAmount(null); setAddQuery(''); setMergeAsk(null); setAddAsk(null);
  };
  const offerFreeTextAdd = () => {
    const n = addAmount;
    const q = addQuery.trim();
    if (!(q && n != null && n > 0)) return;
    const dup = extraRows.find((e) => e.name.toLowerCase() === q.toLowerCase());
    const unit: UnitOfMeasure = dup?.unit ?? 'PCS';
    if (dup) { commitAdd({ id: dup.ingredientId, name: dup.name, unit } as Ingredient, n); }
    else { setAddAsk({ name: q, unit, amount: n }); }
  };
  const applyFreeTextAdd = () => {
    if (!addAsk) return;
    const id = `free-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setExtraRows((prev) => [...prev, {
      ingredientId: id, name: addAsk.name, unit: addAsk.unit, amount: addAsk.amount,
      categoryId: addAskCategory || categories[0]?.id,
    }]);
    setAddSelected(''); setAddAmount(null); setAddQuery(''); setMergeAsk(null); setAddAsk(null);
  };
  const openSubst = (row: CompositionItem) => {
    setSubstOpenFor(String(row.ingredientId));
    setSubstTarget('');
    setSubstRatio('1');
  };
  const commitSubst = (row: CompositionItem) => {
    const from = String(row.ingredientId);
    const to = substTarget;
    if (!to || to === from) { showError('Выберите продукт-цель замены'); return; }
    const r = parseAmount(substRatio);
    const target = products.find((p) => String(p.id) === to);
    const sameUnit = target && target.unit === row.unit;
    if (!sameUnit && !(r != null && r > 0 && r !== 1)) {
      showError('Единицы различаются: укажите коэффициент замены вручную');
      return;
    }
    setSubstitutes((prev) => [
      ...prev.filter((s) => s.fromIngredientId !== from),
      { fromIngredientId: from, toIngredientId: to, ratio: r != null && r > 0 ? r : 1 },
    ]);
    setSubstOpenFor(null);
  };
  const cancelSubst = (fromId: string) => {
    setSubstitutes((prev) => prev.filter((s) => s.fromIngredientId !== fromId));
  };
  const buildPutBody = (idMap: Map<string, string>): CompositionPutRequest => {
    const items: CompositionPutRequest['items'] = [];
    for (const row of rows) {
      const ingId = idMap.get(String(row.ingredientId)) ?? String(row.ingredientId);
      const d = row.draft;
      if (d?.state === 'REMOVED') continue;
      if (d?.state === 'EXCLUDED') { items.push({ ingredientId: ingId, state: 'EXCLUDED' }); continue; }
      if (d?.state === 'SCALED') {
        const eff = d.amount ?? row.effectiveAmount;
        const derivedBase = row.state === 'SCALED' ? (row.derivedAmount ?? eff) : (row.derivedAmount ?? eff);
        items.push({ ingredientId: ingId, state: 'SCALED', ratio: ratioFromAmount(derivedBase, eff) });
        continue;
      }
      if (d?.state === 'EXTRA') { items.push({ ingredientId: ingId, state: 'EXTRA', amount: d.extraAmount ?? row.effectiveAmount }); continue; }
      if (d?.state === 'RECIPE') { items.push({ ingredientId: ingId, state: 'RECIPE' }); continue; }
      if (row.state === 'SCALED') items.push({ ingredientId: ingId, state: 'SCALED', ratio: row.ratio ?? 1 });
      else if (row.state === 'EXTRA') items.push({ ingredientId: ingId, state: 'EXTRA', amount: row.effectiveAmount });
      else if (row.state === 'EXCLUDED') items.push({ ingredientId: ingId, state: 'EXCLUDED' });
      else items.push({ ingredientId: ingId, state: 'RECIPE' });
    }
    const subs = [...(server?.substitutions ?? [])
      .filter((s) => !substitutes.some((d) => d.fromIngredientId === String(s.fromIngredientId)))
      .map((s) => ({ fromIngredientId: String(s.fromIngredientId), toIngredientId: String(s.toIngredientId), ratio: s.ratio })),
      ...substitutes];
    return { items, substitutions: subs };
  };
  const resolveFreeRows = async (): Promise<Map<string, string> | null> => {
    const idMap = new Map<string, string>();
    const freeRows = extraRows.filter((e) => !/^\d+$/.test(String(e.ingredientId)));
    if (!freeRows.length) return idMap;
    if (!isAdmin) {
      setSaveProblem({
        status: 400, title: 'Новый продукт не сохранён', type: 'about:blank',
        detail: `«${freeRows.map((r) => r.name).join('», «')}» нет в справочнике. Добавлять новые продукты может только администратор — уберите позицию или попросите админа завести продукт.`,
      });
      return null;
    }
    for (const row of freeRows) {
      try {
        const chk = await api.get<any>(
          `/admin/products/check-name?name=${encodeURIComponent(row.name)}&unit=${encodeURIComponent(row.unit)}`
        );
        if (chk?.duplicate && chk?.existingId != null) {
          if (chk.sameUnit === false) {
            setSaveProblem({
              status: 409, title: 'Новый продукт не сохранён', type: 'about:blank',
              detail: `Продукт «${row.name}» уже есть в справочнике с другой единицей измерения — выберите существующий продукт из списка.`,
            });
            return null;
          }
          idMap.set(row.ingredientId, String(chk.existingId));
          continue;
        }
        const categoryId = row.categoryId || categories[0]?.id;
        if (!categoryId) {
          setSaveProblem({
            status: 400, title: 'Новый продукт не сохранён', type: 'about:blank',
            detail: `Для продукта «${row.name}» не выбрана категория и справочник категорий пуст.`,
          });
          return null;
        }
        const created = await api.post<any>('/admin/products', {
          name: row.name, unit: row.unit, categoryId: Number(categoryId),
        });
        if (created?.id == null) throw { status: 500, detail: 'Сервер не вернул id созданного продукта' };
        idMap.set(row.ingredientId, String(created.id));
      } catch (err: any) {
        const e = err?.error ?? err;
        setSaveProblem({
          status: e?.status ?? 500,
          title: e?.title ?? `Не удалось завести продукт «${row.name}» в справочнике`,
          detail: e?.detail ?? e?.message ?? String(err),
          type: e?.type ?? 'about:blank',
        });
        return null;
      }
    }
    return idMap;
  };
  const affectedResetNames = (): string[] => {
    const ids = new Set<string>();
    for (const [id, d] of Object.entries(drafts)) {
      if (d.state === 'EXCLUDED' || d.state === 'REMOVED' || d.state === 'SCALED' || d.state === 'EXTRA') {
        ids.add(String(id));
      }
    }
    for (const s of substitutes) ids.add(String(s.fromIngredientId));
    if (ids.size === 0) return [];
    const prices = loadActualPrices(tripId);
    const bought = loadBought(tripId);
    const qty = loadActualQty(tripId);
    const touched = (id: string) =>
      prices[id]?.price != null ||
      [...bought].some(k => k === id || k.startsWith(`${id}@`)) ||
      qty[id] != null;
    const nameOf = (id: string) =>
      (server?.items ?? []).find(it => String(it.ingredientId) === id)?.name
      ?? extraRows.find(e => e.ingredientId === id)?.name
      ?? `#${id}`;
    return [...ids].filter(touched).map(nameOf);
  };
  const save = async () => {
    if (saving) return;
    const affected = affectedResetNames();
    if (affected.length > 0) {
      const ok = await confirm({
        title: 'Сбросить введённый чек?',
        tone: 'warning',
        confirmLabel: 'Да, сохранить состав',
        message: (
          <>
            Правка состава сбросит введённый чек и отметки «взято» по{' '}
            {affected.length} {pluralize(affected.length, ['позиции', 'позициям', 'позициям'])}:{' '}
            <b>{affected.join(', ')}</b>. Другое количество — другая цена: суммы придётся
            ввести заново на этапе «Чеки и итог» ④. Продолжить?
          </>
        ),
      });
      if (!ok) return;
    }
    setSaving(true);
    setSaveProblem(null);
    try {
      const idMap = await resolveFreeRows();
      if (idMap == null) return; // проблема уже показана
      const fresh = await putMealComposition(tripId, mealId, buildPutBody(idMap));
      setServer(fresh);
      setDrafts({});
      setExtraRows([]);
      setSubstitutes([]);
      onSaved?.(); // refetch summary (T6-пайплайн)
    } catch (err: any) {
      const e = err?.error ?? err;
      setSaveProblem({
        status: e?.status ?? 500,
        title: e?.title ?? 'Не удалось сохранить состав',
        detail: e?.detail ?? e?.message,
        type: e?.type ?? 'about:blank',
      });
    } finally {
      setSaving(false);
    }
  };
  const liveTotals = useMemo(() => {
    if (!server) return null;
    let kcal = 0, weightGrams = 0;
    for (const row of rows) {
      const qty = effOf(row);
      if (qty <= 0) continue;
      if (row.kcalPer100g != null) {
        const grams = row.unit === 'KG' ? qty * 1000
          : row.unit === 'PCS' || row.unit === 'PACK' ? qty * Number(row.pieceWeightG ?? 0)
          : qty * 1000; // L ≈ вода
        kcal += (grams / 100) * Number(row.kcalPer100g);
      }
      if (row.unit === 'KG') weightGrams += qty * 1000;
      else if (row.unit === 'PCS' || row.unit === 'PACK') weightGrams += qty * Number(row.pieceWeightG ?? 0);
    }
    return { kcal: Math.round(kcal), weightGrams };
  }, [server, rows, effOf]);
  const hasExtras = rows.some((r) => (r.draft?.state ?? r.state) === 'EXTRA');
  return { addAmount, addAsk, addAskCategory, addProduct, addQuery, addSelected, affectedResetNames, applyFreeTextAdd, badgeOf, buildPutBody, cancelSubst, categories, commitAdd, commitSubst, drafts, effOf, extraRows, hasExtras, isDirty, liveTotals, loadError, loading, mergeAsk, offerFreeTextAdd, onQuantityChange, openSubst, products, reload, removeExtra, requestClose, resetDrafts, resetRow, resolveFreeRows, rows, save, saveProblem, saving, server, setAddAmount, setAddAsk, setAddAskCategory, setAddQuery, setAddSelected, setCategories, setDraft, setDrafts, setExtraRows, setLoadError, setLoading, setMergeAsk, setProducts, setSaveProblem, setSaving, setServer, setSubstOpenFor, setSubstRatio, setSubstTarget, setSubstitutes, substOpenFor, substRatio, substTarget, substitutes, toggleExclude, confirm, confirmDialog, isAdmin, onEditCatalogRecipe, }; };
