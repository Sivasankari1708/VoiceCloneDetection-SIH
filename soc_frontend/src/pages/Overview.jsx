// src/pages/Overview.jsx
import React, { useMemo, useEffect, useState } from 'react';
import { KPICards } from '../components/dashboard/KPICards';
import { SecurityPosture } from '../components/dashboard/SecurityPosture';
import { SystemStatus } from '../components/dashboard/SystemStatus';
import { ActiveThreatsTable } from '../components/dashboard/ActiveThreatsTable';
import { CriticalAlertBanner } from '../components/alerts/CriticalAlertBanner';
import { useIncidents } from '../hooks/useIncidents';
import { Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);
  const { incidents, acknowledge, escalate } = useIncidents();

  // Fetch real backend statistics
  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const [statsData, healthData] = await Promise.all([
          api.getStats(),
          api.getSystemHealth(),
        ]);

        console.log('Real backend stats:', statsData);
        console.log('Real backend health:', healthData);

        setStats(statsData);
        setHealth(healthData);
      } catch (err) {
        console.error('Failed to load overview data:', err);
        setError(err.message);
        setHealthError(err.message);
      } finally {
        setLoading(false);
        setHealthLoading(false);
      }
    };

    loadOverviewData();
  }, []);
  // Provide real database statistics to KPICards
  const kpis = useMemo(() => {
    return {
      underAnalysis: stats?.calls?.active ?? 0,
      incidentsToday: stats?.incidents?.total ?? incidents.length,
      protectedIdentities: stats?.protected_identities ?? 0,
      totalCalls: stats?.calls?.total ?? 0,
      clonesDetected: stats?.calls?.clones_detected ?? 0,
      openInvestigations: stats?.incidents?.open ?? 0,
      confirmedAttacks: stats?.incidents?.confirmed_attacks ?? 0,
    };
  }, [stats, incidents]);

  // Find most severe active critical incident for banner
  const activeCriticalIncident = useMemo(() => {
    return incidents.find(
      (inc) =>
        inc.severity === 'CRITICAL' &&
        inc.status !== 'RESOLVED' &&
        inc.status !== 'FALSE_POSITIVE'
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

      {/* Critical Security Alert */}
      {activeCriticalIncident && (
        <CriticalAlertBanner
          incident={activeCriticalIncident}
          onAcknowledge={acknowledge}
          onEscalate={escalate}
        />
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="text-slate-400 font-mono text-sm">
          Loading security telemetry...
        </div>
      ) : error ? (
        <div className="text-red-400 font-mono text-sm">
          Failed to load security telemetry: {error}
        </div>
      ) : (
        <KPICards kpis={kpis} incidents={incidents} />
      )}

      {/* Posture and System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <SecurityPosture incidents={incidents} />
        </div>

        <div className="lg:col-span-5">
          {healthLoading ? (
            <div className="text-slate-400 font-mono text-sm">
              Loading system health...
            </div>
          ) : healthError ? (
            <div className="text-red-400 font-mono text-sm">
              Failed to load system health: {healthError}
            </div>
          ) : (
            <SystemStatus services={health?.services ?? []} />
          )}
        </div>
      </div>

      {/* Active Threats */}
      <div>
        <ActiveThreatsTable
          incidents={incidents}
          title="Active Voice Impersonation Incidents"
        />
      </div>
    </div>
  );
}