/**
 * Защита маршрута: сессию и роль читает из AuthContext (cleanup-п.7) — свой
 * `GET /auth/me` больше не делает (раньше каждый экземпляр ProtectedRoute
 * запрашивал пользователя отдельно). Потеря сессии во время работы приходит
 * из провайдера (api.onSessionLost → user=null → редирект на /login).
 */
import { Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';
import { useAuth } from './AuthProvider';

export default function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return <PageLoader label="Проверяем сессию…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // FIX: нормализация роли (без учёта регистра) — в контексте (isAdmin)
  if (adminOnly && !isAdmin) {
    return <Navigate to="/trips" replace />;
  }

  return <>{children}</>;
}
