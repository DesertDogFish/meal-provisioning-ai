/**
 * Машина состояний режимов API/MOCK
 * Единственный владелец решения, откуда брать данные
 */

export type ApiMode = 'auto' | 'api' | 'mock';

export interface ModeState {
  mode: ApiMode;
  apiAvailable: boolean;
  lastPingTime: number | null;
  lastError: string | null;
  fallbackTriggered: boolean;
}

export type ModeAction =
  | { type: 'SET_MODE'; payload: ApiMode }
  | { type: 'SET_API_AVAILABLE'; payload: boolean }
  | { type: 'SET_LAST_PING'; payload: number }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TRIGGER_FALLBACK' }
  | { type: 'RESET_FALLBACK' };

const LS_MODE_KEY = 'apiMode';
const LS_FALLBACK_KEY = 'lastFallback';

export function getInitialMode(): ApiMode {
  const stored = localStorage.getItem(LS_MODE_KEY);
  if (stored === 'auto' || stored === 'api' || stored === 'mock') {
    return stored;
  }
  
  const envMode = (import.meta as any).env?.VITE_API_MODE;
  if (envMode === 'auto' || envMode === 'api' || envMode === 'mock') {
    return envMode;
  }
  
  return 'auto';
}

export function saveMode(mode: ApiMode): void {
  localStorage.setItem(LS_MODE_KEY, mode);
}

export function saveFallbackEvent(reason: string): void {
  sessionStorage.setItem(LS_FALLBACK_KEY, JSON.stringify({
    reason,
    timestamp: Date.now()
  }));
  console.warn(`[Mode] Fallback triggered: ${reason}`);
}

export function getFallbackEvent(): { reason: string; timestamp: number } | null {
  const stored = sessionStorage.getItem(LS_FALLBACK_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function modeReducer(state: ModeState, action: ModeAction): ModeState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.payload };
    case 'SET_API_AVAILABLE':
      return { ...state, apiAvailable: action.payload };
    case 'SET_LAST_PING':
      return { ...state, lastPingTime: action.payload };
    case 'SET_ERROR':
      return { ...state, lastError: action.payload };
    case 'TRIGGER_FALLBACK':
      return { ...state, fallbackTriggered: true };
    case 'RESET_FALLBACK':
      return { ...state, fallbackTriggered: false };
    default:
      return state;
  }
}

export function getInitialState(): ModeState {
  return {
    mode: getInitialMode(),
    apiAvailable: false,
    lastPingTime: null,
    lastError: null,
    fallbackTriggered: false
  };
}
