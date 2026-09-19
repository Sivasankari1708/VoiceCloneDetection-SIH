// src/components/layout/Sidebar.jsx
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  AlertTriangle,
  SearchCode,
  ShieldCheck,
  BarChart3,
  FileClock,
  FileText,
  Activity,
  Shield,
  ExternalLink
} from 'lucide-react';

export function Sidebar() {
  const location = useLocation();

  const navSections = [
    {
      title: 'SECURITY OPERATIONS',
      items: [
        { name: 'Overview', path: '/overview', icon: LayoutDashboard },
        { name: 'Live Security Events', path: '/events', icon: Radio, badge: 'LIVE' },
        { name: 'Incidents', path: '/incidents', icon: AlertTriangle },
        { name: 'Investigations', path: '/investigations/INC-2026-00142', icon: SearchCode, matchPrefix: '/investigations' },
      ]
    },
    {
      title: 'INTELLIGENCE',
      items: [
        { name: 'Protected Identities', path: '/protected-identities', icon: ShieldCheck },
        { name: 'Security Analytics', path: '/analytics', icon: BarChart3 },
      ]
    },
    {
      title: 'GOVERNANCE',
      items: [
        { name: 'Audit Logs', path: '/audit-logs', icon: FileClock },
        { name: 'Reports', path: '/reports', icon: FileText },
      ]
    },
    {
      title: 'SYSTEM',
      items: [
        { name: 'System Health', path: '/system-health', icon: Activity },
      ]
    }
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/90 flex flex-col shrink-0 h-screen sticky top-0 overflow-y-auto font-sans">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-xs">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-base text-slate-900 leading-none">VoiceShield</span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200/60">SOC</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">Enterprise Defense Console</p>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 py-4 px-3 space-y-6">
        {navSections.map((section, idx) => (
          <div key={idx}>
            <div className="px-3 mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              {section.title}
            </div>
            <nav className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.matchPrefix 
                  ? location.pathname.startsWith(item.matchPrefix)
                  : location.pathname === item.path;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border border-blue-200/70 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-500'}`} />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Bottom Compliance Box */}
      <div className="p-3.5 border-t border-slate-100 bg-slate-50/60">
        <div className="text-2xs text-slate-500 leading-tight">
          <div className="text-slate-800 font-bold mb-0.5">Zero-Audio Architecture</div>
          Raw voice streams are never retained. Telemetry only.
        </div>
      </div>
    </aside>
  );
}
