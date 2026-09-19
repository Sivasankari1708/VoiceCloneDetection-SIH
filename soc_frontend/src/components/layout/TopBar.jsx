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
    <header className="h-14 bg-white border-b border-slate-200/90 px-6 flex items-center justify-between shrink-0 z-20 font-sans shadow-2xs">
      {/* Left Organization Title */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-xs font-bold tracking-tight text-slate-900 uppercase flex items-center gap-2">
            <span>VoiceShield Enterprise</span>
            <span className="text-slate-300 font-normal">|</span>
            <span className="text-slate-500 font-normal">Global Security Operations</span>
          </h1>
        </div>
      </div>

      {/* Center Operational Status */}
      <div className="hidden md:flex items-center gap-4 px-3 py-1 bg-slate-50 border border-slate-200/80 rounded-full">
        <StatusIndicator status="OPERATIONAL" label="SYSTEM OPERATIONAL" />
        <div className="h-3 w-[1px] bg-slate-200" />
        <div className="flex items-center gap-1.5 text-2xs text-slate-500 font-medium">
          <Clock className="w-3 h-3 text-slate-400" />
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
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors shadow-2xs cursor-pointer ${
            criticalCount > 0 
              ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100/80 animate-pulse'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title="Active Critical Impersonation Alerts"
        >
          <Bell className={`w-3.5 h-3.5 ${criticalCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
          <span>{criticalCount} Critical</span>
        </button>

        {/* Analyst Profile & Logout */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
            {initials}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-900 leading-none truncate max-w-[130px]">
              {displayName}
            </div>
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
              {displayRole}
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition ml-1 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
