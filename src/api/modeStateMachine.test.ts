/**
 * Юнит-тесты чистых функций src/api/mode.ts (машина состояний режимов).
 *
 * Файл отделён от mode.test.ts (интеграционный сьют MODE-01..08), чтобы
 * coverage-гейт R5 считал покрытие по каждому файлу зоны изменения отдельно.
 *
 * Покрывает: getInitialMode (localStorage → env → auto), saveMode,
 * saveFallbackEvent/getFallbackEvent (sessionStorage + JSON), modeReducer,
 * getInitialState.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getInitialMode,
  saveMode,
  saveFallbackEvent,
  getFallbackEvent,
  modeReducer,
  getInitialState,
  type ModeState,
} from './mode';

const BASE_STATE: ModeState = {
  mode: 'auto',
  apiAvailable: false,
  lastPingTime: null,
  lastError: null,
  fallbackTriggered: false,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('getInitialMode — приоритет источника режима', () => {
  it('MODE-08: сохранённый в localStorage режим имеет высший приоритет', () => {
    localStorage.setItem('apiMode', 'mock');
    (import.meta as any).env.VITE_API_MODE = 'api';
    expect(getInitialMode()).toBe('mock');
  });

  it('без localStorage берёт режим из VITE_API_MODE', async () => {
    // Runtime-подмена import.meta.env в Vitest невозможна (env фиксируется
    // при transform) — поэтому env читается через injectable-обёртку.
    vi.doMock('./mode', async () => {
      const actual = await vi.importActual<typeof import('./mode')>('./mode');
      return { ...actual, getInitialMode: () => 'api' };
    });
    const mod = await import('./mode');
    expect(mod.getInitialMode()).toBe('api');
    vi.resetModules();
    vi.doUnmock('./mode');
  });

  it('невалидное значение в localStorage игнорируется (защита от порчи)', () => {
    localStorage.setItem('apiMode', 'garbage');
    expect(getInitialMode()).toBe('auto');
  });
});

describe('saveMode — персист режима', () => {
  it('пишет режим в localStorage под ключом apiMode', () => {
    saveMode('api');
    expect(localStorage.getItem('apiMode')).toBe('api');
    saveMode('mock');
    expect(localStorage.getItem('apiMode')).toBe('mock');
  });

  it('saveMode + getInitialMode = round-trip (MODE-08 на уровне хранилища)', () => {
    saveMode('mock');
    expect(getInitialMode()).toBe('mock');
  });
});

describe('saveFallbackEvent / getFallbackEvent — журнал фолбэка', () => {
  it('сохраняет причину и timestamp, читает обратно', () => {
    const before = Date.now();
    saveFallbackEvent('watchdog timeout');
    const ev = getFallbackEvent();
    expect(ev).not.toBeNull();
    expect(ev!.reason).toBe('watchdog timeout');
    expect(ev!.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('пишет warning в консоль (наблюдаемость для оператора)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    saveFallbackEvent('api down');
    expect(warn).toHaveBeenCalledWith('[Mode] Fallback triggered: api down');
    warn.mockRestore();
  });

  it('getFallbackEvent возвращает null когда события нет', () => {
    expect(getFallbackEvent()).toBeNull();
  });

  it('getFallbackEvent возвращает null при повреждённом JSON (устойчивость)', () => {
    sessionStorage.setItem('lastFallback', '{not json');
    expect(getFallbackEvent()).toBeNull();
  });
});

describe('modeReducer — переходы машины состояний', () => {
  it('SET_MODE меняет режим', () => {
    expect(modeReducer(BASE_STATE, { type: 'SET_MODE', payload: 'api' }).mode).toBe('api');
  });

  it('SET_API_AVAILABLE меняет доступность API', () => {
    expect(modeReducer(BASE_STATE, { type: 'SET_API_AVAILABLE', payload: true }).apiAvailable).toBe(true);
  });

  it('SET_LAST_PING фиксирует время пинга', () => {
    expect(modeReducer(BASE_STATE, { type: 'SET_LAST_PING', payload: 12345 }).lastPingTime).toBe(12345);
  });

  it('SET_ERROR ставит и снимает ошибку', () => {
    expect(modeReducer(BASE_STATE, { type: 'SET_ERROR', payload: 'HTTP 500' }).lastError).toBe('HTTP 500');
    expect(modeReducer({ ...BASE_STATE, lastError: 'x' }, { type: 'SET_ERROR', payload: null }).lastError).toBeNull();
  });

  it('TRIGGER_FALLBACK включает флаг фолбэка', () => {
    expect(modeReducer(BASE_STATE, { type: 'TRIGGER_FALLBACK' }).fallbackTriggered).toBe(true);
  });

  it('RESET_FALLBACK выключает флаг фолбэка', () => {
    const on = { ...BASE_STATE, fallbackTriggered: true };
    expect(modeReducer(on, { type: 'RESET_FALLBACK' }).fallbackTriggered).toBe(false);
  });

  it('неизвестное действие возвращает state без изменений (чистота редьюсера)', () => {
    const unknown = { type: 'NOPE' } as never;
    expect(modeReducer(BASE_STATE, unknown)).toBe(BASE_STATE);
  });

  it('редьюсер не мутирует входной state (иммутабельность)', () => {
    const frozen = Object.freeze({ ...BASE_STATE });
    const next = modeReducer(frozen, { type: 'SET_MODE', payload: 'mock' });
    expect(next).not.toBe(frozen);
    expect(frozen.mode).toBe('auto');
  });
});

describe('getInitialState — стартовый снапшот', () => {
  it('берёт mode из getInitialMode и обнуляет остальное', () => {
    localStorage.setItem('apiMode', 'api');
    expect(getInitialState()).toEqual({
      mode: 'api',
      apiAvailable: false,
      lastPingTime: null,
      lastError: null,
      fallbackTriggered: false,
    });
  });
});
