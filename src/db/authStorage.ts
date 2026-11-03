import { db } from './indexedDb';

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await db.table('auth').put({ key: 'tokens', accessToken, refreshToken, savedAt: Date.now() });
}

export async function getTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const row = await db.table('auth').get('tokens');
  if (!row) return null;
  return { accessToken: row.accessToken, refreshToken: row.refreshToken };
}

export async function clearTokens(): Promise<void> {
  await db.table('auth').delete('tokens');
}