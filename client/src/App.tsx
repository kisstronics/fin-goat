import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AppShell } from './components/AppShell';
import { AboutPage } from './pages/AboutPage';
import { AdminPage } from './pages/AdminPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { ContactPage } from './pages/ContactPage';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RecurringPage } from './pages/RecurringPage';
import { ScreenersPage } from './pages/ScreenersPage';
import { SettingsPage } from './pages/SettingsPage';

function RootGate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-main center">
          <p>Loading…</p>
        </div>
      </div>
    );
  }
  if (!user) return <HomePage />;
  return (
    <AppShell>
      <DashboardPage />
    </AppShell>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-main center">
          <p>Loading…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return <AppShell>{children}</AppShell>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootGate />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route
        path="/portfolio"
        element={
          <Protected>
            <PortfolioPage />
          </Protected>
        }
      />
      <Route
        path="/screeners"
        element={
          <Protected>
            <ScreenersPage />
          </Protected>
        }
      />
      <Route
        path="/recurring"
        element={
          <Protected>
            <RecurringPage />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPage />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminOnly>
              <AdminPage />
            </AdminOnly>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
