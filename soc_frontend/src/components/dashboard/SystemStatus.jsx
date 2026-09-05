// src/components/dashboard/SystemStatus.jsx
import React from 'react';
import { Card } from '../common/Card';
import { StatusIndicator } from '../common/StatusIndicator';
import { Activity, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SystemStatus({ services }) {
  const defaultServices = [
    { name: 'Voice Detection', subtext: 'Deepfake CNN v2', status: 'Operational', latency: '38 ms' },
    { name: 'Speaker Verification', subtext: 'ECAPA-TDNN (192-D)', status: 'Operational', latency: '42 ms' },
    { name: 'ASR Engine', subtext: 'faster-whisper', status: 'Operational', latency: '65 ms' },
    { name: 'Risk Engine', subtext: 'Decision Matrix', status: 'Operational', latency: '12 ms' },
    { name: 'Event Stream', subtext: 'WebSocket Telemetry', status: 'Operational', latency: '5 ms' },
    { name: 'Database', subtext: 'Security Data Lake', status: 'Operational', latency: '16 ms' },
  ];

  return (
    <Card 
      title="System Telemetry & Model Pipeline"
      action={
        <Link to="/system-health" className="text-2xs font-mono text-soc-accent hover:underline flex items-center gap-1">
          Detailed Health <ArrowUpRight className="w-3 h-3" />
        </Link>
      }
    >
      <div className="space-y-2.5">
        {defaultServices.map((svc, idx) => (
          <div 
            key={idx} 
            className="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-900/40 border border-slate-800/60 font-mono text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-200 font-medium">{svc.name}</span>
              <span className="text-2xs text-slate-500 hidden sm:inline">({svc.subtext})</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-2xs text-slate-500">{svc.latency}</span>
              <span className="text-2xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 font-semibold uppercase">
                {svc.status}
              </span>
            </div>
          </div>
        ))}

        <div className="pt-2 border-t border-soc-border flex items-center justify-between text-2xs font-mono text-slate-500">
          <span>Telemetry Ingress: <strong className="text-emerald-400">NORMAL</strong></span>
          <span>Zero Audio Buffer Retention: <strong className="text-soc-accent">ENFORCED</strong></span>
        </div>
      </div>
    </Card>
  );
}
