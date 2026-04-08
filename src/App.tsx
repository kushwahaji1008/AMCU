import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './AuthContext';
import { LanguageProvider } from './LanguageContext';
import { ThemeProvider } from './ThemeContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CollectionEntry from './components/CollectionEntry';
import FarmerManagement from './components/FarmerManagement';
import FarmerProfile from './components/FarmerProfile';
import Reports from './components/Reports';
import ShiftManagement from './components/ShiftManagement';
import QualityTesting from './components/QualityTesting';
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
import DairyManagement from './components/DairyManagement';
import ErrorBoundary from './components/ErrorBoundary';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthReady } = useAuth();
  
  if (!isAuthReady || loading) return null;
  if (!user) return <Navigate to="/login" />;
  
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAuthReady } = useAuth();
  
  if (!isAuthReady || loading) return null;
  if (!user) return <Navigate to="/login" />;
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') return <Navigate to="/" />;
  
  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <Toaster position="top-right" richColors />
            <Router>
              <Layout>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="/collection" element={<ProtectedRoute><CollectionEntry /></ProtectedRoute>} />
                  <Route path="/farmers" element={<ProtectedRoute><FarmerManagement /></ProtectedRoute>} />
                  <Route path="/farmers/:id" element={<ProtectedRoute><FarmerProfile /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                  <Route path="/shifts" element={<ProtectedRoute><ShiftManagement /></ProtectedRoute>} />
                  <Route path="/quality" element={<ProtectedRoute><QualityTesting /></ProtectedRoute>} />
                  <Route path="/rates" element={<AdminRoute><RateChartManagement /></AdminRoute>} />
                  <Route path="/receipts" element={<ProtectedRoute><ReceiptPrint /></ProtectedRoute>} />
                  <Route path="/payments" element={<AdminRoute><PaymentProcessing /></AdminRoute>} />
                  <Route path="/ledger" element={<ProtectedRoute><Ledger /></ProtectedRoute>} />
                  <Route path="/devices" element={<AdminRoute><DeviceIntegration /></AdminRoute>} />
                  <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
                  <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                  <Route path="/audit" element={<AdminRoute><AuditLog /></AdminRoute>} />
                  <Route path="/backup" element={<AdminRoute><BackupRestore /></AdminRoute>} />
                  <Route path="/help" element={<ProtectedRoute><HelpAbout /></ProtectedRoute>} />
                  <Route path="/sync" element={<AdminRoute><Synchronization /></AdminRoute>} />
                  <Route path="/mobile" element={<ProtectedRoute><MobileApp /></ProtectedRoute>} />
                  <Route path="/dairies" element={<AdminRoute><DairyManagement /></AdminRoute>} />
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
