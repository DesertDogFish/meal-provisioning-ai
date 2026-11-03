import { api } from './client';

export async function getSyncLogs(params?: any): Promise<any[]> {
  const data = await api.get<any>('/admin/sync-logs', { params });
  return Array.isArray(data) ? data : (data?.content ?? []);
}

export async function getSyncLogsKpi(days: string = '7'): Promise<any> {
  return api.get<any>('/admin/sync-logs/kpi', { params: { days } });
}