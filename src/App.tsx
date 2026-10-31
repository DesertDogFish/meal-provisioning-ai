import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PageLoader from './components/PageLoader';
import { AuthProvider } from './components/AuthProvider'; // cleanup-п.7: один /auth/me на сессию
import LoginPage from './pages/LoginPage';

/**
 * Fix-10 (п.4): тяжёлые страницы — ленивые чанки (React.lazy). Первый пейнт
 * на деплое (Vercel) больше не тащит весь_bundle разом: TripDetailPage,
 * recharts, datepicker, framer-motion и пр. доезжают только к своему роуту,
 * а на время дозагрузки показывается брендовый PageLoader (Suspense-фолбэк).
 * LoginPage/Layout/ProtectedRoute остаются в базовом чанке — это первый экран.
 */
const TripsPage = lazy(() => import('./pages/TripsPage'));
const TripDetailPage = lazy(() => import('./pages/TripDetailPage'));
const TripPrintPage = lazy(() => import('./pages/TripPrintPage'));
const TripReportPage = lazy(() => import('./pages/TripReportPage'));
const RecipesPage = lazy(() => import('./pages/RecipesPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.1) +
                  plans/done/2026-10-31-ux-audit-navigation.md (п.8, решение владельца —
                  вариант A): канон списка походов — /trips («Походы» = /trips,
                  URL совпадает со смыслом пункта сайдбара). /dashboard — легаси
                  точка входа после логина, редирект. Мёртвый DashboardPage.tsx
                  (не рендерился с 25.10) удалён; возврат страницы-дашборда со
                  статистикой — из git-истории, см. Backlog плана cleanup. */}
              <Route path="/trips" element={
                <ProtectedRoute>
                  <Layout><TripsPage /></Layout>
                </ProtectedRoute>
              } />
              <Route path="/dashboard" element={<Navigate to="/trips" replace />} />
              {/* Fix-4 (п.6): печатная версия похода (меню по дням + закупка +
                  итоги «кто сколько должен») — без Layout, открывается в новой
                  вкладке и сохраняется в PDF через диалог печати.
                  Fix-10 (п.4): на Vercel прямой заход/новая вкладка работали как
                  404 — SPA-фолбэк добавлен в vercel.json (rewrites → index.html). */}
              <Route path="/trips/:id/print" element={
                <ProtectedRoute>
                  <TripPrintPage />
                </ProtectedRoute>
              } />
              {/* Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 7): in-app
                  отчёт — финал воркфлоу на телефоне; без Layout, одна колонка.
                  «Поделиться» — Web Share API с фолбэком «скопировать текст»;
                  «PDF» открывает прежний print-маршрут (десктоп/печать). */}
              <Route path="/trips/:id/report" element={
                <ProtectedRoute>
                  <TripReportPage />
                </ProtectedRoute>
              } />
              <Route path="/trips/:id" element={
                <ProtectedRoute>
                  <Layout><TripDetailPage /></Layout>
                </ProtectedRoute>
              } />
              <Route path="/recipes" element={
                <ProtectedRoute>
                  <Layout><RecipesPage /></Layout>
                </ProtectedRoute>
              } />
          {/* cleanup-п.2 (31.10.2026): страница-сирота /admin демонтирована —
              вкладки «Цены»/«Рецепты» дублировали ProductsPage/RecipesPage,
              «Импорт» переехал в «Интеграции» (таб «Импорт каталога»).
              Редирект сохраняет старые закладки. */}
          <Route path="/admin" element={<Navigate to="/integrations" replace />} />
          <Route path="/products" element={
            <ProtectedRoute adminOnly>
              <Layout><ProductsPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/integrations" element={
            <ProtectedRoute adminOnly>
              <Layout><IntegrationsPage /></Layout>
            </ProtectedRoute>
          } />
          {/* cleanup-п.3: журнал синков — таб раздела «Интеграции»; роут
              редиректит с сохранением deep-link (?tab=logs из тостов/доков). */}
          <Route path="/sync-logs" element={<Navigate to="/integrations?tab=logs" replace />} />
          {/* U35 (список 26.10): страница «Ошибки (демо)» скрыта; cleanup-п.1
              (31.10.2026): мёртвый ErrorsDemoPage.tsx удалён, редирект оставлен. */}
          <Route path="/errors-demo" element={<Navigate to="/trips" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            </Suspense>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
