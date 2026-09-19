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
    { label: 'CRITICAL', count: criticalCount, percentage: Math.round((criticalCount / total) * 100), color: 'bg-red-600', text: 'text-red-700' },
    { label: 'HIGH', count: highCount, percentage: Math.round((highCount / total) * 100), color: 'bg-orange-500', text: 'text-orange-700' },
    { label: 'MEDIUM', count: mediumCount, percentage: Math.round((mediumCount / total) * 100), color: 'bg-amber-500', text: 'text-amber-700' },
    { label: 'LOW', count: lowCount, percentage: Math.round((lowCount / total) * 100), color: 'bg-blue-600', text: 'text-blue-700' },
  ];

  return (
    <Card 
      title="Security Posture & Severity Distribution"
      subtitle="Organizational voice communication risk classification"
      action={
        <Link to="/analytics" className="text-2xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Analytics Overview <ArrowUpRight className="w-3 h-3" />
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Progress Bar Distribution */}
        <div className="h-2.5 w-full bg-slate-100 rounded-full flex overflow-hidden border border-slate-200/80">
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
            <div key={idx} className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70">
              <div className="flex items-center justify-between text-2xs">
                <span className="text-slate-500 font-bold uppercase">{item.label}</span>
                <span className={`${item.text} font-bold`}>{item.percentage}%</span>
              </div>
              <div className="mt-1 text-xl font-black text-slate-900">
                {item.count}
              </div>
            </div>
          ))}
        </div>

        <div className="text-2xs text-slate-500 border-t border-slate-100 pt-3 flex items-center justify-between">
          <span>Overall Threat Level: <strong className="text-slate-800 font-semibold">Continuous Defense Active</strong></span>
          <span>Target Protection: <span className="text-blue-600 font-medium">Finance & Executive Desk</span></span>
        </div>
      </div>
    </Card>
  );
}
