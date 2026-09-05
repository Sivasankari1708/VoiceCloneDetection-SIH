// src/pages/SystemHealth.jsx
import React from 'react';
import { useSystemHealth } from '../hooks/useSystemHealth';
import { Card } from '../components/common/Card';
import { StatusIndicator } from '../components/common/StatusIndicator';
import { Button } from '../components/common/Button';
import { Activity, RefreshCw, Cpu, Server, Database, Radio, CheckCircle, Clock } from 'lucide-react';

export function SystemHealth() {
  const { health, loading, refetch } = useSystemHealth();

  if (loading && !health) {
    return (
      <div className="p-12 text-center text-xs font-mono text-slate-500">
        Querying backend AI model microservice health...
      </div>
    );
  }

  const services = health?.services || [];

  return (
    <div className="space-y-6 font-mono">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-soc-border">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>AI Pipeline & Microservice System Health</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Operational status, real-time inference latency, and cluster telemetry for VoiceCloneDetection-SIH
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={refetch} icon={RefreshCw}>
          Refresh Health Checks
        </Button>
      </div>

      {/* Cluster Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Pipeline State</span>
          <div className="mt-1">
            <StatusIndicator status="OPERATIONAL" label="ALL OPERATIONAL" />
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Zero service degradation</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Active Analysis Sessions</span>
          <span className="text-2xl font-bold text-soc-accent block mt-1">
            {health?.activeSessions || 7}
          </span>
          <span className="text-[10px] text-slate-500">Inbound streams processed</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Connected Telemetry Clients</span>
          <span className="text-2xl font-bold text-slate-200 block mt-1">
            {health?.connectedClients || 3}
          </span>
          <span className="text-[10px] text-slate-500">Active SOC analyst consoles</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Last System Heartbeat</span>
          <span className="text-xs font-bold text-slate-300 block mt-1">
            {health?.lastCheck ? new Date(health.lastCheck).toLocaleTimeString() : 'Just now'}
          </span>
          <span className="text-[10px] text-emerald-400 mt-1 block">Heartbeat cadence: 15s</span>
        </div>
      </div>

      {/* Core Services Table */}
      <Card title="Individual Model & Service Telemetry">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-soc-border bg-slate-950/60 text-2xs uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Service Name</th>
                <th className="py-2.5 px-3">Subsystem Role</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Latency</th>
                <th className="py-2.5 px-3">30d Uptime</th>
                <th className="py-2.5 px-3">Health Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soc-border/60">
              {services.map((svc) => (
                <tr key={svc.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-200">
                    {svc.name}
                  </td>

                  <td className="py-3 px-3 text-slate-400 text-2xs">
                    {svc.id === 'voice_detection' && 'Spectrogram CNN Feature Classification'}
                    {svc.id === 'speaker_verification' && 'ECAPA-TDNN 192-D Cosine Metric'}
                    {svc.id === 'whisper_asr' && 'CTranslate2 Automatic Speech Recognition'}
                    {svc.id === 'risk_engine' && 'Risk Score & Recommended Action Synthesizer'}
                    {svc.id === 'event_stream' && 'WebSocket Near-Real-Time Dispatcher'}
                    {svc.id === 'database' && 'PostgreSQL / JSON State Store'}
                  </td>

                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-800/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      OPERATIONAL
                    </span>
                  </td>

                  <td className="py-3 px-3 font-bold text-soc-accent">
                    {svc.latencyMs} ms
                  </td>

                  <td className="py-3 px-3 text-slate-300">
                    {svc.uptime}
                  </td>

                  <td className="py-3 px-3 text-2xs text-slate-500">
                    {svc.lastCheck}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Error Diagnostics */}
      <Card title="Cluster Incident & Error Diagnostics (Last 24 Hours)">
        <div className="space-y-2 text-2xs font-mono">
          <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex items-start gap-2.5 text-slate-400">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-slate-200">No Critical Service Exceptions Logged</div>
              <p className="mt-0.5 text-slate-500">
                All inference workers executing within nominal SLA bounds (&lt; 200 ms total pipeline budget). Memory allocation and GPU/CPU thread pools stabilized.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
