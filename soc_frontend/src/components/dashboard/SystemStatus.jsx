// src/components/dashboard/SystemStatus.jsx
import React from 'react';
import { Card } from '../common/Card';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SystemStatus({ services = [] }) {
  const displayServices = services.length > 0 ? services : [
    { name: 'Voice Detection', subtext: 'Deepfake CNN v2', status: 'OPERATIONAL', latency: '38 ms' },
    { name: 'Speaker Verification', subtext: 'ECAPA-TDNN (192-D)', status: 'OPERATIONAL', latency: '42 ms' },
    { name: 'ASR Engine', subtext: 'faster-whisper', status: 'OPERATIONAL', latency: '65 ms' },
    { name: 'Risk Decision Engine', subtext: 'Security Matrix', status: 'OPERATIONAL', latency: '12 ms' },
    { name: 'Database Engine', subtext: 'Platform DB', status: 'OPERATIONAL', latency: '16 ms' },
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
        {displayServices.map((svc, idx) => {
          const isUp = svc.status === 'OPERATIONAL' || svc.status === 'Operational' || svc.status === 'healthy';
          return (
            <div 
              key={idx} 
              className="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-900/40 border border-slate-800/60 font-mono text-xs"
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-slate-200 font-medium">{svc.name}</span>
                {svc.subtext && <span className="text-2xs text-slate-500 hidden sm:inline">({svc.subtext})</span>}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-2xs text-slate-500">{svc.latency || '25 ms'}</span>
                <span className={`text-2xs px-2 py-0.5 rounded border font-semibold uppercase ${
                  isUp 
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60' 
                    : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                }`}>
                  {svc.status}
                </span>
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t border-soc-border flex items-center justify-between text-2xs font-mono text-slate-500">
          <span>Telemetry Ingress: <strong className="text-emerald-400">ACTIVE</strong></span>
          <span>Zero Audio Payload Retention: <strong className="text-soc-accent">ENFORCED</strong></span>
        </div>
      </div>
    </Card>
  );
}
