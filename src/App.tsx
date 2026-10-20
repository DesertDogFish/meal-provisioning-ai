import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TripsPage from './pages/TripsPage';
import TripDetailPage from './pages/TripDetailPage';
import RecipesPage from './pages/RecipesPage';
import AdminPage from './pages/AdminPage';
import ErrorsDemoPage from './pages/ErrorsDemoPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ProductsPage from './pages/ProductsPage';

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Layout><DashboardPage /></Layout>
                </ProtectedRoute>
              } />
              <Route path="/trips" element={
                <ProtectedRoute>
                  <Layout><TripsPage /></Layout>
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
          <Route path="/errors-demo" element={
            <ProtectedRoute>
              <Layout><ErrorsDemoPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/login" replace />} />            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
