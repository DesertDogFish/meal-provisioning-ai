import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { Compass, LogOut, Menu, Mountain, Ship } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { ApiModeModal } from './ApiModeModal';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiMode, setApiMode] = useState<'mock' | 'real'>('mock');
  const [showModeModal, setShowModeModal] = useState(false);
  const isAdmin = state.currentUser?.role === 'ADMIN';

  useEffect(() => {
    setApiMode(api.getMode());
  }, []);

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
    navigate('/login');
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
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: 'rgba(18, 24, 38, 0.7)', backdropFilter: 'blur(14px)', borderRight: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--w1), var(--w2))' }}>
            <svg width="24" height="24" viewBox="0 0 96 96">
              <path d="M48 18 L70 70 H26 Z" fill="#fff"/>
              <path d="M18 80 q8 -6 15 0 t15 0 t15 0 t15 0" stroke="#04121A" strokeWidth="5" fill="none"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'Unbounded', color: 'var(--text)' }}>Провиант</h1>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Планировщик питания</p>
          </div>
        </div>
        
        <nav className="px-4 py-6 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'text-white' : ''
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(45, 212, 191, 0.12)' : 'transparent',
                boxShadow: isActive ? 'inset 2px 0 0 var(--w1)' : 'none',
                color: isActive ? 'var(--text)' : 'var(--muted)',
                fontWeight: 600,
                fontSize: '13px'
              })}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'var(--elev)', color: 'var(--text)' }}>
              {state.currentUser?.firstName?.[0]}{state.currentUser?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{state.currentUser?.firstName} {state.currentUser?.lastName}</p>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{state.currentUser?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--muted)';
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
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="px-6 py-4 flex items-center gap-4 lg:hidden" style={{ background: 'rgba(18, 24, 38, 0.7)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--border)' }}>
          <button onClick={() => setSidebarOpen(true)} style={{ color: 'var(--muted)' }}>
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold" style={{ fontFamily: 'Unbounded', color: 'var(--text)' }}>Провиант</h1>
        </header>
        
        {/* CR-5.1: Бейдж режима API */}
        <div 
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all hover:scale-105"
          style={{ 
            background: 'var(--surface)', 
            border: '1px solid var(--border)',
            fontSize: '11px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}
          onClick={() => setShowModeModal(true)}
          title="Клик для настройки режима"
        >
          <div 
            className="w-2 h-2 rounded-full"
            style={{ 
              background: apiMode === 'mock' ? 'var(--fire)' : '#22C55E',
              boxShadow: apiMode === 'mock' ? '0 0 8px var(--fire)' : '0 0 8px #22C55E'
            }}
          />
          <span style={{ color: 'var(--muted)' }}>
            {apiMode === 'mock' ? 'демо-режим' : 'бэкенд'}
          </span>
        </div>

        {showModeModal && <ApiModeModal onClose={() => setShowModeModal(false)} />}
        
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
