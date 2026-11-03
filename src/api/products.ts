import { api } from './client';

export interface ProductBody {
  name: string;
  categoryId: number;
  unit: string;
  packSize: number | null;
  roundToPacks: boolean;
  kcalPer100g: number | null;
  pieceWeightG: number | null;
  emisCode: string | null;
}

export async function getProducts(params?: any): Promise<any[]> {
  const data = await api.get<any>('/admin/products', { params });
  return Array.isArray(data) ? data : (data?.content ?? []);
}
export async function getCategories(): Promise<any[]> {
  const data = await api.get<any[]>('/product-categories');
  return Array.isArray(data) ? data : [];
}
export async function loadProductsPage(): Promise<{ products: any; categories: any[]; prices: any[] }> {
  const [products, categories, prices] = await Promise.all([
    api.get<any>('/admin/products?size=1000'),
    api.get<any[]>('/product-categories'),
    api.get<any[]>('/prices').catch(() => [] as any[]),
  ]);
  return { products, categories: categories ?? [], prices: prices ?? [] };
}

export async function checkProductName(name: string, unit: string): Promise<any> {
  return api.get<any>(`/admin/products/check-name?name=${encodeURIComponent(name)}&unit=${unit}`);
}

export async function createProduct(body: ProductBody): Promise<{ id?: string | number }> {
  return api.post<{ id?: string | number }>('/admin/products', body);
}

export async function updateProduct(id: string | number, body: ProductBody): Promise<void> {
  await api.put(`/admin/products/${id}`, body);
}

export async function deleteProduct(id: string | number): Promise<void> {
  await api.del(`/admin/products/${id}`);
}

export async function setProductPrice(ingredientId: string | number, pricePerUnit: number, effectiveFrom: string): Promise<void> {
  await api.post('/admin/ingredient-prices', {
    ingredientId,
    pricePerUnit,
    currency: 'RUB',
    effectiveFrom,
  });
}