import { db } from '../db/indexedDb';
import type { LocalTrip } from '../db/schema';
import type { IRepository } from './IRepository';

export class OfflineTripRepository implements IRepository<LocalTrip> {
  async getAll(): Promise<LocalTrip[]> { return db.trips.toArray(); }
  async getById(id: string): Promise<LocalTrip | undefined> { return db.trips.get(id); }
  async save(item: LocalTrip): Promise<void> { await db.trips.put(item); }
  async delete(id: string): Promise<void> { await db.trips.delete(id); }
  async sync(): Promise<void> {}
}