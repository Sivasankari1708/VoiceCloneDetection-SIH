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

import { isAttackerUser, getEffectiveAuthSession, ensureAttackerCredentials } from '../services/auth/authStorage';

// ─── Role Helpers & Guards ────────────────────────────────────────

function RequireEmployee({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, login } = useAuth();

  React.useEffect(() => {
    // If not authenticated or holding an attacker session, recover the employee persona
    if (!isAuthenticated || isAttackerUser(user)) {
      const session = getEffectiveAuthSession('/live');
      if (session.user && session.token && !isAttackerUser(session.user)) {
        login(session.user, session.token);
      }
    }
  }, [isAuthenticated, user, login]);

  // If already authenticated as employee
  if (isAuthenticated && !isAttackerUser(user)) {
    return <>{children}</>;
  }

  // Synchronous recovery if storage already has employee credentials
  const session = getEffectiveAuthSession('/live');
  if (session.user && session.token && !isAttackerUser(session.user)) {
    return <>{children}</>;
  }

  // If not logged in as employee, go to login (NEVER redirect to attacker page)
  return <Navigate to="/login" replace />;
}

function RequireAttacker({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, login } = useAuth();
  const [isInitializing, setIsInitializing] = React.useState(false);

  React.useEffect(() => {
    // If not authenticated or holding an employee session, recover or provision attacker persona
    if (!isAuthenticated || !isAttackerUser(user)) {
      const session = getEffectiveAuthSession('/attacker');
      if (session.user && session.token && isAttackerUser(session.user)) {
        login(session.user, session.token);
      } else {
        setIsInitializing(true);
        ensureAttackerCredentials()
          .then(({ user: attUser, token: attToken }) => {
            login(attUser, attToken);
          })
          .catch(() => {})
          .finally(() => setIsInitializing(false));
      }
    }
  }, [isAuthenticated, user, login]);

  // If already authenticated as attacker
  if (isAuthenticated && isAttackerUser(user)) {
    return <>{children}</>;
  }

  // Synchronous recovery if storage already has attacker credentials
  const session = getEffectiveAuthSession('/attacker');
  if (session.user && session.token && isAttackerUser(session.user)) {
    return <>{children}</>;
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold text-slate-300">Connecting to Attacker Console...</div>
        </div>
      </div>
    );
  }

  // If not logged in as attacker, go to login (NEVER redirect to employee page)
  return <Navigate to="/login" replace />;
}

// ─── App Routes ───────────────────────────────────────────────
export default function AppRoutes() {
  const { isAuthenticated, user } = useAuth();

  const isAttacker = isAttackerUser(user);
  const defaultRedirect = !isAuthenticated
    ? '/login'
    : isAttacker
    ? '/attacker'
    : '/live';

  return (
    <Routes>
      {/* Public Login */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={defaultRedirect} replace /> : <LoginPage />}
      />

      {/* 1. Employee / User Pages (Only accessible to Employees) */}
      <Route
        path="/live"
        element={
          <RequireEmployee>
            <AppShell>
              <LiveCallPage />
            </AppShell>
          </RequireEmployee>
        }
      />
      <Route path="/protection" element={<Navigate to="/live" replace />} />

      {/* 2. Call History (Only accessible to Employees) */}
      <Route
        path="/history"
        element={
          <RequireEmployee>
            <AppShell>
              <HistoryPage />
            </AppShell>
          </RequireEmployee>
        }
      />
      <Route
        path="/history/:callId"
        element={
          <RequireEmployee>
            <AppShell>
              <CallDetailsPage />
            </AppShell>
          </RequireEmployee>
        }
      />

      {/* 3. Attacker Demo Page (Only accessible to Attacker role) */}
      <Route
        path="/attacker"
        element={
          <RequireAttacker>
            <AppShell>
              <AttackerPage />
            </AppShell>
          </RequireAttacker>
        }
      />
      <Route path="/sender" element={<Navigate to="/attacker" replace />} />

      {/* Supporting Pages (Employee-only) */}
      <Route path="/home" element={<RequireEmployee><AppShell><HomePage /></AppShell></RequireEmployee>} />
      <Route path="/alert" element={<RequireEmployee><AppShell><SecurityAlertPage /></AppShell></RequireEmployee>} />
      <Route path="/identity" element={<RequireEmployee><AppShell><IdentityPage /></AppShell></RequireEmployee>} />
      <Route path="/conversation" element={<RequireEmployee><AppShell><ConversationPage /></AppShell></RequireEmployee>} />
      <Route path="/verification" element={<RequireEmployee><AppShell><VerificationPage /></AppShell></RequireEmployee>} />
      <Route path="/notifications" element={<RequireEmployee><AppShell><NotificationsPage /></AppShell></RequireEmployee>} />
      <Route path="/profile" element={<RequireEmployee><AppShell><ProfilePage /></AppShell></RequireEmployee>} />
      <Route path="/settings/security" element={<RequireEmployee><AppShell><SecuritySettingsPage /></AppShell></RequireEmployee>} />
      <Route path="/privacy" element={<RequireEmployee><AppShell><PrivacyPage /></AppShell></RequireEmployee>} />
      <Route path="/settings/sources" element={<RequireEmployee><AppShell><CommunicationSourcesPage /></AppShell></RequireEmployee>} />

      {/* Legacy / SOC redirects: SOC is now a separate application */}
      <Route path="/soc" element={<Navigate to={defaultRedirect} replace />} />
      <Route path="/soc/*" element={<Navigate to={defaultRedirect} replace />} />

      {/* Default catch-alls */}
      <Route path="/" element={<Navigate to={defaultRedirect} replace />} />
      <Route path="*" element={<Navigate to={defaultRedirect} replace />} />
    </Routes>
  );
}
