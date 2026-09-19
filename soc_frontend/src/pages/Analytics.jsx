// src/pages/Analytics.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import {
  BarChart3,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Clock,
  Activity,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const analyticsData = await api.getAnalytics();
      setData(analyticsData);
      setLoading(false);
    }
    load();
  }, []);

  if (loading || !data) {
    return (
      <div className="p-16 text-center text-xs font-sans text-slate-500">
        Compiling enterprise voice security telemetry analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Page Title */}
      <div className="pb-3 border-b border-slate-200/90">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <span>Enterprise Voice Security Analytics</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Macro-telemetry trends, threat actor targeting profiles, and defense operational efficiency
        </p>
      </div>

      {/* Top Security KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-xs">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Calls Analyzed</span>
          <span className="text-2xl font-bold text-slate-900 block mt-1">{data.totalCallsAnalyzed.toLocaleString()}</span>
          <span className="text-xs text-slate-500 mt-0.5 block">30-day volume</span>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-xs">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">High-Risk Ingress</span>
          <span className="text-2xl font-bold text-amber-700 block mt-1">{data.highRiskCalls}</span>
          <span className="text-xs text-slate-500 mt-0.5 block">Elevated risk score</span>
        </div>

        <div className={`p-4 rounded-xl border shadow-xs transition-colors ${
          data.criticalIncidents > 0
            ? 'bg-red-50/90 border-red-200 text-red-900'
            : 'bg-white border-slate-200/90 text-slate-900'
        }`}>
          <span className={`text-2xs font-semibold uppercase tracking-wider block ${
            data.criticalIncidents > 0 ? 'text-red-700' : 'text-slate-500'
          }`}>
            Critical Incidents
          </span>
          <span className={`text-2xl font-bold block mt-1 ${
            data.criticalIncidents > 0 ? 'text-red-700' : 'text-slate-900'
          }`}>
            {data.criticalIncidents}
          </span>
          <span className={`text-xs mt-0.5 block ${
            data.criticalIncidents > 0 ? 'text-red-600 font-medium' : 'text-slate-500'
          }`}>
            Active triage queue
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-xs">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Synthetic Ingress</span>
          <span className="text-2xl font-bold text-blue-600 block mt-1">{data.aiVoiceDetections}</span>
          <span className="text-xs text-slate-500 mt-0.5 block">Clones detected</span>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-xs">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Identity Mismatches</span>
          <span className="text-2xl font-bold text-slate-900 block mt-1">{data.identityMismatches}</span>
          <span className="text-xs text-slate-500 mt-0.5 block">Biometric discrepancy</span>
        </div>

        <div className="p-4 bg-white border border-slate-200/90 rounded-xl shadow-xs">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">Attacks Neutralized</span>
          <span className="text-2xl font-bold text-emerald-700 block mt-1">{data.confirmedAttacks}</span>
          <span className="text-xs text-slate-500 mt-0.5 block">{data.falsePositives} False Positives</span>
        </div>
      </div>

      {/* Operational Efficiency Banner */}
      <div className="p-3.5 bg-blue-50/60 border border-blue-200/70 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-700 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-slate-900">SOC Operational Efficiency:</span>
            <span className="text-slate-600 ml-2">Mean Analyst Response Time: <strong className="text-emerald-700 font-semibold">{data.avgResponseTimeSec}s</strong></span>
            <span className="text-slate-300 mx-2">|</span>
            <span className="text-slate-600">Average Investigation Duration: <strong className="text-slate-900 font-semibold">{data.avgInvestigationTimeMin} min</strong></span>
          </div>
        </div>
        <span className="text-xs font-semibold text-blue-900 bg-white/80 px-2.5 py-1 rounded-md border border-blue-200/60 shadow-xs">
          SLA Compliance: 99.4%
        </span>
      </div>

      {/* Main Analytical Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Over Week */}
        <Card title="7-Day Analyzed Ingress & Threat Volume">
          <div className="space-y-4">
            <div className="h-44 flex items-end justify-between gap-2 pt-6 px-2">
              {data.trendOverWeek.map((day, idx) => {
                const maxAnalyzed = 900;
                const heightPercent = Math.round((day.analyzed / maxAnalyzed) * 100);
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                      {day.analyzed}
                    </div>
                    <div className="w-full bg-slate-100 hover:bg-slate-200 rounded-t-lg relative flex flex-col justify-end overflow-hidden transition-colors border-t border-x border-slate-200/70" style={{ height: `${heightPercent}%` }}>
                      {/* Critical slice */}
                      <div 
                        className="w-full bg-red-500 rounded-t" 
                        style={{ height: `${(day.critical / (day.analyzed || 1)) * 500}%`, minHeight: day.critical > 0 ? '6px' : '0' }}
                        title={`${day.day}: ${day.critical} Critical Incidents`}
                      />
                    </div>
                    <span className="text-xs text-slate-600 font-medium">{day.day}</span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200/90 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-300" /> Total Inbound Calls
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-500" /> Critical Clone Threats
              </span>
            </div>
          </div>
        </Card>

        {/* Attack Vector Distribution */}
        <Card title="Voice Impersonation Vector Distribution">
          <div className="space-y-3.5">
            {data.attackTypeDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-800 font-medium">{item.type}</span>
                  <span className="text-slate-600 font-semibold">{item.count} attacks ({item.percentage}%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                  <div 
                    className={`h-full rounded-full ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-amber-500' : idx === 2 ? 'bg-blue-500' : 'bg-slate-400'}`} 
                    style={{ width: `${item.percentage}%` }} 
                  />
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-slate-200/90 text-xs text-slate-500">
              Primary Threat Driver: Executive impersonation targeting unscheduled wire transfers and multi-factor authorization bypass.
            </div>
          </div>
        </Card>

        {/* Department Exposure Analysis */}
        <Card title="Department Risk Exposure Index">
          <div className="space-y-3">
            {data.departmentRisk.map((dep, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-900">{dep.department}</div>
                  <div className="text-2xs text-slate-500 mt-0.5">{dep.incidentCount} targeted incidents (30-day window)</div>
                </div>

                <div className="text-right">
                  <span className={`text-xs font-bold ${dep.riskScore >= 75 ? 'text-red-700' : dep.riskScore >= 60 ? 'text-amber-700' : 'text-slate-700'}`}>
                    Risk Index: {dep.riskScore}
                  </span>
                  <div className="w-24 bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden ml-auto">
                    <div 
                      className={`h-full rounded-full ${dep.riskScore >= 75 ? 'bg-red-500' : 'bg-amber-500'}`} 
                      style={{ width: `${dep.riskScore}%` }} 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Incident Outcome Precision */}
        <Card title="Defense Resolution Precision">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-xl">
                <span className="text-2xs font-semibold text-emerald-800 block uppercase tracking-wider">Confirmed Malicious</span>
                <span className="text-2xl font-bold text-emerald-800 mt-1 block">61.1%</span>
                <span className="text-xs text-emerald-700 block mt-0.5">11 Neutralized Threats</span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <span className="text-2xs font-semibold text-slate-600 block uppercase tracking-wider">False Positive Rate</span>
                <span className="text-2xl font-bold text-slate-900 mt-1 block">38.9%</span>
                <span className="text-xs text-slate-500 block mt-0.5">7 Resolved as noisy audio</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs text-slate-700 space-y-1.5">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Operational Security Performance:
              </div>
              <div className="text-slate-600">• Biometric voice verification calibrated for high-precision enterprise zero-trust.</div>
              <div className="text-slate-600">• Zero false negatives recorded across all Tier-1 executive accounts.</div>
              <div className="text-slate-600">• Immediate golden-hour response pathway available for all financial pretexts.</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
