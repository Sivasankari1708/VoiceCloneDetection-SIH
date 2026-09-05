// src/pages/Overview.jsx
import React, { useMemo } from 'react';
import { KPICards } from '../components/dashboard/KPICards';
import { SecurityPosture } from '../components/dashboard/SecurityPosture';
import { SystemStatus } from '../components/dashboard/SystemStatus';
import { ActiveThreatsTable } from '../components/dashboard/ActiveThreatsTable';
import { CriticalAlertBanner } from '../components/alerts/CriticalAlertBanner';
import { useIncidents } from '../hooks/useIncidents';
import { INITIAL_KPIS, INITIAL_SYSTEM_SERVICES } from '../utils/mockData';
import { Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Overview() {
  const { incidents, loading, error, acknowledge, escalate } = useIncidents();

  // Find most severe active critical incident for banner
  const activeCriticalIncident = useMemo(() => {
    return incidents.find(
      (inc) => inc.severity === 'CRITICAL' && inc.status !== 'RESOLVED' && inc.status !== 'FALSE_POSITIVE'
    );
  }, [incidents]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-soc-border">
        <div>
          <h2 className="text-base font-mono font-bold tracking-wider text-slate-100 uppercase">
            Security Operations Center Overview
          </h2>
          <p className="text-2xs font-mono text-slate-400 mt-0.5">
            Real-time biometric voice verification, acoustic deepfake classification, and fraud intent defense
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-mono text-xs transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            <span>View Live Stream</span>
          </Link>
        </div>
      </div>

      {/* Prominent Critical Security Alert Banner (Section 6) */}
      {activeCriticalIncident && (
        <CriticalAlertBanner
          incident={activeCriticalIncident}
          onAcknowledge={acknowledge}
          onEscalate={escalate}
        />
      )}

      {/* KPI Cards (Section 4) */}
      <KPICards kpis={INITIAL_KPIS} incidents={incidents} />

      {/* Posture and System Status Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <SecurityPosture incidents={incidents} />
        </div>
        <div className="lg:col-span-5">
          <SystemStatus services={INITIAL_SYSTEM_SERVICES} />
        </div>
      </div>

      {/* Active Threats Table (Section 4) */}
      <div>
        <ActiveThreatsTable incidents={incidents} title="Active Voice Impersonation Incidents" />
      </div>
    </div>
  );
}
