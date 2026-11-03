export type ConflictStrategy = 'server-wins' | 'client-wins' | 'merge';

export function resolveConflict<T extends { updatedAt: string }>(
  local: T,
  server: T,
  strategy: ConflictStrategy = 'server-wins'
): T {
  switch (strategy) {
    case 'server-wins':
      return server;
    case 'client-wins':
      return local;
    case 'merge':
      // простой merge: берём более свежую версию по updatedAt
      return new Date(local.updatedAt) > new Date(server.updatedAt) ? local : server;
    default:
      return server;
  }
}