import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import TripsPage from './pages/TripsPage';
import TripDetailPage from './pages/TripDetailPage';
import RecipesPage from './pages/RecipesPage';
import AdminPage from './pages/AdminPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ProductsPage from './pages/ProductsPage';
import SyncLogsPage from './pages/SyncLogsPage';

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
          <BrowserRouter>
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
          </BrowserRouter>
        </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
