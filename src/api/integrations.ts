import { api } from './client';

export async function getIntegrations(): Promise<any[]> {
  const data = await api.get<any>('/admin/integrations');
  return Array.isArray(data) ? data : (data?.content ?? []);
}

export async function getSyncLogs(params?: any): Promise<any[]> {
  const data = await api.get<any>('/admin/integrations/sync-logs', { params });
  return Array.isArray(data) ? data : (data?.content ?? []);
}

export async function connectRosstat(): Promise<any> {
  return api.post<any>('/admin/integrations/ROSSTAT/connect');
}

export async function disconnectRosstat(): Promise<any> {
  return api.post<any>('/admin/integrations/ROSSTAT/disconnect');
}

export async function syncRosstatPrices(): Promise<any> {
  return api.post<any>('/admin/integrations/ROSSTAT/sync/prices');
}

export async function uploadRosstatFile(file: File): Promise<any> {
  return api.postFile<any>('/admin/integrations/ROSSTAT/upload', file);
}