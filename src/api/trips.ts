import { api } from './client';

export async function loadTrips(): Promise<any[]> {
  const data = await api.get<any>('/trips');
  return Array.isArray(data) ? data : (data?.content ?? []);
}

export async function createTrip(body: any): Promise<any> {
  return api.post<any>('/trips', body);
}

export async function updateTrip(id: string | number, body: any): Promise<void> {
  await api.put(`/trips/${id}`, body);
}

export async function deleteTrip(id: string | number): Promise<void> {
  await api.del(`/trips/${id}`);
}