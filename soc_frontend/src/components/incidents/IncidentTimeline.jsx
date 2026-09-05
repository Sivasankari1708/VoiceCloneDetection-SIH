// src/components/incidents/IncidentTimeline.jsx
import React from 'react';
import { Card } from '../common/Card';
import { SeverityTag } from '../common/SeverityTag';
import { Clock, ShieldAlert } from 'lucide-react';

export function IncidentTimeline({ timeline }) {
  if (!timeline || timeline.length === 0) return null;

  return (
    <Card title="Incident Chronological Audit Timeline">
      <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-slate-800 font-mono text-xs">
        {timeline.map((item, idx) => {
          let dotColor = 'bg-slate-600';
          if (item.severity === 'CRITICAL') dotColor = 'bg-red-500 shadow-sm shadow-red-500/50';
          else if (item.severity === 'HIGH') dotColor = 'bg-orange-500';
          else if (item.severity === 'MEDIUM') dotColor = 'bg-amber-500';
          else if (item.severity === 'LOW') dotColor = 'bg-blue-500';

          return (
            <div key={item.id || idx} className="relative group">
              {/* Timeline marker */}
              <span className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ${dotColor} ring-4 ring-soc-card`} />

              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                <span className="text-2xs text-slate-400 font-semibold">{item.time}</span>
                {item.severity && <SeverityTag severity={item.severity} size="xs" showDot={false} />}
              </div>

              <div className="mt-1 text-slate-200 text-xs leading-relaxed">
                {item.event}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
