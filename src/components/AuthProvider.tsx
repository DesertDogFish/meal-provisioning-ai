/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.7): ОДИН `GET /auth/me`
 * на сессию. Раньше свой запрос пользователя делали ProtectedRoute (каждый
 * экземпляр!), Layout, TripsPage, RecipesPage и useTripDetail — до семи
 * одинаковых запросов на проход по сайдбару. Теперь провайдер над роутами
 * держит `{user, isAdmin, loading, refresh, logout}`, а потребители читают
 * контекст. Ошибка загрузки профиля — тоже здесь (тост показывает Layout,
 * состояние «не авторизован» — общий редирект ProtectedRoute).
 *
 * Single-flight: параллельные вызовы `refresh()` во время загрузки не плодят
 * запросы (общий in-flight промис). Logout инвалидирует контекст и чистит токены.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN' | string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  /** роль нормализована без учёта регистра (FIX: бэкенд отдаёт 'ADMIN') */
  isAdmin: boolean;
  /** первичная проверка сессии ещё идёт */
  loading: boolean;
  /** /auth/me не удалось загрузить (сессия есть/была) — для тоста в Layout */
  profileError: boolean;
  /** перечитать /auth/me (после login/регистрации, смена роли) */
  refresh: () => Promise<void>;
  /** выход: POST /auth/logout (best effort) + очистка токенов и контекста.
   * Бросает ошибку серверного logout — локальный выход выполнен в любом случае. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // стартуем с loading=true, только если есть токен (иначе редирект на /login мгновенный)
  const [loading, setLoading] = useState<boolean>(() => Boolean(localStorage.getItem('accessToken')));
  const [profileError, setProfileError] = useState(false);
  const inflight = useRef<Promise<AuthUser | null> | null>(null);

  const load = useCallback((): Promise<AuthUser | null> => {
    if (inflight.current) return inflight.current;
    const p = (async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setUser(null);
        setLoading(false);
        return null;
      }
      try {
        const u = await api.get<AuthUser>('/auth/me');
        setUser(u);
        setProfileError(false);
        return u;
      } catch (err) {
        // P0.5#1: api.get сам пробует refresh; сюда попадаем, если сессия мертва.
        // R10: причина видна в логе приложения.
        console.error('Auth: /auth/me failed, session cleared:', err);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setUser(null);
        setProfileError(true);
        return null;
      } finally {
        inflight.current = null;
        setLoading(false);
      }
    })();
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => { void load(); }, [load]);

  // P0.5#1: сессия потеряна во время работы (refresh не помог) — контекст пустеет,
  // ProtectedRoute редиректит на /login (подписка в ОДНОМ месте, а не в каждом роуте).
  useEffect(() => {
    const unsubscribe = api.onSessionLost(() => { setUser(null); setProfileError(false); });
    return unsubscribe;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      // локальный выход выполняется всегда (как прежний Layout.handleLogout)
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
      setProfileError(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAdmin: String(user?.role ?? '').toUpperCase() === 'ADMIN',
    loading,
    profileError,
    refresh,
    logout,
  }), [user, loading, profileError, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthProvider;
