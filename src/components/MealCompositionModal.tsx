import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Plus, Undo2, X } from 'lucide-react';
import Modal from './Modal';
import { Button } from './Button';
import RecipeSearchSelect from './RecipeSearchSelect';
import { ProblemDetailAlert } from './ProblemDetailAlert';
import { useToast } from './ToastProvider';
import type { ProblemDetail } from '../types/errors';
import {
  api, getMealComposition, putMealComposition, humanize, packHint, humanizeWeight,
} from '../api/client';
import { formatRub, categoryName } from '../utils/format'; // Release-1.0: единый формат чисел
import type { CompositionItem, CompositionPutRequest, CompositionResponse } from '../api/client';
import type { Ingredient, MealType, UnitOfMeasure } from '../types';
import { parseAmount } from './AddMealModal';

/**
 * FORM-meal-composition-spec §2.2 — Модалка B «Состав приёма».
 * Редактирует ТОЛЬКО этот приём; справочник блюда не трогает.
 * Одна commit-кнопка «Сохранить» → batch PUT /trips/{t}/meals/{m}/composition (атомарно),
 * затем refetch summary (T6-пайплайн).
 */

interface Props {
  tripId: string;
  mealId: string;
  isAdmin?: boolean;
  onClose: () => void;
  /** После успешного сохранения: refetch данных страницы/summary */
  onSaved?: () => void;
  /** Ссылка «Изменить блюдо в справочнике» — только ADMIN (T7) */
  onEditCatalogRecipe?: (recipeId: string) => void;
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин', SNACK: 'Перекус',
};

/** Черновик строки в desired-состоянии PUT (диф считается от серверного snapshot). */
type DraftState = 'RECIPE' | 'SCALED' | 'EXTRA' | 'EXCLUDED';

interface RowDraft {
  state: DraftState;
  /** SCALED: новое абсолютное количество на приём (ratio считается от derivedAmount) */
  amount?: number;
  /** EXTRA: фиксированное абсолютное количество на приём */
  extraAmount?: number;
  unit?: UnitOfMeasure;
}

interface SubstDraft {
  fromIngredientId: string;
  toIngredientId: string;
  ratio: number;
}

function fmtQty(n: number | null | undefined, unit?: UnitOfMeasure | null): string {
  if (n == null || isNaN(n)) return '—';
  // Release-1.0: без единицы — всё равно через ru-RU (запятая), а не «1.5»
  return unit ? humanize(n, unit) : n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function ratioFromAmount(derived: number | null | undefined, newAmount: number): number {
  // §3: effective = derived × ratio ⇒ ratio = newAmount / derived (scale 4 как NUMERIC(8,4))
  const d = Number(derived ?? 0);
  if (!(d > 0)) return 1;
  return Math.round((newAmount / d) * 10000) / 10000;
}

export default function MealCompositionModal({
  tripId, mealId, isAdmin = false, onClose, onSaved, onEditCatalogRecipe,
}: Props) {
  const { showError } = useToast();

  const [server, setServer] = useState<CompositionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [extraRows, setExtraRows] = useState<Array<{ ingredientId: string; name: string; unit: UnitOfMeasure; amount: number; categoryId?: string }>>([]);
  const [substitutes, setSubstitutes] = useState<SubstDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState<ProblemDetail | null>(null);

  // строка добавления продукта: поиск + обязательное количество
  const [products, setProducts] = useState<Ingredient[]>([]);
  const [addQuery, setAddQuery] = useState('');
  const [addSelected, setAddSelected] = useState<string>('');
  const [addAmount, setAddAmount] = useState('');
  // инлайн-подтверждение merge для уже присутствующего продукта (§2.2)
  const [mergeAsk, setMergeAsk] = useState<{ ingredientId: string; current: number; unit: UnitOfMeasure; wanted: number } | null>(null);
  // инлайн-предложение «добавить как новый продукт», если поиска в составе нет (§2.2)
  const [addAsk, setAddAsk] = useState<{ name: string; unit: UnitOfMeasure; amount: number } | null>(null);
  // Категория нового продукта (свободный ввод): при сохранении продукт создаётся
  // в справочнике через POST /admin/products — categoryId обязателен (ProductRequest).
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [addAskCategory, setAddAskCategory] = useState<string>('');
  // инлайн-раскрытие замены (§2.2)
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
    let cancelled = false;
    // U8 (список багов 25.10): «подгружается какой-то мизер» — бэкенд по умолчанию отдаёт
    // первую страницу (size=20 из 204). Просим весь справочник, как RecipeEditorModal.
    api.get<any>('/admin/products', { params: { size: '1000' } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        // Release-1.0: бэкенд отдаёт category ОБЪЕКТОМ (ProductCategoryDto {id,name,slug,…}),
        // а подсказки пикера интерполируют его строкой → «[object Object]».
        // Нормализуем один раз на входе (mock отдаёт строку — categoryName её не трогает).
        setProducts(
          list
            .filter((p: Ingredient) => p.enabled !== false)
            .map((p: Ingredient) => ({ ...p, category: categoryName(p) as Ingredient['category'] }))
        );
      })
      .catch(() => {});
    // Категории справочника — для создания продукта из свободного ввода (§2.2, save-flow).
    api.get<any>('/product-categories')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        setCategories(list.map((c: any) => ({ id: String(c.id), name: String(c.name ?? '') })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /** Все видимые строки таблицы: серверные + черновые EXTRA (дедуп по ingredientId). */
  const rows = useMemo(() => {
    const base: Array<CompositionItem & { draft?: RowDraft }> = (server?.items ?? []).map((it) => ({
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

  /** Эффективное количество строки с учётом черновика (для live-итогов и ratio). */
  const effOf = useCallback((row: CompositionItem & { draft?: RowDraft }): number => {
    const d = row.draft;
    if (!d) return row.effectiveAmount;
    if (d.state === 'EXCLUDED') return 0;
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
    // §2.2: у строки-получателя замены — бейдж «заменён → {имя from-продукта}»
    if (row.substitutedFrom) return { text: `заменён → ${row.substitutedFrom}`, tone: 'var(--w1, var(--wave-300))' };
    return { text: 'из рецепта', tone: 'var(--muted)' };
  };

  // ===== Dirty-state (§2.2) =====
  const isDirty = Object.keys(drafts).length > 0 || extraRows.length > 0 || substitutes.length > 0;

  const resetDrafts = () => {
    setDrafts({});
    setExtraRows([]);
    setSubstitutes([]);
    setMergeAsk(null);
    setSubstOpenFor(null);
  };

  const requestClose = () => {
    // закрытие с правками — confirm (§2.2 dirty guards)
    if (isDirty && !window.confirm('Есть несохранённые изменения состава. Закрыть и потерять их?')) return;
    onClose();
  };

  // ===== Действия по строкам =====
  const setDraft = (ingId: string, patch: Partial<RowDraft> | null) => {
    setDrafts((prev) => {
      const next = { ...prev };
      if (patch === null) { delete next[ingId]; return next; }
      // патч всегда несёт явный state — он имеет приоритет над прежним черновиком
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
      // EXTRA — фикс. абсолют на приём (§3): правим сумму, ratio нет
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
    setExtraRows((prev) => prev.filter((e) => e.ingredientId !== ingId));
    setDraft(ingId, null);
  };

  // ===== Добавление продукта (§2.2: поиск + обязательное количество > 0, merge-подтверждение) =====
  const commitAdd = (prod: Ingredient, n: number) => {
    const ingId = String(prod.id);
    const existing = rows.find((r) => String(r.ingredientId) === ingId);
    if (existing) {
      // merge: новой строки нет — существующая становится SCALE (или меняет EXTRA-сумму)
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
    const n = parseAmount(addAmount);
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
    setAddSelected(''); setAddAmount(''); setAddQuery(''); setMergeAsk(null); setAddAsk(null);
  };

  /**
   * §2.2: если введённый текст поиска не выбран из справочника как конкретный продукт,
   * предлагаем добавить его отдельным подтверждением — иначе набранное название молча терялось.
   */
  const offerFreeTextAdd = () => {
    const n = parseAmount(addAmount);
    const q = addQuery.trim();
    if (!(q && n != null && n > 0)) return;
    // совпадение с уже добавленным черновым EXTRA — merge, а не новая строка
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
    setAddSelected(''); setAddAmount(''); setAddQuery(''); setMergeAsk(null); setAddAsk(null);
  };

  // ===== Замена (инлайн-раскрытие строки, §2.2) =====
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
      // разные единицы: ручной ratio обязателен (§2.2)
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

  // ===== Коммит: один batch PUT (§2.2) =====
  const buildPutBody = (idMap: Map<string, string>): CompositionPutRequest => {
    const items: CompositionPutRequest['items'] = [];
    for (const row of rows) {
      // Черновые free-id (свободный ввод) к этому моменту уже отображены в реальные
      // id справочника (resolveFreeRows) — на сервер уходят только числовые id.
      const ingId = idMap.get(String(row.ingredientId)) ?? String(row.ingredientId);
      const d = row.draft;
      if (d?.state === 'EXCLUDED') { items.push({ ingredientId: ingId, state: 'EXCLUDED' }); continue; }
      if (d?.state === 'SCALED') {
        const eff = d.amount ?? row.effectiveAmount;
        const derivedBase = row.state === 'SCALED' ? (row.derivedAmount ?? eff) : (row.derivedAmount ?? eff);
        items.push({ ingredientId: ingId, state: 'SCALED', ratio: ratioFromAmount(derivedBase, eff) });
        continue;
      }
      if (d?.state === 'EXTRA') { items.push({ ingredientId: ingId, state: 'EXTRA', amount: d.extraAmount ?? row.effectiveAmount }); continue; }
      if (d?.state === 'RECIPE') { items.push({ ingredientId: ingId, state: 'RECIPE' }); continue; }
      // без черновика — текущее серверное состояние (desired-snapshot целиком)
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

  /**
   * §2.2 (save-flow): черновые позиции свободного ввода (id «free-…») НЕЛЬЗЯ отправлять
   * на сервер — PUT composition принимает только числовые id справочника (иначе 400/500).
   * Резолвим каждый free-id в реальный продукт: check-name → существующий id; иначе
   * создание POST /admin/products с выбранной категорией (доступно админу).
   * Возвращает карту free-id → реальный id, либо null (ошибка уже показана в saveProblem).
   */
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

  const save = async () => {
    if (saving) return;
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

  // ===== Live-итоги (§2.2: превью клиент считает локально; authoritative — после Сохранить) =====
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

  return (
    <Modal onClose={requestClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-3xl p-6 my-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-label="Состав приёма"
      >
        {/* Шапка с контекстом дня/типа (§2.2) */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              Состав приёма
              {isDirty && <span title="Изменения не сохранены" data-testid="dirty-dot" style={{ color: 'var(--fire, #d97706)' }}>●</span>}
            </h2>
            {server && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                День{server.dayDate ? ` · ${new Date(`${server.dayDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}
                {' · '}{MEAL_TYPE_LABELS[server.mealType]} · {server.recipeName} · {server.people} человека
              </p>
            )}
          </div>
          {/* U21: крестик — иконка приложения, а не текстовый глиф «✕» */}
          <Button variant="ghost" size="sm" onClick={requestClose} aria-label="Закрыть"><X size={18} /></Button>
        </div>

        <p className="text-xs mt-2 mb-3 flex items-start gap-1.5" style={{ color: 'var(--muted)' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Правки применяются только к этому приёму — блюдо в справочнике не изменяется.
          {isAdmin && onEditCatalogRecipe && server && (
            <button
              type="button"
              className="underline ml-1"
              onClick={() => onEditCatalogRecipe(server.recipeId)}
            >
              Изменить блюдо в справочнике
            </button>
          )}
        </p>

        {hasExtras && (
          <p className="text-xs mb-3 px-2 py-1.5 rounded" data-testid="extras-banner"
             style={{ background: 'color-mix(in srgb, var(--wave-400) 10%, transparent)', color: 'var(--muted)' }}>
            Добавленные позиции — фиксированное количество на приём, при смене людей не меняются.
            Люди редактируются на карточке приёма, не здесь.
          </p>
        )}

        {loading && <p className="py-6 text-center" style={{ color: 'var(--muted)' }}>Загрузка состава…</p>}
        {loadError && !loading && (
          <div className="mb-3">
            <p style={{ color: 'var(--danger)' }}>{loadError}</p>
            <Button variant="ghost" size="sm" onClick={() => void reload()}>Повторить</Button>
          </div>
        )}

        {!loading && server && (
          <>
            <table className="w-full text-sm" aria-label="Состав приёма">
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  <th className="text-left font-medium py-1">Продукт</th>
                  <th className="text-left font-medium py-1">Кол-во на приём</th>
                  <th className="text-left font-medium py-1">Статус</th>
                  <th className="text-right font-medium py-1">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ingId = String(row.ingredientId);
                  const d = row.draft;
                  const state: DraftState = d?.state ?? row.state;
                  const excluded = state === 'EXCLUDED';
                  const eff = effOf(row);
                  const badge = badgeOf(row);
                  const subActive = substitutes.find((s) => s.fromIngredientId === ingId);
                  const fromReplaced = (server.substitutions ?? []).some((s) => String(s.fromIngredientId) === ingId) || !!subActive;
                  const hint = packHint(row);
                  const inputValue = excluded ? '' : String(
                    Math.round(eff * 1000) / 1000,
                  ).replace('.', ',');
                  return (
                    <tr key={ingId} data-row={ingId} style={{ borderTop: '1px solid var(--border)', opacity: excluded || fromReplaced ? 0.55 : 1 }}>
                      <td className="py-2 pr-2 align-top">
                        <span style={{ color: 'var(--text)', textDecoration: excluded ? 'line-through' : undefined }}>{row.name}</span>
                      </td>
                      <td className="py-2 pr-2 align-top" style={{ minWidth: 120 }}>
                        {excluded ? (
                          <span style={{ color: 'var(--muted)' }}>———</span>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                aria-label={`Количество: ${row.name}`}
                                value={inputValue}
                                disabled={fromReplaced}
                                onChange={(e) => onQuantityChange(row, e.target.value)}
                                className="w-20 px-2 py-1 rounded text-right"
                                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                              />
                              <span style={{ color: 'var(--muted)' }}>{row.unit ? humanize(1, row.unit).split(' ')[1] ?? row.unit : ''}</span>
                            </div>
                            {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{hint}</div>}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: badge.tone, background: 'var(--elev)', border: '1px solid var(--border)' }}>
                          {subActive ? `замена → ${products.find((p) => String(p.id) === subActive.toIngredientId)?.name ?? '?'}` : badge.text}
                        </span>
                      </td>
                      <td className="py-2 align-top text-right whitespace-nowrap">
                        {(state === 'RECIPE' || state === 'SCALED') && !fromReplaced && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openSubst(row)} aria-label={`Заменить: ${row.name}`}>Заменить</Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleExclude(row)} aria-label={`Исключить: ${row.name}`}>Искл.</Button>
                          </>
                        )}
                        {state === 'SCALED' && (
                          <Button variant="ghost" size="sm" onClick={() => resetRow(row)} aria-label={`Сбросить: ${row.name}`}>
                            <Undo2 size={13} /> Сбр.
                          </Button>
                        )}
                        {state === 'EXCLUDED' && (
                          <Button variant="ghost" size="sm" onClick={() => toggleExclude(row)} aria-label={`Вернуть: ${row.name}`}>Вернуть</Button>
                        )}
                        {state === 'EXTRA' && (
                          <Button variant="ghost" size="sm" onClick={() => removeExtra(row)} aria-label={`Удалить: ${row.name}`}>Удалить</Button>
                        )}
                        {(fromReplaced || subActive) && (
                          <Button variant="ghost" size="sm" onClick={() => cancelSubst(ingId)} aria-label={`Отменить замену: ${row.name}`}>Отменить замену</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Инлайн-раскрытие замены (§2.2) */}
            {substOpenFor && (() => {
              const row = rows.find((r) => String(r.ingredientId) === substOpenFor);
              if (!row) return null;
              const target = products.find((p) => String(p.id) === substTarget);
              const unitMismatch = target && target.unit !== row.unit;
              return (
                <div className="mt-2 rounded-lg p-3 flex flex-wrap items-end gap-3" data-testid="subst-editor"
                     style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}>
                  <div className="flex-1" style={{ minWidth: 220 }}>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>
                      Заменить «{row.name}» на…
                    </label>
                    <RecipeSearchSelect
                      value={substTarget}
                      onChange={setSubstTarget}
                      options={products
                        .filter((p) => String(p.id) !== substOpenFor)
                        .map((p) => ({ value: String(p.id), label: p.name, hint: p.category }))}
                      placeholder="Найти продукт-цель…"
                      emptyText="Не найдено"
                      ariaLabel="Продукт-цель замены"
                    />
                    {unitMismatch && (
                      <p className="text-xs mt-1" style={{ color: 'var(--fire, #d97706)' }}>
                        единицы различаются: {row.unit} → {target!.unit} — коэффициент обязателен
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Коэфф.</label>
                    <input
                      type="text" inputMode="decimal" aria-label="Коэффициент замены"
                      value={substRatio}
                      onChange={(e) => setSubstRatio(e.target.value)}
                      className="w-20 px-2 py-1.5 rounded"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    />
                  </div>
                  <Button variant="primary" size="sm" onClick={() => commitSubst(row)}>Применить замену</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSubstOpenFor(null)}>Отмена</Button>
                </div>
              );
            })()}

            {/* Строка добавления продукта (§2.3: количество — поле рядом с поиском, обязательное).
                U9 (список багов 25.10): «всё наляпано» — блок собран в панель с
                аккуратной сеткой поиск/количество/кнопка (на узких экранах — в колонку);
                подтверждения (новый продукт / merge) живут в той же панели. */}
            <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}>
              <span className="block text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>
                Добавить продукт к приёму
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(200px,1fr)_110px_auto] gap-2 items-end">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Найти продукт в справочнике</label>
                  <RecipeSearchSelect
                    value={addSelected}
                    onChange={(v) => { setAddSelected(v); setMergeAsk(null); }}
                    onQueryChange={setAddQuery}
                    options={products.map((p) => ({ value: String(p.id), label: p.name, hint: `${p.category} · ${humanize(1, p.unit)}` }))}
                    placeholder="Название продукта…"
                    emptyText="Не найдено"
                    ariaLabel="Поиск продукта"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Кол-во</label>
                  <input
                    type="text" inputMode="decimal" aria-label="Количество добавляемого продукта"
                    value={addAmount}
                    onChange={(e) => { setAddAmount(e.target.value); setMergeAsk(null); }}
                    className="w-full px-2 py-2 rounded-lg"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    placeholder="0,25"
                  />
                </div>
                <Button variant="primary" size="sm" onClick={() => { if (addSelected) addProduct(false); else offerFreeTextAdd(); }} aria-label="Добавить продукт в состав">
                  <Plus size={14} /> Добавить
                </Button>
              </div>

            {/* Инлайн-предложение добавить набранное название как новый продукт (§2.2) */}
            {addAsk && (
              <div className="mt-2 rounded-lg p-3 text-sm flex flex-wrap items-center gap-3" data-testid="add-new-confirm"
                   style={{ background: 'color-mix(in srgb, var(--w1, #0ea5e9) 10%, transparent)', color: 'var(--text)' }}>
                в составе нет продукта «{addAsk.name}» — добавить его позицией {fmtQty(addAsk.amount, addAsk.unit)}?
                {isAdmin ? (
                  <label className="flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    Категория:
                    <select
                      data-testid="add-new-category"
                      className="input py-1 text-sm"
                      style={{ width: 'auto' }}
                      value={addAskCategory || categories[0]?.id || ''}
                      onChange={(ev) => setAddAskCategory(ev.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>
                    (новый продукт сможет завести только администратор — при сохранении)
                  </span>
                )}
                <Button variant="primary" size="sm" onClick={applyFreeTextAdd}>Да, добавить</Button>
                <Button variant="ghost" size="sm" onClick={() => setAddAsk(null)}>Отмена</Button>
              </div>
            )}

            {/* Инлайн-подтверждение merge для уже присутствующего продукта */}
            {mergeAsk && (
              <div className="mt-2 rounded-lg p-3 text-sm flex flex-wrap items-center gap-3" data-testid="merge-confirm"
                   style={{ background: 'color-mix(in srgb, var(--fire, #d97706) 10%, transparent)', color: 'var(--text)' }}>
                {mergeAsk.current > 0
                  ? <>уже в составе ({fmtQty(mergeAsk.current, mergeAsk.unit)}) — установить {fmtQty(mergeAsk.wanted, mergeAsk.unit)}?</>
                  : <>продукт исключён — вернуть и установить количество {fmtQty(mergeAsk.wanted, mergeAsk.unit)}?</>}
                <Button variant="primary" size="sm" onClick={() => addProduct(true)}>Да, применить</Button>
                <Button variant="ghost" size="sm" onClick={() => setMergeAsk(null)}>Отмена</Button>
              </div>
            )}
            </div>

            {/* Итоги live (§2.2) */}
            {liveTotals && (
              <p className="mt-4 text-sm" data-testid="composition-totals" style={{ color: 'var(--muted)' }}>
                Итого на приём: {liveTotals.kcal} ккал · {humanizeWeight(liveTotals.weightGrams)}
                {' · '}план {formatRub(server.totals.plannedCost)}
              </p>
            )}

            {saveProblem && (
              <div className="mt-3">
                <ProblemDetailAlert problemDetail={saveProblem} onClose={() => setSaveProblem(null)} />
              </div>
            )}

            {/* Одна commit-кнопка + сброс (§2.2) */}
            <div className="flex items-center justify-end gap-3 mt-4">
              <span className="text-sm mr-auto" style={{ color: isDirty ? 'var(--fire, #d97706)' : 'var(--muted)' }}>
                {isDirty ? 'Изменения не сохранены ●' : 'Всё сохранено'}
              </span>
              <Button variant="ghost" onClick={resetDrafts} disabled={!isDirty} aria-label="Сбросить изменения">Сбросить</Button>
              <Button variant="primary" onClick={() => void save()} disabled={!isDirty || saving} aria-label="Сохранить состав">
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
