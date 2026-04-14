/**
 * App Component
 * 
 * The root component of the React application.
 * Sets up global providers (Auth, Theme, Language), routing, and layout.
 * Includes route protection logic for authenticated and admin users.
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './AuthContext';
import { LanguageProvider } from './LanguageContext';
import { ThemeProvider } from './ThemeContext';
import { syncManager } from './services/syncManager';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CollectionEntry from './components/CollectionEntry';
import FarmerManagement from './components/FarmerManagement';
import FarmerProfile from './components/FarmerProfile';
import Reports from './components/Reports';
import ShiftManagement from './components/ShiftManagement';
import RateChartManagement from './components/RateChartManagement';
import ReceiptPrint from './components/ReceiptPrint';
import PaymentProcessing from './components/PaymentProcessing';
import DeviceIntegration from './components/DeviceIntegration';
import UserManagement from './components/UserManagement';
import Settings from './components/Settings';
import AuditLog from './components/AuditLog';
import BackupRestore from './components/BackupRestore';
import HelpAbout from './components/HelpAbout';
import Synchronization from './components/Synchronization';
import Login from './components/Login';
import Register from './components/Register';
import MobileApp from './components/MobileApp';
import Ledger from './components/Ledger';
import Billing from './components/Billing';
import DairyManagement from './components/DairyManagement';
import ErrorBoundary from './components/ErrorBoundary';
import BackButtonHandler from './components/BackButtonHandler';

/**
 * Higher-order component to protect routes that require authentication.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthReady } = useAuth();
  
  if (!isAuthReady || loading) return null;
  if (!user) return <Navigate to="/login" />;
  
  return <>{children}</>;
}

/**
 * Higher-order component to protect routes that require Admin or Super Admin privileges.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAuthReady } = useAuth();
  
  if (!isAuthReady || loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return <Navigate to="/" />;
  
  return <>{children}</>;
}

/**
 * Higher-order component to protect routes that require Super Admin privileges.
 */
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAuthReady } = useAuth();
  
  if (!isAuthReady || loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (profile?.role !== 'super_admin') return <Navigate to="/" />;
  
  return <>{children}</>;
}

function App() {
  useEffect(() => {
    // Trigger initial sync when the app loads
    syncManager.sync();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            {/* Standardized toast notifications */}
            <Toaster position="top-right" richColors />
            
            <Router>
              <BackButtonHandler />
              <Layout>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                  {/* Protected User Routes */}
                  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/collection" element={<ProtectedRoute><CollectionEntry /></ProtectedRoute>} />
                  <Route path="/farmers" element={<ProtectedRoute><FarmerManagement /></ProtectedRoute>} />
                  <Route path="/farmers/:id" element={<ProtectedRoute><FarmerProfile /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                  <Route path="/shifts" element={<ProtectedRoute><ShiftManagement /></ProtectedRoute>} />
                  <Route path="/receipts" element={<ProtectedRoute><ReceiptPrint /></ProtectedRoute>} />
                  <Route path="/ledger" element={<ProtectedRoute><Ledger /></ProtectedRoute>} />
                  <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
                  <Route path="/help" element={<ProtectedRoute><HelpAbout /></ProtectedRoute>} />
                  <Route path="/mobile" element={<ProtectedRoute><MobileApp /></ProtectedRoute>} />

                  {/* Admin-Only Routes */}
                  <Route path="/rates" element={<AdminRoute><RateChartManagement /></AdminRoute>} />
                  <Route path="/payments" element={<AdminRoute><PaymentProcessing /></AdminRoute>} />
                  <Route path="/devices" element={<AdminRoute><DeviceIntegration /></AdminRoute>} />
                  <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
                  <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                  <Route path="/audit" element={<SuperAdminRoute><AuditLog /></SuperAdminRoute>} />
                  <Route path="/backup" element={<AdminRoute><BackupRestore /></AdminRoute>} />
                  <Route path="/sync" element={<AdminRoute><Synchronization /></AdminRoute>} />
                  <Route path="/dairies" element={<SuperAdminRoute><DairyManagement /></SuperAdminRoute>} />
                </Routes>
              </Layout>
            </Router>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
