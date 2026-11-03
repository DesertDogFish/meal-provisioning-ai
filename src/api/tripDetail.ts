import { api } from './client';

export async function deleteMeal(tripId: string | number, dayId: string | number, mealId: string | number): Promise<void> {
  await api.del(`/trips/${tripId}/days/${dayId}/meals/${mealId}`);
}

export async function updateDay(tripId: string | number, dayId: string | number, body: any): Promise<void> {
  await api.put(`/trips/${tripId}/days/${dayId}`, body);
}

export async function updatePriceOverride(tripId: string | number, ingredientId: string | number, body: any): Promise<void> {
  await api.put(`/trips/${tripId}/price-overrides/${ingredientId}`, body);
}