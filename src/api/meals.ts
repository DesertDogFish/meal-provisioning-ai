import { api } from './client';

export async function createMeal(tripId: string | number, dayId: string | number, body: any): Promise<{ id: string }> {
  return api.post<{ id: string }>(`/trips/${tripId}/days/${dayId}/meals`, body);
}