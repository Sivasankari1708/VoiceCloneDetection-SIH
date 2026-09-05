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
    <aside className="w-64 bg-soc-card border-r border-soc-border flex flex-col shrink-0 h-screen sticky top-0 overflow-y-auto">
      {/* Brand Header */}
      <div className="p-4 border-b border-soc-border flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-soc-accent/10 border border-soc-accent/30 flex items-center justify-center text-soc-accent shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold tracking-wider text-sm text-soc-text">VoiceShield</span>
            <span className="px-1 py-0.2 rounded bg-soc-accent/20 text-soc-accent font-mono text-[9px] font-semibold">SOC</span>
          </div>
          <p className="text-2xs text-soc-muted uppercase tracking-wider font-mono">Defense Console</p>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 py-4 px-3 space-y-6">
        {navSections.map((section, idx) => (
          <div key={idx}>
            <div className="px-3 mb-2 font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
              {section.title}
            </div>
            <nav className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.matchPrefix 
                  ? location.pathname.startsWith(item.matchPrefix)
                  : location.pathname === item.path;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center justify-between px-3 py-2 rounded text-xs font-mono transition-colors duration-150 ${
                      isActive
                        ? 'bg-soc-accent/10 text-soc-accent border border-soc-accent/30 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-soc-accent' : 'text-slate-400'}`} />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 bg-red-950/80 text-red-400 border border-red-800/60 rounded">
                        <span className="w-1 h-1 rounded-full bg-red-500 animate-ping" />
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
      <div className="p-3 border-t border-soc-border bg-slate-950/40">
        <div className="text-2xs font-mono text-slate-500 leading-tight">
          <div className="text-slate-400 font-semibold mb-0.5">SOC Telemetry Only</div>
          Strict zero-audio monitoring policy enforced.
        </div>
      </div>
    </aside>
  );
}
