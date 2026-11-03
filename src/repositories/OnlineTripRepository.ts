import { api } from '../api/client';
import type { Trip } from '../types';
import type { LocalTrip } from '../db/schema';
import type { IRepository } from './IRepository';

export class OnlineTripRepository implements IRepository<LocalTrip> {
  async getAll(): Promise<LocalTrip[]> {
    const data = await api.get<Trip[]>('/trips');
    const trips = Array.isArray(data) ? data : [];
    return trips.map((t) => ({
      id: t.id,
      userId: t.userId,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      defaultPeople: t.defaultPeople,
      notes: t.notes,
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
      syncStatus: 'synced',
    }));
  }
  async getById(id: string): Promise<LocalTrip | undefined> {
    const data = await api.get<Trip>(`/trips/${id}`);
    if (!data) return undefined;
    return {
      id: data.id,
      userId: data.userId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      defaultPeople: data.defaultPeople,
      notes: data.notes,
      createdAt: data.createdAt,
      updatedAt: data.createdAt,
      syncStatus: 'synced',
    };
  }
  async save(item: LocalTrip): Promise<void> {
    await api.put(`/trips/${item.id}`, item);
  }
  async delete(id: string): Promise<void> {
    await api.del(`/trips/${id}`);
  }
  async sync(): Promise<void> {}
}