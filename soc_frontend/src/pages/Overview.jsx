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
  const [fraudIntel, setFraudIntel] = useState(null);
  const { incidents, acknowledge, escalate } = useIncidents();

  // Fetch real backend statistics
  useEffect(() => {
    const loadOverviewData = async () => {
      try {
        const [statsData, healthData, intelData] = await Promise.all([
          api.getStats(),
          api.getSystemHealth(),
          api.getFraudIntelligence(),
        ]);

        console.log('Real backend stats:', statsData);
        console.log('Real backend health:', healthData);
        console.log('Real fraud intelligence:', intelData);

        setStats(statsData);
        setHealth(healthData);
        setFraudIntel(intelData);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Security Operations Center Overview
          </h2>

          <p className="text-xs text-slate-500 mt-0.5 font-normal">
            Continuous caller authenticity monitoring, executive impersonation defense, and threat intervention
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span>Live Protection Feed</span>
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

      {/* Aggregated Fraud Intelligence Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>Multi-Tenant Fraud Intelligence & Impersonation Analytics</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Organization-isolated threat metrics across real-time voice sessions and credential exposure telemetry
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            Tenant: {fraudIntel?.organization_name || 'Active Organization'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] uppercase font-bold text-slate-400">Voice Impersonations</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {fraudIntel?.recent_voice_impersonations ?? incidents.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Targeted identity pretexts</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] uppercase font-bold text-slate-400">AI Clone Attempts</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {fraudIntel?.ai_clone_attempts ?? (stats?.calls?.clones_detected ?? 0)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Neural synthesis / TTS</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] uppercase font-bold text-slate-400">Replay Attempts</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {fraudIntel?.replay_attempts ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Acoustic loop detections</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
            <div className="text-[10px] uppercase font-bold text-slate-400">OTP Ingress Attempts</div>
            <div className="text-xl font-black text-slate-900 mt-1">
              {fraudIntel?.otp_related_attempts ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Authorization code probes</div>
          </div>

          <div className="p-3 bg-red-50/70 rounded-xl border border-red-200/80">
            <div className="text-[10px] uppercase font-bold text-red-700">Credential Exposures</div>
            <div className="text-xl font-black text-red-900 mt-1">
              {fraudIntel?.credential_exposure_events ?? 0}
            </div>
            <div className="text-[10px] text-red-600 mt-0.5">1930 / Golden-Hour alerts</div>
          </div>
        </div>

        {fraudIntel?.common_attack_patterns && fraudIntel.common_attack_patterns.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Identified Threat Vectors:
            </span>
            {fraudIntel.common_attack_patterns.map((pat, idx) => (
              <span
                key={idx}
                className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200"
              >
                {pat}
              </span>
            ))}
          </div>
        )}
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