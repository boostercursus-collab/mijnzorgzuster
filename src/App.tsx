import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthProvider';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Assignments from './pages/Assignments';
import ZZPs from './pages/ZZPs';
import TimeRegistrations from './pages/TimeRegistrations';
import Reports from './pages/Reports';

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center">Laden...</div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/" />;

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="uren" element={<TimeRegistrations />} />
            
            {/* Admin Routes */}
            <Route path="opdrachtgevers" element={
              <ProtectedRoute adminOnly>
                <Clients />
              </ProtectedRoute>
            } />
            <Route path="opdrachten" element={
              <ProtectedRoute adminOnly>
                <Assignments />
              </ProtectedRoute>
            } />
            <Route path="zzp" element={
              <ProtectedRoute adminOnly>
                <ZZPs />
              </ProtectedRoute>
            } />
            <Route path="rapportage" element={
              <ProtectedRoute adminOnly>
                <Reports />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
