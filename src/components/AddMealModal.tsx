import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import Modal from './Modal';
import { Button } from './Button';
import RecipeSearchSelect from './RecipeSearchSelect';
import { api, getRecipes, humanize } from '../api/client';
import type { MealType } from '../types';
import type { Recipe } from '../types';
import { useToast } from './ToastProvider';

/**
 * FORM-meal-composition-spec §2.1 — Модалка A «Добавить приём пищи» (быстрая).
 * Ровно ОДНА commit-кнопка; состав здесь НЕ редактируется (для этого — Модалка B).
 * Шорткат «добавить и настроить состав» → после успешного POST открывается B.
 */

export interface AddMealDayContext {
  dayId: string;
  dayDate: string;
  /** 1-based номер дня в походе (контекст шапки: «День 3 · сб, 12 октября») */
  dayIndex?: number;
}

interface Props {
  tripId: string;
  tripName: string;
  defaultPeople: number;
  day: AddMealDayContext;
  /** Дефолт сегмента = тип кнопки, из которой открыта модалка */
  initialMealType?: MealType;
  onClose: () => void;
  /** Успешный POST: родитель обновляет данные; openComposition — шорткат → Модалка B */
  onAdded: (meal: { id: string }, opts: { openComposition: boolean }) => void;
}

const MEAL_TYPES: Array<{ value: MealType; label: string }> = [
  { value: 'BREAKFAST', label: 'Завтрак' },
  { value: 'LUNCH', label: 'Обед' },
  { value: 'DINNER', label: 'Ужин' },
  { value: 'SNACK', label: 'Перекус' },
];

const PEOPLE_MIN = 1;
const PEOPLE_MAX = 20;

function formatDayDate(dayDate: string): string {
  try {
    return new Date(`${dayDate}T00:00:00`).toLocaleDateString('ru-RU', {
      weekday: 'short', day: 'numeric', month: 'long',
    });
  } catch {
    return dayDate;
  }
}

/** Число с плавающей точкой из ввода пользователя («0,18» → 0.18). */
export function parseAmount(value: string): number | null {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function AddMealModal({
  tripId, tripName, defaultPeople, day, initialMealType = 'LUNCH', onClose, onAdded,
}: Props) {
  const { showError } = useToast();
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [recipeId, setRecipeId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recipe[] | null>(null);
  const [searching, setSearching] = useState(false);
  // null = «по умолчанию N» (trip.defaultPeople); число 1–20 — override приёма
  const [people, setPeople] = useState<number | null>(null);
  const [openB, setOpenB] = useState(false);
  const [catalog, setCatalog] = useState<Recipe[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const effectivePeople = people ?? defaultPeople;

  // Каталог блюд для превью/подсказок (один запрос на открытие модалки)
  useEffect(() => {
    let cancelled = false;
    getRecipes().then((r) => { if (!cancelled) setCatalog(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Серверный поиск с debounce (как в исходной странице), результаты — сверх каталога
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await getRecipes(q)); } catch { setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const pool = useMemo(() => {
    const base = results != null ? [...results, ...catalog.filter(r => !results.some(sr => sr.id === r.id))] : catalog;
    return base;
  }, [results, catalog]);

  const selected = useMemo(
    () => pool.find(r => r.id === recipeId) ?? catalog.find(r => r.id === recipeId),
    [pool, catalog, recipeId],
  );

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const meal = await api.post<{ id: string }>(`/trips/${tripId}/days/${day.dayId}/meals`, {
        mealType,
        recipeId: selected.id,
        peopleOverride: people ?? undefined,
      });
      onAdded(meal, { openComposition: openB });
    } catch (err: any) {
      // §2.1: 409/400 показываются пользователю (ProblemDetail-семантика через тост)
      showError(err?.detail || err?.message || 'Не удалось добавить приём пищи');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div
        className="rounded-2xl shadow-xl w-full max-w-lg p-6 my-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="dialog"
        aria-label="Добавить приём пищи"
      >
        {/* Шапка + контекст дня (§2.1, проблема №6 макета) */}
        <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Добавить приём пищи</h2>
        <p className="text-sm mt-1 mb-4" style={{ color: 'var(--muted)' }}>
          {day.dayIndex != null ? `День ${day.dayIndex} · ` : ''}
          {formatDayDate(day.dayDate)} · «{tripName}»
        </p>

        {/* Тип приёма: segmented вместо select */}
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Тип приёма</label>
        <div className="flex gap-1 rounded-lg p-1 mb-4" style={{ background: 'var(--elev)', border: '1px solid var(--border)' }} role="group" aria-label="Тип приёма">
          {MEAL_TYPES.map((t) => {
            const active = mealType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={active}
                onClick={() => setMealType(t.value)}
                className="flex-1 px-2 py-1.5 rounded-md text-sm font-medium transition-colors"
                style={active
                  ? { background: 'var(--w1, var(--wave-400))', color: '#fff' }
                  : { color: 'var(--muted)' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Блюдо: комбобокс с поиском */}
        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Блюдо</label>
        <RecipeSearchSelect
          value={recipeId}
          onChange={(v) => setRecipeId(v)}
          options={pool.map((r) => ({
            value: r.id,
            label: r.name,
            hint: `${MEAL_TYPES.find(t => t.value === r.mealType)?.label ?? ''}${r.cookMinutes ? ` • готовка ${r.cookMinutes} мин` : ''}`,
          }))}
          searchPlaceholder="Название блюда или продукта…"
          placeholder="Начните вводить название блюда…"
          emptyText={searching ? 'Ищем…' : 'Блюдо не найдено'}
          ariaLabel="Поиск блюда"
          autoFocus
          onQueryChange={setQuery}
        />

        {/* Превью-карточка выбранного блюда (проблема №7 макета) */}
        {selected && (
          <div
            className="mt-3 rounded-lg p-3"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)' }}
            data-testid="meal-preview"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{selected.name}</span>
              <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                {selected.category ? `${selected.category} · ` : ''}
                {selected.cookMinutes != null ? `готовка ${selected.cookMinutes} мин` : ''}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {selected.caloriesPerServing != null
                ? <>
                    {Math.round(selected.caloriesPerServing)} ккал/порция
                    {' · '}на {effectivePeople} чел: {Math.round(selected.caloriesPerServing * effectivePeople)} ккал
                  </>
                : 'ккал не указаны'}
            </p>
            {(selected.ingredients ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selected.ingredients.slice(0, 4).map((ri, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    {ri.ingredient?.name ?? 'продукт'}
                    {ri.ingredient ? ` · ${humanize(ri.amount, ri.ingredient.unit)}` : ''}
                  </span>
                ))}
                {selected.ingredients.length > 4 && (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>+{selected.ingredients.length - 4}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Люди: степпер 1–20, пусто = «по умолчанию N» */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            Количество человек
            {people == null && <span className="ml-1 text-xs">· по умолчанию {defaultPeople}</span>}
          </label>
          <div className="flex items-center gap-2" data-testid="people-stepper">
            <Button
              variant="ghost" size="sm"
              aria-label="Меньше людей"
              disabled={people == null ? defaultPeople <= PEOPLE_MIN : people <= PEOPLE_MIN}
              onClick={() => setPeople(Math.max(PEOPLE_MIN, effectivePeople - 1))}
            >
              <Minus size={14} />
            </Button>
            <input
              type="number"
              min={PEOPLE_MIN}
              max={PEOPLE_MAX}
              aria-label="Количество человек"
              value={people ?? ''}
              placeholder={String(defaultPeople)}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Math.min(PEOPLE_MAX, Math.max(PEOPLE_MIN, parseInt(e.target.value || '0') || PEOPLE_MIN));
                setPeople(v);
              }}
              className="w-16 px-2 py-1.5 rounded-lg text-center outline-none"
              style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <Button
              variant="ghost" size="sm"
              aria-label="Больше людей"
              disabled={effectivePeople >= PEOPLE_MAX}
              onClick={() => setPeople(Math.min(PEOPLE_MAX, effectivePeople + 1))}
            >
              <Plus size={14} />
            </Button>
          </div>
        </div>

        {/* Одна commit-кнопка + шорткат → Модалка B */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={onClose} aria-label="Отмена">Отмена</Button>
          <Button variant="primary" onClick={submit} disabled={!selected || submitting} aria-label="Добавить">
            {submitting ? 'Добавляем…' : 'Добавить'}
          </Button>
        </div>
        <label className="flex items-center gap-2 justify-end mt-3 text-sm cursor-pointer" style={{ color: 'var(--muted)' }}>
          <input
            type="checkbox"
            checked={openB}
            onChange={(e) => setOpenB(e.target.checked)}
            aria-label="добавить и настроить состав"
          />
          добавить и настроить состав
        </label>
      </div>
    </Modal>
  );
}
