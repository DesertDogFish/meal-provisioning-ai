import { api } from '../api/client';
import type { Ingredient } from '../types';
import type { LocalProduct } from '../db/schema';
import type { IRepository } from './IRepository';

export class OnlineProductRepository implements IRepository<LocalProduct> {
  async getAll(): Promise<LocalProduct[]> {
    const data = await api.get<Ingredient[]>('/products');
    return (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      category: p.category,
      categoryId: p.categoryId,
      packSize: p.packSize,
      roundToPacks: p.roundToPacks,
      kcalPer100g: p.kcalPer100g,
      pieceWeightG: p.pieceWeightG,
      enabled: p.enabled,
      emisCode: p.emisCode,
      createdAt: p.createdAt,
      updatedAt: p.createdAt,
      syncStatus: 'synced',
    }));
  }
  async getById(id: string): Promise<LocalProduct | undefined> {
    const data = await api.get<Ingredient>(`/products/${id}`);
    if (!data) return undefined;
    return {
      id: data.id,
      name: data.name,
      unit: data.unit,
      category: data.category,
      categoryId: data.categoryId,
      packSize: data.packSize,
      roundToPacks: data.roundToPacks,
      kcalPer100g: data.kcalPer100g,
      pieceWeightG: data.pieceWeightG,
      enabled: data.enabled,
      emisCode: data.emisCode,
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
      syncStatus: 'synced',
    };
  }
  async save(item: LocalProduct): Promise<void> {
    await api.put(`/products/${item.id}`, item);
  }
  async delete(id: string): Promise<void> {
    await api.del(`/products/${id}`);
  }
  async sync(): Promise<void> {}
}