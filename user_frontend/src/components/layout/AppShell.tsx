import React, { type ReactNode, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield, Home, Phone, Clock, Bell, User, Settings, Menu, X, LogOut
} from 'lucide-react';
import { useAuth, useNotifications, useActiveCall } from '../../context/AppContext';
import { authService } from '../../services/auth/authService';
import IncomingCallModal from '../call/IncomingCallModal';

interface AppShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/live', label: 'Live Protection', icon: Phone },
  { to: '/history', label: 'Call History', icon: Clock },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile & Settings', icon: User },
];

function NavItem({ to, label, icon: Icon, badge, onClick }: {
  to: string; label: string; icon: React.ElementType; badge?: number; onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative
         ${isActive
           ? 'bg-blue-50 text-blue-700 font-semibold'
           : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
         }`
      }
    >
      <Icon size={18} aria-hidden />
      <span>{label}</span>
      {badge ? (
        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const { activeCall } = useActiveCall();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await authService.logout();
    logout();
    navigate('/login');
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 py-4 mb-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Shield size={18} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-slate-900 text-base leading-none">VoiceShield</div>
          <div className="text-xs text-slate-400 mt-0.5">AI Call Scam Shield</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1 px-2" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavItem
            key={to}
            to={to}
            label={label}
            icon={icon}
            badge={to === '/notifications' ? unreadCount : undefined}
            onClick={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      {/* User + Settings */}
      <div className="px-2 py-3 border-t border-slate-100 mt-2">
        <NavItem to="/settings/security" label="Security Settings" icon={Settings} onClick={() => setMobileOpen(false)} />
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-150 w-full mt-1"
        >
          <LogOut size={18} aria-hidden />
          <span>Sign out</span>
        </button>

        {/* User */}
        {user && (
          <div className="flex items-center gap-3 px-3 py-3 mt-2 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {user.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 truncate">{user.name}</div>
              <div className="text-xs text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-white flex flex-col shadow-xl">
            <button
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield size={15} className="text-white" />
            </div>
            <span className="font-bold text-slate-900">VoiceShield</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/notifications" className="relative p-1.5 rounded-lg hover:bg-slate-100">
              <Bell size={20} className="text-slate-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </NavLink>
          </div>
        </header>

        {/* Active Call Return Banner */}
        {activeCall && location.pathname !== '/live' && (
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-2.5 flex items-center justify-between shadow-md z-30">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>VoiceShield Protected Call: <strong>{activeCall.caller.name}</strong></span>
              <span className="text-blue-200 hidden sm:inline">
                ({activeCall.security.severity} • {activeCall.security.score}/100)
              </span>
            </div>
            <button
              onClick={() => navigate('/live')}
              className="bg-white text-blue-800 font-bold px-3 py-1 rounded-lg text-xs hover:bg-blue-50 shadow-sm transition-all"
            >
              Return to Call →
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" id="main-content">
          {children}
        </main>
      </div>

      {/* Global incoming call listener and alert modal */}
      <IncomingCallModal />
    </div>
  );
}
