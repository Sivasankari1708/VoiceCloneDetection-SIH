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
      trend: 'Active critical incidents',
      color: 'text-red-400',
      bg: 'bg-red-950/20',
      border: 'border-red-900/40',
      icon: AlertOctagon,
      iconColor: 'text-red-500',
      statusPulse: activeCritical > 0
    },
    {
      label: 'HIGH-RISK EVENTS',
      value: highRisk,
      trend: 'Based on incident risk',
      color: 'text-orange-400',
      bg: 'bg-orange-950/20',
      border: 'border-orange-900/40',
      icon: ShieldAlert,
      iconColor: 'text-orange-500'
    },
    {
      label: 'UNDER ANALYSIS',
      value: kpis.underAnalysis ?? 0,
      trend: 'Active analysis sessions',
      color: 'text-soc-accent',
      bg: 'bg-sky-950/20',
      border: 'border-sky-900/40',
      icon: Radio,
      iconColor: 'text-soc-accent'
    },
    {
      label: 'OPEN INVESTIGATIONS',
      value: openInvestigations,
      trend: 'Open incident investigations',
      color: 'text-amber-400',
      bg: 'bg-amber-950/20',
      border: 'border-amber-900/40',
      icon: SearchCode,
      iconColor: 'text-amber-500'
    },
    {
      label: 'INCIDENTS TODAY',
      value: kpis.incidentsToday ?? 0,
      trend: '24h incident count',
      color: 'text-slate-200',
      bg: 'bg-slate-900/40',
      border: 'border-soc-border',
      icon: Calendar,
      iconColor: 'text-slate-400'
    },
    {
      label: 'PROTECTED IDENTITIES',
      value: kpis.protectedIdentities ?? 0,
      trend: 'Enrolled voice identities',
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/20',
      border: 'border-emerald-900/40',
      icon: ShieldCheck,
      iconColor: 'text-emerald-500'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 mb-6">
      {cards.map((card, i) => {
        const Icon = card.icon;

        return (
          <div
            key={i}
            className={`p-3.5 rounded-md border ${card.border} ${card.bg} relative overflow-hidden flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-slate-400">
                {card.label}
              </span>

              <Icon className={`w-4 h-4 ${card.iconColor}`} />
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-mono font-bold tracking-tight ${card.color}`}
              >
                {card.value}
              </span>

              {card.statusPulse && (
                <span className="relative flex h-2 w-2 mb-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
              )}
            </div>

            <div className="mt-1 text-2xs font-mono text-slate-500 truncate">
              {card.trend}
            </div>
          </div>
        );
      })}
    </div>
  );
}