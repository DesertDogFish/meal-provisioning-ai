import { api } from './client';

export async function approveStaging(stagingId: string | number, body: any): Promise<any> {
  return api.post(`/admin/staging/${stagingId}/approve`, body);
}

export async function rejectStaging(stagingId: string | number, reason: string): Promise<any> {
  return api.post(`/admin/staging/${stagingId}/reject`, { reason });
}