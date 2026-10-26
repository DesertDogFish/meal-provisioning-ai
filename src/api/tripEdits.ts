/**
 * Фаза 14 (N3): пер-походные правки состава блюд.
 *
 * Правок «в рамках похода» хранятся на сервере в trip_ingredient_substitutions
 * (Java: POST /trips/{id}/substitutions c флагами added/removed; mock — тот же контракт).
 * Исходный рецепт в каталоге НЕ трогается; закупка/дни/человек считаются с правками.
 */
import { api } from './client';
import type { Recipe } from '../types';

export interface TripIngredientEdit {
  id: string;
  recipeId: string;
  /** null = позиция добавлена руками */
  fromIngredientId: string | null;
  /** null = позиция мягко удалена из расчёта в рамках похода */
  toIngredientId: string | null;
  amountPerServing: number;
  ratio: number;
  added: boolean;
  removed?: boolean;
  comment?: string;
  /** §3: EXTRA — абсолют на приём (если заполнено, amountPerServing не масштабируем) */
  absoluteAmount?: number | null;
  /** SCALED-правка хранится как «замена на себя» (from === to, scale=true) */
  scale?: boolean;
  /** U30 (mock-обогащение, паритет с backend SubstitutionResponse): имена для overlay меню */
  recipeName?: string | null;
  fromIngredientName?: string | null;
  toIngredientName?: string | null;
  fromUnit?: string | null;
  toUnit?: string | null;
  /** правка привязана к конкретному приёму (composition-поток) */
  mealId?: string | null;
}

export async function getTripEdits(tripId: string): Promise<TripIngredientEdit[]> {
  // Fix-2 (п.3): читаем ПОЛНЫЙ список правок состава — ingredient-edits
  // (backend TripIngredientEditResponse: имена + amountPerServing + added/removed).
  // GET /substitutions в real-режиме отдаёт только «чистые» замены и без количеств.
  const data = await api.get<TripIngredientEdit[]>(`/trips/${tripId}/ingredient-edits`);
  return Array.isArray(data) ? data : [];
}

/** Замена продукта в блюде только в этом походе. */
export async function substituteInTrip(
  tripId: string,
  recipeId: string,
  fromIngredientId: string,
  toIngredientId: string,
  ratio = 1,
): Promise<TripIngredientEdit> {
  return api.post<TripIngredientEdit>(`/trips/${tripId}/substitutions`, {
    recipeId,
    fromIngredientId,
    toIngredientId,
    ratio,
  });
}

/** Продукт, добавленный в блюдо руками в рамках похода (рецепт не меняется). */
export async function addProductToTripDish(
  tripId: string,
  recipeId: string,
  toIngredientId: string,
  amountPerServing: number,
): Promise<TripIngredientEdit> {
  return api.post<TripIngredientEdit>(`/trips/${tripId}/substitutions`, {
    recipeId,
    fromIngredientId: null,
    toIngredientId,
    amountPerServing,
  });
}

/** Мягкое удаление продукта из блюда в рамках похода (to=null). */
export async function removeProductFromTripDish(
  tripId: string,
  recipeId: string,
  fromIngredientId: string,
): Promise<TripIngredientEdit> {
  return api.post<TripIngredientEdit>(`/trips/${tripId}/substitutions`, {
    recipeId,
    fromIngredientId,
    toIngredientId: null,
  });
}

export async function deleteTripEdit(tripId: string, editId: string): Promise<void> {
  await api.del(`/trips/${tripId}/substitutions/${editId}`);
}

/**
 * Сохранение черновика состава как пер-походных правок (diff от текущего рецепта):
 *  - продукт пропал из черновика  → мягкое удаление (remove);
 *  - новый продукт в черновике    → добавление руками (add);
 *  - у позиции изменилось кол-во  → замена на себя невозможно (from==to отклоняется),
 *    поэтому количество правится через remove+add (удаление исходной строки и
 *    добавление новой с новым количеством). Это безопасно: обе правки живут только
 *    в этом походе.
 * Возвращает число созданных/обновлённых записей.
 */
export async function saveDraftAsTripEdits(
  tripId: string,
  recipe: Recipe,
  draft: { ingredientId: string; amount: number }[],
): Promise<number> {
  const existing = await getTripEdits(tripId).catch(() => [] as TripIngredientEdit[]);
  const mine = existing.filter(e => e.recipeId === recipe.id);

  // Аккуратное состояние «до»: рецепт + уже сохранённые правки похода
  const base = new Map<string, number>();
  for (const ri of recipe.ingredients ?? []) base.set(String(ri.ingredientId), ri.amount);
  for (const e of mine) {
    if (e.added || e.fromIngredientId == null) {
      if (e.toIngredientId != null) base.set(String(e.toIngredientId), e.amountPerServing);
    } else if (e.removed || e.toIngredientId == null) {
      base.delete(String(e.fromIngredientId));
    } else {
      base.delete(String(e.fromIngredientId));
      base.set(String(e.toIngredientId), (base.get(String(e.toIngredientId)) ?? 0)
        + (base.get(String(e.fromIngredientId)) ?? 0) * (e.ratio || 1));
    }
  }

  const want = new Map<string, number>();
  for (const d of draft) {
    const id = String(d.ingredientId);
    want.set(id, (want.get(id) ?? 0) + d.amount);
  }

  let ops = 0;
  // Удаления: были в «до», нет в черновике
  for (const [id] of base) {
    if (!want.has(id)) {
      const prev = mine.find(e => String(e.fromIngredientId) === id && !e.added);
      if (!prev) {
        await removeProductFromTripDish(tripId, recipe.id, id);
        ops++;
      }
    }
  }
  // Отменяем старые правки для позиций, которые вернулись в черновик без изменений
  for (const e of mine) {
    const srcId = e.fromIngredientId != null ? String(e.fromIngredientId) : null;
    if (srcId && want.has(srcId) && base.has(srcId) && (want.get(srcId) ?? 0) === (base.get(srcId) ?? -1)) {
      await deleteTripEdit(tripId, e.id).catch(() => undefined);
      ops++;
    }
  }
  // Добавления и изменения количества
  for (const [id, amount] of want) {
    const had = base.get(id);
    if (had == null) {
      await addProductToTripDish(tripId, recipe.id, id, amount);
      ops++;
    } else if (Math.abs(had - amount) > 1e-9) {
      // количество изменилось: пересоздаём правку (remove+add либо update add)
      const prevAdd = mine.find(e => (e.added || e.fromIngredientId == null)
        && String(e.toIngredientId) === id);
      if (prevAdd) {
        await deleteTripEdit(tripId, prevAdd.id).catch(() => undefined);
      } else {
        await removeProductFromTripDish(tripId, recipe.id, id);
      }
      await addProductToTripDish(tripId, recipe.id, id, amount);
      ops++;
    }
  }
  return ops;
}
