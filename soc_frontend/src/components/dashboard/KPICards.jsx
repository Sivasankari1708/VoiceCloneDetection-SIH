// src/components/dashboard/KPICards.jsx
import React from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  Radio,
  SearchCode,
  Calendar,
  ShieldCheck
} from 'lucide-react';

export function KPICards({ kpis = {}, incidents = [] }) {
  const activeCritical = incidents.filter(
    i =>
      i.severity === 'CRITICAL' &&
      i.status !== 'RESOLVED' &&
      i.status !== 'FALSE_POSITIVE'
  ).length;

  const highRisk = incidents.filter(
    i =>
      (i.severity === 'HIGH' || i.riskScore >= 70) &&
      i.status !== 'RESOLVED' &&
      i.status !== 'FALSE_POSITIVE'
  ).length;

  const openInvestigations = incidents.filter(
    i =>
      i.status === 'UNDER_INVESTIGATION' ||
      i.status === 'OPEN'
  ).length;

  const cards = [
    {
      label: 'ACTIVE CRITICAL',
      value: activeCritical,
      trend: 'Threats requiring intervention',
      color: activeCritical > 0 ? 'text-red-700' : 'text-slate-700',
      bg: activeCritical > 0 ? 'bg-red-50/80 border-red-200' : 'bg-white border-slate-200/90',
      icon: AlertOctagon,
      iconColor: activeCritical > 0 ? 'text-red-600' : 'text-slate-400',
      statusPulse: activeCritical > 0
    },
    {
      label: 'HIGH-RISK CALLS',
      value: highRisk,
      trend: 'Elevated impersonation signals',
      color: 'text-slate-900',
      bg: 'bg-white border-slate-200/90',
      icon: ShieldAlert,
      iconColor: 'text-amber-500'
    },
    {
      label: 'MONITORED STREAMS',
      value: kpis.underAnalysis ?? 0,
      trend: 'Active protected sessions',
      color: 'text-blue-700',
      bg: 'bg-blue-50/50 border-blue-200/70',
      icon: Radio,
      iconColor: 'text-blue-600'
    },
    {
      label: 'OPEN INVESTIGATIONS',
      value: openInvestigations,
      trend: 'Cases in triage or review',
      color: 'text-slate-900',
      bg: 'bg-white border-slate-200/90',
      icon: SearchCode,
      iconColor: 'text-slate-400'
    },
    {
      label: 'INCIDENTS TODAY',
      value: kpis.incidentsToday ?? 0,
      trend: '24-hour recorded events',
      color: 'text-slate-900',
      bg: 'bg-white border-slate-200/90',
      icon: Calendar,
      iconColor: 'text-slate-400'
    },
    {
      label: 'PROTECTED IDENTITIES',
      value: kpis.protectedIdentities ?? 0,
      trend: 'Enrolled organizational leaders',
      color: 'text-emerald-700',
      bg: 'bg-white border-slate-200/90',
      icon: ShieldCheck,
      iconColor: 'text-emerald-600'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
      {cards.map((card, i) => {
        const Icon = card.icon;

        return (
          <div
            key={i}
            className={`p-4 rounded-xl border ${card.bg} shadow-xs relative overflow-hidden flex flex-col justify-between transition-all hover:shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {card.label}
              </span>

              <Icon className={`w-4 h-4 ${card.iconColor}`} />
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-2xl font-black tracking-tight ${card.color}`}>
                {card.value}
              </span>

              {card.statusPulse && (
                <span className="relative flex h-2 w-2 mb-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
            </div>

            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {card.trend}
            </div>
          </div>
        );
      })}
    </div>
  );
}