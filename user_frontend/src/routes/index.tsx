import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import AppShell from '../components/layout/AppShell';

// Pages — lazy imports for code splitting
import LoginPage from '../pages/LoginPage';
import HomePage from '../pages/HomePage';
import LiveCallPage from '../pages/LiveCallPage';
import SecurityAlertPage from '../pages/SecurityAlertPage';
import IdentityPage from '../pages/IdentityPage';
import ConversationPage from '../pages/ConversationPage';
import VerificationPage from '../pages/VerificationPage';
import HistoryPage from '../pages/HistoryPage';
import CallDetailsPage from '../pages/CallDetailsPage';
import NotificationsPage from '../pages/NotificationsPage';
import ProfilePage from '../pages/ProfilePage';
import SecuritySettingsPage from '../pages/SecuritySettingsPage';
import PrivacyPage from '../pages/PrivacyPage';
import CommunicationSourcesPage from '../pages/CommunicationSourcesPage';

// ─── Route Guard ──────────────────────────────────────────────
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// ─── Authenticated Layout ─────────────────────────────────────
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

// ─── App Routes ───────────────────────────────────────────────
export default function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />}
      />

      {/* Authenticated */}
      <Route path="/home" element={<AuthenticatedLayout><HomePage /></AuthenticatedLayout>} />
      <Route path="/live" element={<AuthenticatedLayout><LiveCallPage /></AuthenticatedLayout>} />
      <Route path="/alert" element={<AuthenticatedLayout><SecurityAlertPage /></AuthenticatedLayout>} />
      <Route path="/identity" element={<AuthenticatedLayout><IdentityPage /></AuthenticatedLayout>} />
      <Route path="/conversation" element={<AuthenticatedLayout><ConversationPage /></AuthenticatedLayout>} />
      <Route path="/verification" element={<AuthenticatedLayout><VerificationPage /></AuthenticatedLayout>} />
      <Route path="/history" element={<AuthenticatedLayout><HistoryPage /></AuthenticatedLayout>} />
      <Route path="/history/:callId" element={<AuthenticatedLayout><CallDetailsPage /></AuthenticatedLayout>} />
      <Route path="/notifications" element={<AuthenticatedLayout><NotificationsPage /></AuthenticatedLayout>} />
      <Route path="/profile" element={<AuthenticatedLayout><ProfilePage /></AuthenticatedLayout>} />
      <Route path="/settings/security" element={<AuthenticatedLayout><SecuritySettingsPage /></AuthenticatedLayout>} />
      <Route path="/privacy" element={<AuthenticatedLayout><PrivacyPage /></AuthenticatedLayout>} />
      <Route path="/settings/sources" element={<AuthenticatedLayout><CommunicationSourcesPage /></AuthenticatedLayout>} />

      {/* Default redirect */}
      <Route path="/" element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />} />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/login'} replace />} />
    </Routes>
  );
}
