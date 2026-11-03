import { api } from './client';

export async function updateRecipe(id: string | number, payload: any): Promise<void> {
  await api.put(`/admin/recipes/${id}`, payload);
}

export async function createRecipe(payload: any): Promise<any> {
  return api.post('/admin/recipes', payload);
}