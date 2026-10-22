import { Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

export default function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('accessToken');
    
    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    try {
      const user = await api.get<User>('/auth/me');
      setCurrentUser(user);
      setIsAuthenticated(true);
    } catch (error) {
      // P0.5#1: api.get сам попытается обновить пару токенов; сюда попадаем,
      // только если refresh не помог (refreshToken отозван/истёк) или запроса токена нет.
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  // P0.5#1: если сессия потеряна во время работы (refresh не помог) — редирект на /login
  useEffect(() => {
    const unsubscribe = api.onSessionLost(() => setIsAuthenticated(false));
    return unsubscribe;
  }, []);

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--muted)' }}>Загрузка...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (adminOnly && currentUser?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}
