import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PageLoader from './components/PageLoader';
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
const RecipesPage = lazy(() => import('./pages/RecipesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const SyncLogsPage = lazy(() => import('./pages/SyncLogsPage'));

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Список багов 25.10: страница-дашборд «Мои походы» со статистикой
                  временно скрыта (статистика считалась из пустого списка — бэкенд
                  не отдаёт userId в TripResponse, «моих походов» не было видно).
                  /dashboard остаётся точкой входа после логина и рендерит список
                  походов (TripsPage); DashboardPage.tsx сохранён до возвращения. */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Layout><TripsPage /></Layout>
                </ProtectedRoute>
              } />
              {/* /trips — прежний адрес списка; теперь ведёт на /dashboard */}
              <Route path="/trips" element={<Navigate to="/dashboard" replace />} />
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
          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <Layout><AdminPage /></Layout>
            </ProtectedRoute>
          } />
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
          <Route path="/sync-logs" element={
            <ProtectedRoute adminOnly>
              <Layout><SyncLogsPage /></Layout>
            </ProtectedRoute>
          } />
          {/* U35 (список 26.10): страница «Ошибки (демо)» скрыта — не нужна ни
              пользователю, ни админу. Файл ErrorsDemoPage.tsx сохранён; старый
              адрес редиректит на список походов. */}
          <Route path="/errors-demo" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
