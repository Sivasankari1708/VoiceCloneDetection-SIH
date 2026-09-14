import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import AppShell from '../components/layout/AppShell';

// Pages
import LoginPage from '../pages/LoginPage';
import HomePage from '../pages/HomePage';
import LiveCallPage from '../pages/LiveCallPage';
import AttackerPage from '../pages/AttackerPage';
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

// ─── Route Guards ─────────────────────────────────────────────

function RequireCitizenUser({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role === 'CALLER' || user?.role === 'ATTACKER') {
    return <Navigate to="/attacker" replace />;
  }
  return <>{children}</>;
}

function RequireAttacker({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== 'CALLER' && user?.role !== 'ATTACKER') {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

// ─── Citizen Authenticated Layout ──────────────────────────────
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireCitizenUser>
      <AppShell>{children}</AppShell>
    </RequireCitizenUser>
  );
}

// ─── App Routes ───────────────────────────────────────────────
export default function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  const defaultRedirect = !isAuthenticated
    ? '/login'
    : user?.role === 'CALLER' || user?.role === 'ATTACKER'
    ? '/attacker'
    : '/home';

  return (
    <Routes>
      {/* Public Login */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={defaultRedirect} replace /> : <LoginPage />}
      />

      {/* Dedicated Caller / Attacker Console (Laptop A) */}
      <Route
        path="/attacker"
        element={
          <RequireAttacker>
            <AttackerPage />
          </RequireAttacker>
        }
      />
      <Route path="/sender" element={<Navigate to="/attacker" replace />} />

      {/* Citizen Dashboard (Laptop B - Sreya) */}
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

      {/* Default redirects */}
      <Route path="/" element={<Navigate to={defaultRedirect} replace />} />
      <Route path="*" element={<Navigate to={defaultRedirect} replace />} />
    </Routes>
  );
}
