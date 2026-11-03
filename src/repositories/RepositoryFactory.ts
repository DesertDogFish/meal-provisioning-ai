import { networkMonitor } from '../sync/NetworkMonitor';
import { OfflineProductRepository } from '../repositories/OfflineProductRepository';
import { OnlineProductRepository } from '../repositories/OnlineProductRepository';
import { OfflineRecipeRepository } from '../repositories/OfflineRecipeRepository';
import { OnlineRecipeRepository } from '../repositories/OnlineRecipeRepository';
import { OfflineTripRepository } from '../repositories/OfflineTripRepository';
import { OnlineTripRepository } from '../repositories/OnlineTripRepository';

const offlineEnabled = import.meta.env.VITE_OFFLINE_ENABLED === 'true';

export function isOfflineMode(): boolean {
  return offlineEnabled && !networkMonitor.isOnline();
}

export const repositories = {
  products: isOfflineMode() ? new OfflineProductRepository() : new OnlineProductRepository(),
  recipes: isOfflineMode() ? new OfflineRecipeRepository() : new OnlineRecipeRepository(),
  trips: isOfflineMode() ? new OfflineTripRepository() : new OnlineTripRepository(),
};