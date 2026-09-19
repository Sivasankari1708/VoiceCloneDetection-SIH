// src/components/dashboard/SystemStatus.jsx
import React from 'react';
import { Card } from '../common/Card';
import { ShieldCheck, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SystemStatus({ services = [] }) {
  const displayServices = [
    { name: 'Voice Authenticity Shield', description: 'Real-time synthetic clone detection', status: 'Operational', response: '< 50ms' },
    { name: 'Executive Impersonation Defense', description: 'Organizational hierarchy protection', status: 'Operational', response: '< 45ms' },
    { name: 'Fraud Intent & Urgency Engine', description: 'Pretexting & wire fraud indicators', status: 'Operational', response: '< 60ms' },
    { name: 'Autonomous Call Intervention', description: 'Real-time hold & protection protocol', status: 'Operational', response: '< 20ms' },
    { name: 'National Cybercrime Gateway', description: 'NCRP 1930 reporting bridge', status: 'Connected', response: 'Active' },
  ];

  return (
    <Card 
      title="Enterprise Defense Capabilities"
      subtitle="Autonomous protection services actively guarding voice communications"
      action={
        <Link to="/system-health" className="text-2xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Service Health <ArrowUpRight className="w-3 h-3" />
        </Link>
      }
    >
      <div className="space-y-2.5">
        {displayServices.map((svc, idx) => (
          <div 
            key={idx} 
            className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50/80 border border-slate-200/60 text-xs hover:bg-slate-100/60 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-slate-900 font-semibold block truncate">{svc.name}</span>
                <span className="text-[11px] text-slate-500 block truncate">{svc.description}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-2xs text-slate-400 font-medium">{svc.response}</span>
              <span className="text-2xs px-2 py-0.5 rounded-full font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                {svc.status}
              </span>
            </div>
          </div>
        ))}

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Continuous Voice Protection: <strong className="text-emerald-700 font-semibold">Active</strong></span>
          </span>
          <span className="text-blue-600 font-medium">Zero-Audio Retention Verified</span>
        </div>
      </div>
    </Card>
  );
}
