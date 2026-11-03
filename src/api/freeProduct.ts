import { api } from './client';

export async function createFreeProduct(body: any): Promise<any> {
  return api.post<any>('/admin/products', body);
}