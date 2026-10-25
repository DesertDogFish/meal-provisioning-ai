import { NavLink, useNavigate } from 'react-router-dom';
import { Compass, LogOut, Menu, Mountain, Ship } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import ApiModeBadge from './ApiModeBadge';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import { api } from '../api/client';
import { useToast } from './ToastProvider';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const loadUser = useCallback(async () => {
    try {
      const user = await api.get<User>('/auth/me');
      setCurrentUser(user);
    } catch (error) {
      console.error('Failed to load user:', error);
      // ЗАДАЧА 3: сбой загрузки профиля должен быть виден пользователю,
      // UI при этом остаётся в состоянии «не авторизован» (currentUser = null).
      setCurrentUser(null);
      showError('Не удалось загрузить профиль пользователя');
    }
  }, [showError]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // FIX: нормализация роли — бэкенд отдаёт 'ADMIN', но защита от регистра-расхождений
  const isAdmin = currentUser?.role?.toUpperCase() === 'ADMIN';

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
      // ЗАДАЧА 3: локальный выход всё равно выполнится (finally), но пользователю
      // честно сообщаем, что серверная сессия (refresh-токен) не была отозвана.
      showError('Не удалось завершить сессию на сервере, выполнен локальный выход');
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setCurrentUser(null);
      navigate('/login');
    }
  };

  const navItems = [
    { to: '/dashboard', label: 'Мои походы', icon: <Compass size={20} /> },
    { to: '/trips', label: 'Походы', icon: <Mountain size={20} /> },
    { to: '/recipes', label: 'Каталог блюд', icon: <Ship size={20} /> },
    { to: '/errors-demo', label: 'Ошибки (демо)', icon: <Menu size={20} /> },
    ...(isAdmin ? [
      { to: '/products', label: 'Продукты', icon: <Menu size={20} /> },
      { to: '/integrations', label: 'Интеграции', icon: <Menu size={20} /> },
      { to: '/sync-logs', label: 'Журнал синков', icon: <Menu size={20} /> }
    ] : []),
  ];

  return (
    <div className="min-h-screen flex fade-in-up" style={{ background: 'var(--bg-0)' }}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: 'color-mix(in srgb, var(--bg-1) 72%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRight: '1px solid var(--line)', zIndex: 'var(--z-nav)' }}>
        <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid var(--line)' }}>
          {/* DESIGN_MIGRATION 4.1: знак только из design-pack assets/ (mark.svg / mark-light.svg),
              инлайн-перерисовка и самопальная тень убраны — тень --shadow-glow из токена */}
          <div id="pv-mark" className="w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center p-1.5" style={{ boxShadow: 'var(--shadow-glow)' }}>
            <BrandMark size={32} />
          </div>
          <div>
            <h1 className="text-lg font-bold logo-word" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Провиант</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Планировщик питания</p>
          </div>
        </div>
        
        <nav className="px-4 py-6 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-[12px] transition-colors ${
                  isActive ? 'text-white' : ''
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'color-mix(in srgb, var(--amber-500) 12%, transparent)' : 'transparent',
                boxShadow: isActive ? 'inset 2px 0 0 var(--amber-500)' : 'none',
                color: isActive ? 'var(--amber-200)' : 'var(--text-2)',
                fontWeight: 600,
                fontSize: '13px'
              })}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="avatar-chip">
              {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{currentUser?.firstName} {currentUser?.lastName}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{currentUser?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2 rounded-[12px] transition-colors"
            style={{ color: 'var(--text-2)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-1)';
              e.currentTarget.style.background = 'var(--bg-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-2)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LogOut size={18} />
            <span className="text-sm">Выйти</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 lg:hidden" onClick={() => setSidebarOpen(false)}
          style={{ background: 'color-mix(in srgb, var(--bg-0) 50%, transparent)', zIndex: 'var(--z-pop)' }} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen relative z-10">
        <header className="px-6 py-4 flex items-center gap-4 lg:hidden" style={{ background: 'color-mix(in srgb, var(--bg-1) 66%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--line)' }}>
          {/* DESIGN_MIGRATION 7.2: иконочные кнопки с обязательным aria-label */}
          <button className="ibtn" onClick={() => setSidebarOpen(true)} aria-label="Открыть меню навигации">
            <Menu size={24} />
          </button>
          <BrandMark size={28} />
          <h1 className="text-lg font-bold logo-word flex-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Провиант</h1>
          <ThemeToggle />
        </header>
        
        {/* Бейдж режима API */}
        <ApiModeBadge />
        
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
