// src/components/dashboard/SecurityPosture.jsx
import React from 'react';
import { Card } from '../common/Card';
import { Shield, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function SecurityPosture({ incidents }) {
  const total = incidents.length || 1;
  const criticalCount = incidents.filter(i => i.severity === 'CRITICAL').length;
  const highCount = incidents.filter(i => i.severity === 'HIGH').length;
  const mediumCount = incidents.filter(i => i.severity === 'MEDIUM').length;
  const lowCount = incidents.filter(i => i.severity === 'LOW').length;

  const distribution = [
    { label: 'CRITICAL', count: criticalCount, percentage: Math.round((criticalCount / total) * 100), color: 'bg-red-500', text: 'text-red-400' },
    { label: 'HIGH', count: highCount, percentage: Math.round((highCount / total) * 100), color: 'bg-orange-500', text: 'text-orange-400' },
    { label: 'MEDIUM', count: mediumCount, percentage: Math.round((mediumCount / total) * 100), color: 'bg-amber-500', text: 'text-amber-400' },
    { label: 'LOW', count: lowCount, percentage: Math.round((lowCount / total) * 100), color: 'bg-blue-500', text: 'text-blue-400' },
  ];

  return (
    <Card 
      title="Security Posture & Severity Distribution"
      action={
        <Link to="/analytics" className="text-2xs font-mono text-soc-accent hover:underline flex items-center gap-1">
          Full Analytics <ArrowUpRight className="w-3 h-3" />
        </Link>
      }
    >
      <div className="space-y-3.5">
        {/* Progress Bar Distribution */}
        <div className="h-2 w-full bg-slate-900 rounded-full flex overflow-hidden border border-slate-800">
          {distribution.map((item, idx) => (
            <div
              key={idx}
              style={{ width: `${Math.max(item.percentage, 4)}%` }}
              className={`${item.color} h-full transition-all duration-300`}
              title={`${item.label}: ${item.count} (${item.percentage}%)`}
            />
          ))}
        </div>

        {/* Breakdown Items */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {distribution.map((item, idx) => (
            <div key={idx} className="p-2.5 rounded bg-slate-900/60 border border-slate-800/80">
              <div className="flex items-center justify-between font-mono text-2xs">
                <span className="text-slate-400 font-medium">{item.label}</span>
                <span className={`${item.text} font-bold`}>{item.percentage}%</span>
              </div>
              <div className="mt-1 font-mono text-lg font-bold text-slate-100">
                {item.count}
              </div>
            </div>
          ))}
        </div>

        <div className="text-2xs font-mono text-slate-500 border-t border-soc-border pt-2 flex items-center justify-between">
          <span>Overall Threat Level: <strong className="text-red-400">ELEVATED (Voice Cloning Active)</strong></span>
          <span>Targeting: <span className="text-slate-300">Finance & Executive</span></span>
        </div>
      </div>
    </Card>
  );
}
