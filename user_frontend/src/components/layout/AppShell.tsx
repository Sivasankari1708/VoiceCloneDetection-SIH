import { type ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Shield,
  Clock,
  UserCheck,
  Bell,
  Settings,
  Menu,
  X,
  LogOut,
  Zap,
  Home,
  User,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import { useAuth, useNotifications } from '../../context/AppContext';
import { authService } from '../../services/auth/authService';
import IncomingCallModal from '../call/IncomingCallModal';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [securityMenuOpen, setSecurityMenuOpen] = useState(false);

  const isAttacker = user?.role === 'ATTACKER' || user?.role === 'CALLER';

  const handleLogout = async () => {
    await authService.logout();
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ─── Top Navigation Bar (Government / Enterprise Clean Design) ─── */}
      <header className="bg-white/95 backdrop-blur sticky top-0 z-40 border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Brand Logo / Emblem */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <NavLink to={isAttacker ? '/attacker' : '/home'} className="flex items-center gap-2.5 group">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs transition-transform group-hover:scale-105 ${
                  isAttacker ? 'bg-slate-900 text-amber-400' : 'bg-blue-600 text-white'
                }`}
              >
                {isAttacker ? <Zap size={19} /> : <Shield size={19} />}
              </div>
              <div className="leading-tight">
                <div className="font-extrabold text-slate-900 text-base tracking-tight flex items-center gap-1.5">
                  <span>VOICE SHIELD</span>
                  {isAttacker && (
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                      SIMULATOR
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {isAttacker ? 'Voice Impersonation Attack Console' : 'Enterprise Call Security & Protection'}
                </div>
              </div>
            </NavLink>
          </div>

          {/* Center Navigation Links (Desktop) */}
          {!isAttacker ? (
            <nav className="hidden lg:flex items-center gap-1" aria-label="Main Navigation">
              <NavLink
                to="/home"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <Home size={14} />
                <span>Home</span>
              </NavLink>

              <NavLink
                to="/live"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 relative ${
                    isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <Shield size={14} />
                <span>Protection</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </NavLink>

              <NavLink
                to="/history"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <Clock size={14} />
                <span>Call History</span>
              </NavLink>

              {/* Security Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setSecurityMenuOpen(!securityMenuOpen)}
                  onBlur={() => setTimeout(() => setSecurityMenuOpen(false), 200)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Settings size={14} />
                  <span>Security</span>
                  <ChevronDown size={12} className="text-slate-400" />
                </button>

                {securityMenuOpen && (
                  <div className="absolute left-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-slate-200/90 py-1.5 z-50 animate-slow-fade">
                    <NavLink
                      to="/settings/security"
                      className="block px-3.5 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium"
                    >
                      Security Policies
                    </NavLink>
                    <NavLink
                      to="/verification"
                      className="block px-3.5 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium"
                    >
                      Independent Verification
                    </NavLink>
                    <NavLink
                      to="/privacy"
                      className="block px-3.5 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium"
                    >
                      Privacy & Data Protection
                    </NavLink>
                  </div>
                )}
              </div>

              <NavLink
                to="/notifications"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <Bell size={14} />
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-red-600 text-white rounded-full text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </NavLink>

              <NavLink
                to="/privacy"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                <HelpCircle size={14} />
                <span>Help / 1930</span>
              </NavLink>
            </nav>
          ) : (
            <div className="hidden md:flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                Target User: <strong className="text-slate-900">Sreya Sengupta (user_sreya_001)</strong>
              </span>
            </div>
          )}

          {/* Right Action Items & Profile */}
          <div className="flex items-center gap-3">
            {user && (
              <NavLink
                to="/profile"
                className="hidden sm:flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div
                  className={`w-7 h-7 rounded-lg text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                    isAttacker ? 'bg-slate-900 text-amber-400' : 'bg-blue-600'
                  }`}
                >
                  {user.avatarInitials || (isAttacker ? 'AT' : 'SS')}
                </div>
                <div className="text-left leading-tight pr-1">
                  <div className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                    {user.name || (isAttacker ? 'External Attacker' : 'Sreya Sengupta')}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                    {isAttacker ? 'Attacker Network' : (user.organization || 'FinCorp India')}
                  </div>
                </div>
              </NavLink>
            )}

            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200/80 transition-colors cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
              aria-label="Toggle mobile menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1 shadow-lg animate-slow-fade">
            {!isAttacker ? (
              <>
                <NavLink
                  to="/home"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Home size={16} />
                  <span>Home</span>
                </NavLink>
                <NavLink
                  to="/live"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Shield size={16} />
                  <span>Protection</span>
                </NavLink>
                <NavLink
                  to="/history"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Clock size={16} />
                  <span>Call History</span>
                </NavLink>
                <NavLink
                  to="/verification"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <UserCheck size={16} />
                  <span>Independent Verification</span>
                </NavLink>
                <NavLink
                  to="/settings/security"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Settings size={16} />
                  <span>Security Policy</span>
                </NavLink>
                <NavLink
                  to="/notifications"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <Bell size={16} />
                  <span>Notifications</span>
                </NavLink>
                <NavLink
                  to="/profile"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
                >
                  <User size={16} />
                  <span>Profile</span>
                </NavLink>
              </>
            ) : (
              <NavLink
                to="/attacker"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-blue-50"
              >
                <Zap size={16} />
                <span>Attack Console</span>
              </NavLink>
            )}
          </div>
        )}
      </header>

      {/* ─── Main Content Viewport ─── */}
      <main className="flex-1 flex flex-col min-w-0" id="main-content">
        {children}
      </main>

      {/* ─── Global Push Incoming Call Listener ─── */}
      <IncomingCallModal />
    </div>
  );
}
