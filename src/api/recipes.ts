import { api } from './client';

export async function deleteRecipe(id: string | number): Promise<void> {
  await api.del(`/admin/recipes/${id}`);
}

export async function loadMenuTrips(): Promise<any[]> {
  const data = await api.get<any[]>('/trips');
  return Array.isArray(data) ? data : [];
}