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
  Layers
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
      <div className="p-12 text-center text-xs font-mono text-slate-500">
        Compiling enterprise voice security telemetry analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Page Title */}
      <div className="pb-2 border-b border-soc-border">
        <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-soc-accent" />
          <span>Enterprise Voice Security Analytics</span>
        </h2>
        <p className="text-2xs text-slate-500 mt-0.5">
          Macro-telemetry trends, threat actor targeting profiles, and detection precision metrics
        </p>
      </div>

      {/* Top Security KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Calls Analyzed</span>
          <span className="text-xl font-bold text-slate-100 block mt-1">{data.totalCallsAnalyzed.toLocaleString()}</span>
          <span className="text-[10px] text-slate-500">30-day volume</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">High-Risk Ingress</span>
          <span className="text-xl font-bold text-orange-400 block mt-1">{data.highRiskCalls}</span>
          <span className="text-[10px] text-slate-500">Risk &ge; 70</span>
        </div>

        <div className="p-3 bg-soc-card border border-red-900/40 bg-red-950/10 rounded">
          <span className="text-2xs text-slate-500 uppercase block">Critical Incidents</span>
          <span className="text-xl font-bold text-red-400 block mt-1">{data.criticalIncidents}</span>
          <span className="text-[10px] text-red-400/80">Immediate triage</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">AI Clones Detected</span>
          <span className="text-xl font-bold text-soc-accent block mt-1">{data.aiVoiceDetections}</span>
          <span className="text-[10px] text-slate-500">Neural vocoder</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Identity Mismatches</span>
          <span className="text-xl font-bold text-amber-400 block mt-1">{data.identityMismatches}</span>
          <span className="text-[10px] text-slate-500">ECAPA-TDNN</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block">Confirmed Neutralized</span>
          <span className="text-xl font-bold text-emerald-400 block mt-1">{data.confirmedAttacks}</span>
          <span className="text-[10px] text-slate-500">{data.falsePositives} False Positives</span>
        </div>
      </div>

      {/* Latency & Response Performance Banner */}
      <div className="p-3 bg-slate-900/60 border border-slate-800 rounded flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-soc-accent shrink-0" />
          <div>
            <span className="font-semibold text-slate-200">SOC Operational Efficiency:</span>
            <span className="text-slate-400 ml-2">Mean Analyst Response Time: <strong className="text-emerald-400">{data.avgResponseTimeSec}s</strong></span>
            <span className="text-slate-500 mx-2">|</span>
            <span className="text-slate-400">Average Investigation Duration: <strong className="text-slate-200">{data.avgInvestigationTimeMin} min</strong></span>
          </div>
        </div>
        <span className="text-2xs text-slate-500 font-mono">SLA Compliance: 99.4%</span>
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
                    <div className="text-[9px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      {day.analyzed}
                    </div>
                    <div className="w-full bg-slate-800/80 hover:bg-slate-700 rounded-t relative flex flex-col justify-end overflow-hidden" style={{ height: `${heightPercent}%` }}>
                      {/* Critical slice */}
                      <div 
                        className="w-full bg-red-500" 
                        style={{ height: `${(day.critical / (day.analyzed || 1)) * 500}%`, minHeight: day.critical > 0 ? '6px' : '0' }}
                        title={`${day.day}: ${day.critical} Critical Incidents`}
                      />
                    </div>
                    <span className="text-2xs text-slate-400 font-semibold">{day.day}</span>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-soc-border flex items-center justify-between text-2xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-800" /> Total Inbound Calls
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-red-500" /> Critical Clone Threats
              </span>
            </div>
          </div>
        </Card>

        {/* Attack Vector Distribution */}
        <Card title="Voice Impersonation Vector Distribution">
          <div className="space-y-3">
            {data.attackTypeDistribution.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{item.type}</span>
                  <span className="text-slate-400 font-bold">{item.count} attacks ({item.percentage}%)</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-orange-500' : idx === 2 ? 'bg-amber-500' : 'bg-blue-500'}`} 
                    style={{ width: `${item.percentage}%` }} 
                  />
                </div>
              </div>
            ))}

            <div className="pt-3 border-t border-soc-border text-2xs text-slate-500">
              Primary Driver: Generative voice cloning of C-suite executives targeting unscheduled wire transfers.
            </div>
          </div>
        </Card>

        {/* Department Exposure Analysis */}
        <Card title="Department Risk Exposure Index">
          <div className="space-y-3">
            {data.departmentRisk.map((dep, idx) => (
              <div key={idx} className="p-2.5 rounded bg-slate-900/40 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">{dep.department}</div>
                  <div className="text-2xs text-slate-500">{dep.incidentCount} targeted incidents (30d)</div>
                </div>

                <div className="text-right">
                  <span className={`text-xs font-bold ${dep.riskScore >= 75 ? 'text-red-400' : dep.riskScore >= 60 ? 'text-orange-400' : 'text-amber-400'}`}>
                    Risk Index: {dep.riskScore}
                  </span>
                  <div className="w-20 bg-slate-800 h-1 rounded mt-1 overflow-hidden ml-auto">
                    <div 
                      className={`h-full ${dep.riskScore >= 75 ? 'bg-red-500' : 'bg-orange-500'}`} 
                      style={{ width: `${dep.riskScore}%` }} 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Incident Outcome Precision */}
        <Card title="Incident Outcome Precision & Triage Quality">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-emerald-950/20 border border-emerald-800/60 rounded">
                <span className="text-2xs text-slate-400 block uppercase">Confirmed Malicious</span>
                <span className="text-2xl font-bold text-emerald-400 mt-1 block">61.1%</span>
                <span className="text-2xs text-slate-500 block mt-1">11 Confirmed Attacks</span>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded">
                <span className="text-2xs text-slate-400 block uppercase">False Positive Rate</span>
                <span className="text-2xl font-bold text-slate-300 mt-1 block">38.9%</span>
                <span className="text-2xs text-slate-500 block mt-1">7 Resolved as noisy channel</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded text-2xs text-slate-400 space-y-1">
              <div className="font-semibold text-slate-300">Model Precision Tuning:</div>
              <div>• SpeechBrain ECAPA-TDNN Threshold: <strong>0.70</strong> cosine similarity</div>
              <div>• Deepfake CNN v2 Critical Synthetic Trigger: <strong>0.60</strong> probability</div>
              <div>• Zero false negatives recorded across all Tier-1 executives.</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
