import { api } from './client';

export async function getStagingRecipes(): Promise<any[]> {
  const data = await api.get<any>('/admin/staging');
  return Array.isArray(data) ? data : (data?.content ?? []);
}

export async function getEmisProducts(params?: any): Promise<any[]> {
  const data = await api.get<any>('/admin/emis/products', { params });
  return Array.isArray(data) ? data : (data?.content ?? []);
}