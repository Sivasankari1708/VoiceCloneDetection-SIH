// src/components/layout/TopBar.jsx
import React, { useState, useEffect } from 'react';
import { Shield, Bell, User, Clock, LogOut } from 'lucide-react';
import { StatusIndicator } from '../common/StatusIndicator';
import { useIncidents } from '../../hooks/useIncidents';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

export function TopBar({ onOpenAlertModal }) {
  const [utcTime, setUtcTime] = useState('');
  const [currentUser, setCurrentUser] = useState(() => api.getUser());
  const { incidents } = useIncidents();
  const navigate = useNavigate();

  const criticalCount = incidents.filter(
    i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
  ).length;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().replace('GMT', 'UTC'));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // If user info isn't cached in sessionStorage, query /api/auth/me
    if (!currentUser && api.getToken()) {
      api.getCurrentUser()
        .then(u => setCurrentUser(u))
        .catch(() => {});
    }
  }, [currentUser]);

  const handleLogout = () => {
    api.logout();
    navigate('/');
  };

  const displayName = currentUser?.full_name || currentUser?.username || 'Security Operator';
  const displayRole = currentUser?.role ? currentUser.role.replace('_', ' ') : 'SOC Lead';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'OP';

  return (
    <header className="h-14 bg-soc-card border-b border-soc-border px-5 flex items-center justify-between shrink-0 z-20">
      {/* Left Organization Title */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xs font-mono font-bold tracking-wider text-soc-text uppercase flex items-center gap-2">
            <span>VoiceShield Enterprise</span>
            <span className="text-soc-muted font-normal">|</span>
            <span className="text-slate-400 font-normal">Global Security Operations</span>
          </h1>
        </div>
      </div>

      {/* Center Operational Status */}
      <div className="hidden md:flex items-center gap-5 px-3 py-1 bg-slate-900/80 border border-slate-800 rounded">
        <StatusIndicator status="OPERATIONAL" label="SYSTEM OPERATIONAL" />
        <div className="h-3 w-[1px] bg-slate-800" />
        <div className="flex items-center gap-1.5 text-2xs font-mono text-slate-400">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>{utcTime || 'UTC 00:00:00'}</span>
        </div>
      </div>

      {/* Right Controls & Profile */}
      <div className="flex items-center gap-3">
        {/* Critical Alerts Counter */}
        <button
          onClick={() => {
            if (onOpenAlertModal) {
              onOpenAlertModal();
            } else {
              navigate('/incidents?severity=CRITICAL');
            }
          }}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded font-mono text-xs border transition-colors ${
            criticalCount > 0 
              ? 'bg-red-950/70 border-red-800/80 text-red-300 hover:bg-red-900/80 cursor-pointer animate-pulse'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
          title="Active Critical Impersonation Alerts"
        >
          <Bell className={`w-3.5 h-3.5 ${criticalCount > 0 ? 'text-red-400' : 'text-slate-400'}`} />
          <span className="font-semibold">{criticalCount} Critical</span>
        </button>

        {/* Analyst Profile & Logout */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-soc-border">
          <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-soc-accent font-mono text-xs font-bold">
            {initials}
          </div>
          <div className="hidden sm:block text-left font-mono">
            <div className="text-xs font-semibold text-slate-200 leading-none truncate max-w-[120px]">
              {displayName}
            </div>
            <div className="text-2xs text-soc-muted uppercase tracking-wider mt-0.5">
              {displayRole}
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition ml-1"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
