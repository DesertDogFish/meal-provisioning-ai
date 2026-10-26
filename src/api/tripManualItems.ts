/**
 * Патч «UX-список 26.10» (U40) / PLAN R3: ручные позиции закупки
 * (продукты к дню или ко всему походу, вне блюд).
 *
 * Контракт (mock-реализация в `mockServer.ts`; backend-задача R3 — миграция
 * `trip_manual_items` + контроллер с теми же путями/полями):
 *   GET    /trips/{id}/manual-items            → TripManualItem[]
 *   POST   /trips/{id}/manual-items            → TripManualItem (201)
 *   DELETE /trips/{id}/manual-items/{itemId}   → 204
 */
import { api } from './client';
import type { UnitOfMeasure } from '../types';

export interface TripManualItem {
  id: string;
  tripId: string;
  /** null = позиция на весь поход; иначе — id дня */
  dayId: string | null;
  ingredientId: string;
  ingredientName: string;
  unit: UnitOfMeasure;
  /** абсолютное количество (базовые единицы: кг/л/шт/уп) — НЕ на порцию */
  amount: number;
  note?: string;
}

export interface ManualItemInput {
  dayId?: string | null;
  ingredientId: string;
  amount: number;
  note?: string;
}

export async function getManualItems(tripId: string): Promise<TripManualItem[]> {
  const data = await api.get<TripManualItem[]>(`/trips/${tripId}/manual-items`);
  return Array.isArray(data) ? data : [];
}

export async function addManualItem(tripId: string, input: ManualItemInput): Promise<TripManualItem> {
  return api.post<TripManualItem>(`/trips/${tripId}/manual-items`, {
    dayId: input.dayId ?? null,
    ingredientId: input.ingredientId,
    amount: input.amount,
    note: input.note || undefined,
  });
}

export async function deleteManualItem(tripId: string, itemId: string): Promise<void> {
  await api.del(`/trips/${tripId}/manual-items/${itemId}`);
}
