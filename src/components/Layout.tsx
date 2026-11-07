import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronUp, LogOut, Mountain, Package, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

import ApiModeBadge from './ApiModeBadge';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import ScrollTopButton from './ScrollTopButton';
import SyncSection from './SyncSection';
import { lockBodyScroll, unlockBodyScroll } from './Modal';
import { onOpenAppDrawer } from '../ui/drawerBus'; // подзадача 9: фон не скроллится под открытым drawer
import { useToast } from './ToastProvider';
import { useAuth } from './AuthProvider'; // cleanup-п.7: профиль — из общего контекста

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // cleanup-п.7: пользователь и роль — из AuthContext (один /auth/me на сессию)
  const { user: currentUser, isAdmin, profileError, logout } = useAuth();
  // U29: поповер профиля («Выйти» — внутри меню, а не отдельная крайняя кнопка)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  /* Владелец 07.11.2026: при прокрутке липкая шапка страницы (и полоса похода)
     становится непрозрачной и принимает U-образную форму — скругления только снизу,
     верхние углы острые. Флаг вешаем на <html>: CSS ниже живёт в mobile-shell.css. */
  useEffect(() => {
    const root = document.documentElement;
    // Верхний фейд должен начинаться ПОД текущим липким стеком (шапка + полоса +
    // липкий поиск), иначе он прячется за непрозрачной плашкой. Считаем нижнюю
    // кромку самого нижнего «залипшего» элемента и пишем в --sticky-fade-top.
    const STICKY_SELECTOR = '.page-hero, .trip-head-row, .trip-strip, .checklist-sticky, .sticky, .filters-row';
    let lastEdge = -1;
    let lastFade = -1;
    const updateStickyEdge = () => {
      let bottom = 0;
      document.querySelectorAll<HTMLElement>(STICKY_SELECTOR).forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.position !== 'sticky' || cs.display === 'none') return;
        const r = el.getBoundingClientRect();
        if (r.height === 0) return;
        const topOffset = parseFloat(cs.top) || 0;
        if (r.top <= topOffset + 2) bottom = Math.max(bottom, r.bottom);
      });
      // Пишем только при изменении: иначе на каждый кадр скролла — лишний style recalc
      // (липкие плашки «трясло» у порога, владелец 07.11.2026).
      const edge = Math.round(bottom);
      if (edge !== lastEdge) {
        lastEdge = edge;
        root.style.setProperty('--sticky-fade-top', `${edge}px`);
        root.classList.toggle('has-sticky-top', edge > 8);
      }
    };
    let raf = 0;
    let deep = false;
    const applyScrollState = () => {
      raf = 0;
      const y = window.scrollY;
      root.classList.toggle('is-scrolled', y > 4);
      // «Глубокий» скролл с гистерезисом (скрыть на 64px, вернуть на 32px):
      // один порог давал дребезг — плашка то сворачивалась, то разворачивалась,
      // и её «колбасило» (владелец 07.11.2026).
      // Плашка гаснет пропорционально прокрутке (0..110px), раскладка не меняется —
      // дёргаться нечему. После полного исчезновения (is-scrolled-deep) она
      // сворачивается мгновенно, и поиск встаёт на её место.
      const fade = Math.min(1, Math.max(0, y / 110));
      const fadeRounded = Math.round(fade * 100) / 100;
      if (fadeRounded !== lastFade) {
        lastFade = fadeRounded;
        root.style.setProperty('--plaque-fade', String(fadeRounded));
      }
      if (!deep && y > 110) { deep = true; root.classList.add('is-scrolled-deep'); }
      else if (deep && y < 40) { deep = false; root.classList.remove('is-scrolled-deep'); }
      updateStickyEdge();
    };
    // Скролл-события пачками — считаем не чаще одного раза за кадр.
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(applyScrollState);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      root.classList.remove('is-scrolled');
    };
  }, []);
  // ЗАДАЧА 3 + cleanup-п.7: сбой загрузки профиля виден пользователю (тост),
  // но сообщается из ОДНОГО места — провайдер держит profileError.
  useEffect(() => {
    if (profileError) showError('Не удалось загрузить профиль пользователя');
  }, [profileError, showError]);

  /* Подзадача 9 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): мобильный drawer —
     Esc закрывает верхний оверлей (жёсткое правило дизайн-пака), фон под ним не
     скроллится (тот же счётчик блокировок, что у модалок), фокус возвращается на
     кнопку-гамбургер. На десктопе sidebarOpen всегда false — эффект не срабатывает. */
  const menuButtonRef = useRef<HTMLElement | null>(null);
  // UX-список владельца: меню на телефоне закрывается лёгким свайпом влево.
  const swipeStartX = useRef<number | null>(null);

  // UX-список владельца п.13/п.23: мобильного табло больше нет, меню открывают кнопки
  // в шапках страниц — Layout слушает шину и запоминает инициатора для возврата фокуса.
  useEffect(() => onOpenAppDrawer(() => {
    menuButtonRef.current = document.activeElement as HTMLElement | null;
    setSidebarOpen(true);
  }), []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSidebarOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockBodyScroll();
    };
  }, [sidebarOpen]);

  // cleanup-п.7: logout — в провайдере (инвалидирует контекст и чистит токены);
  // локальный выход выполняется даже при сбое серверного (finally провайдера).
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      // ЗАДАЧА 3: честно сообщаем, что серверная сессия не была отозвана.
      showError('Не удалось завершить сессию на сервере, выполнен локальный выход');
    } finally {
      navigate('/login');
    }
  };

  // Fix-5 (п.1): согласованный нейминг разделов — короткие существительные во
  // множественном числе («Походы / Блюда / Продукты»), у каждого своя осмысленная
  // иконка (раньше: «Каталог блюд» с корабликом и три раздела с гамбургером).
  const navItems = [
    { to: '/trips', label: 'Походы', icon: <Mountain size={20} /> },
    { to: '/recipes', label: 'Блюда', icon: <UtensilsCrossed size={20} /> },
    // U35 (список 26.10): «Ошибки (демо)» скрыты из навигации (роут редиректит)
    ...(isAdmin ? [
      { to: '/products', label: 'Продукты', icon: <Package size={20} /> },
      // cleanup-п.3 (31.10.2026): «Журнал синков» — таб раздела «Интеграции»
      // (/integrations?tab=logs), отдельный пункт сайдбара убран (дубль витрины).
      { to: '/integrations', label: 'Интеграции', icon: <RefreshCw size={20} /> },
    ] : []),
  ];

  return (
    <div className="min-h-screen flex justify-center" style={{ background: 'var(--bg-0)' }}>
      {/* Fix-8 (п.3): «оторвать от центра» — ВСЁ приложение (сайдбар + контент),
          а не только контент: общая центрированная оболочка .app-frame с
          ограниченной шириной; на широких экранах слева видна рамка оболочки
          (симметрично правому краю). На мобильных сайдбар по-прежнему off-canvas. */}
      <div className="app-frame min-h-screen w-full flex">
      {/* Sidebar. Список багов 25.10 (U18): на десктопе — sticky h-screen, навигация
          скроллится внутри, футер («Выйти», профиль, тогл темы) ПРИКОЛАН к низу
          вьюпорта и виден всегда — раньше absolute bottom-0 уезжал за экран вместе
          со страницей, и до «Выйти» надо было скроллить. */}
      <aside
        id="app-nav"
        aria-label="Навигация по разделам"
        onTouchStart={(e) => { swipeStartX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = swipeStartX.current;
          swipeStartX.current = null;
          if (start == null) return;
          const end = e.changedTouches[0]?.clientX ?? start;
          if (start - end > 40) setSidebarOpen(false); // «лёгкий» свайп влево
        }}
        className={`app-drawer fixed inset-y-0 left-0 w-64 flex flex-col transform transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:inset-auto ${sidebarOpen ? 'app-drawer--open translate-x-0' : '-translate-x-full'}`} style={{ background: 'color-mix(in srgb, var(--bg-1) 72%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRight: '1px solid var(--line)', zIndex: 'var(--z-nav)' }}>
        <div className="flex items-center gap-3 px-6 py-5" style={{ borderBottom: '1px solid var(--line)' }}>
          {/* DESIGN_MIGRATION 4.1: знак только из design-pack assets/ (mark.svg / mark-light.svg),
              инлайн-перерисовка и самопальная тень убраны — тень --shadow-glow из токена */}
          <div id="pv-mark" className="w-10 h-10 rounded-[var(--r-sm)] flex items-center justify-center p-1.5" style={{ boxShadow: 'var(--shadow-glow)' }}>
            <BrandMark size={32} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold logo-word" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Провиант</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Планировщик питания</p>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
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

        {/* п.14 (список владельца): синхронизация и статус сети — в боковом меню:
            онлайн/офлайн, размер очереди, кнопка принудительного запуска и интервал
            автосинка (по умолчанию 5 минут). Сама автосинхронизация стартует в App. */}
        <SyncSection onAfterAction={() => setSidebarOpen(false)} />

        {/* Футер сайдбара. U29 (список 26.10): «Выйти» больше не торчит отдельной
            кнопкой с краю — профиль стал меню: клик по карточке пользователя открывает
            поповер с выходом (danger-акцент), тогл темы остался в строке. */}
        <div className="mt-auto p-4" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0" ref={profileRef}>
              {profileOpen && (
                <div
                  role="menu"
                  aria-label="Меню пользователя"
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl p-1.5 shadow-xl"
                  style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', zIndex: 'var(--z-pop)' }}
                >
                  <div className="px-3 py-2 mb-1" style={{ borderBottom: '1px solid var(--line)' }}>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{currentUser?.firstName} {currentUser?.lastName}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{currentUser?.email}</p>
                  </div>
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors text-sm"
                    style={{ color: 'var(--danger, #ef4444)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--danger, #ef4444) 10%, transparent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <LogOut size={16} />
                    <span>Выйти</span>
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setProfileOpen(v => !v)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label="Меню пользователя"
                className="flex items-center gap-3 w-full px-3 py-2 rounded-[12px] transition-colors"
                style={{ color: 'var(--text-2)', background: profileOpen ? 'var(--bg-2)' : 'transparent' }}
              >
                <span className="avatar-chip">
                  {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{currentUser?.firstName} {currentUser?.lastName}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--text-3)' }}>Профиль</span>
                </span>
                <ChevronUp size={16} style={{ transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', flexShrink: 0 }} />
              </button>
            </div>
            <ThemeToggle />
            {/* UX-список владельца п.13: верхнего табло на мобильном больше нет,
                поэтому бейдж режима (демо/бэкенд) живёт здесь, рядом с профилем. */}
            <div className="mt-2 flex justify-start">
              <ApiModeBadge inline />
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay — подзадача 9: это кнопка (не div), чтобы закрытие drawer
          было доступно с клавиатуры и скринридеру; слой --z-pop (под drawer --z-nav). */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Закрыть меню навигации"
          data-testid="drawer-overlay"
          className="fixed inset-0 lg:hidden border-0 p-0 cursor-default"
          onClick={() => setSidebarOpen(false)}
          style={{ background: 'color-mix(in srgb, var(--bg-0) 50%, transparent)', zIndex: 'var(--z-pop)' }}
        />
      )}

      {/* Main content */}
      {/* Подзадача 9: `min-w-0` ОБЯЗАТЕЛЕН — у flex-элемента `min-width: auto`,
          поэтому колонка растягивалась до min-content самого широкого потомка
          (полоса вкладок `.seg` с nowrap-подписями = 839px) и утаскивала за собой
          всю страницу: на 360px появлялся горизонтальный скролл ДОКУМЕНТА вместо
          скролла внутри `.seg`/`.mob-scroll`. */}
      <div className="flex-1 flex flex-col min-h-screen relative z-10 min-w-0">
        {/* Бейдж режима API: на мобильном — в топбаре (см. выше), на десктопе —
            flow-слот справа над контентом. KB-35 (UX-осмотр 31.10, п.12): раньше
            здесь был `fixed top-4 right-4`, который наезжал на kebab/кнопку темы.
            В прод-сборке ApiModeBadge возвращает null → слот нулевой высоты. */}
        <div className="hidden lg:flex justify-end items-start px-4 md:px-6 lg:px-8 dev-badge-slot">
          <ApiModeBadge />
        </div>
        
        <main className="app-main flex-1 min-w-0 p-4 md:p-6 lg:p-8 overflow-auto">
          {/* Fix-7 (п.10): контент центрирован и оторван от краёв — max-width 1200px */}
          <div className="app-shell">
            {children}
          </div>
        </main>
        {/* Компенсатор: когда плашка прогресса сворачивается, документ не должен
            становиться короче — иначе браузер поджимает scrollY и плашку дёргает. */}
        <div className="scroll-spacer" aria-hidden />
        {/* Владелец 07.11.2026: у кромок прокрутки — мягкий фейд, чтобы элементы
            не «касались» липких плашек, а растворялись под ними (сверху — под
            липким стеком, снизу — над нижним баром этапов). */}
        <div className="scroll-fade scroll-fade--bottom" aria-hidden />
        {/* Fix-7 (п.9): плавающая кнопка «наверх» (появляется, когда шапка скрыта) */}
        <ScrollTopButton />
      </div>
      </div>{/* /.app-frame — Fix-8 (п.3) */}
    </div>
  );
}
