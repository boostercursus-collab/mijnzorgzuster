import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider, useAuth } from './AuthProvider';
import Layout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Assignments from './pages/Assignments';
import ZZPs from './pages/ZZPs';
import TimeRegistrations from './pages/TimeRegistrations';
import Reports from './pages/Reports';
import AdminPanel from './pages/AdminPanel';

// Verbeterde ProtectedRoute met role-check (gebruikt nu de 'role' uit AuthProvider)
const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, role, loading } = useAuth(); // Gebruik 'role' ipv 'profile?.role'

  if (loading) return <div className="flex h-screen items-center justify-center font-medium text-pink-600">Laden...</div>;
  
  // Niet ingelogd? Naar login pagina
  if (!user) return <Navigate to="/login" />;
  
  // Wel ingelogd, maar geen admin op een admin-only pagina? Naar dashboard
  if (adminOnly && role !== 'admin') return <Navigate to="/" />;

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Publieke routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          
          {/* Beveiligde routes binnen de Layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard: Toegankelijk voor ZZP en Admin */}
            <Route index element={<Dashboard />} />
            
            {/* Uren: Toegankelijk voor ZZP en Admin */}
            <Route path="uren" element={<TimeRegistrations />} />
            
            {/* --- EXCLUSIEVE ADMIN SECTIES --- */}
            
            {/* Het nieuwe Gebruikersbeheer Paneel */}
            <Route path="admin" element={
              <ProtectedRoute adminOnly>
                <AdminPanel />
              </ProtectedRoute>
            } />

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

          {/* Fallback: alles wat niet bestaat gaat naar home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      <Analytics />
    </AuthProvider>
  );
}