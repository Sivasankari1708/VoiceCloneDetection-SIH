import React from 'react';
import { Clock } from 'lucide-react';
import type { SeverityLevel } from '../../types';

export interface RiskTimelineEntry {
  timestamp: string; // e.g. "12:31:02"
  score: number;     // e.g. 18
  level: SeverityLevel; // e.g. "LOW"
  note?: string;
}

interface RiskTimelineProps {
  currentSeverity: SeverityLevel;
  currentScore: number;
  history?: RiskTimelineEntry[];
  compact?: boolean;
}

const BADGE_CONFIG: Record<SeverityLevel, { bg: string; text: string; border: string }> = {
  SAFE: { bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700', border: 'border-slate-300' },
  LOW: { bg: 'bg-blue-50 text-blue-800 border-blue-200', text: 'text-blue-800', border: 'border-blue-300' },
  CAUTION: { bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800', border: 'border-amber-300' },
  MEDIUM: { bg: 'bg-amber-50 text-amber-800 border-amber-200', text: 'text-amber-800', border: 'border-amber-300' },
  HIGH: { bg: 'bg-blue-900 text-white border-blue-800', text: 'text-blue-950', border: 'border-blue-800' },
  CRITICAL: { bg: 'bg-red-50 text-red-900 border-red-200', text: 'text-red-900', border: 'border-red-300' },
};

export const RiskTimeline: React.FC<RiskTimelineProps> = ({
  currentSeverity,
  currentScore,
  history,
  compact = false,
}) => {
  // If no history passed, provide default timestamped entry based on current call
  const entries: RiskTimelineEntry[] =
    history && history.length > 0
      ? history
      : [
          {
            timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            score: currentScore,
            level: currentSeverity,
            note: 'Initial analysis',
          },
        ];

  return (
    <div className="space-y-3" aria-label="Risk Timeline">
      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider pb-1 border-b border-slate-100">
        <span className="flex items-center gap-1.5">
          <Clock size={13} className="text-slate-400" />
          Time & Score Progression
        </span>
        <span>Risk Level</span>
      </div>

      <div className="divide-y divide-slate-100 font-mono text-xs">
        {entries.map((entry, idx) => {
          const isLatest = idx === entries.length - 1;
          const badge = BADGE_CONFIG[entry.level] || BADGE_CONFIG.SAFE;

          return (
            <div
              key={`${entry.timestamp}-${idx}`}
              className={`flex items-center justify-between py-2 px-1 transition-colors ${
                isLatest ? 'bg-slate-50 font-semibold' : 'text-slate-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-400 font-mono w-16">{entry.timestamp}</span>
                <div className="w-16 bg-slate-200 rounded-full h-1.5 hidden sm:block overflow-hidden">
                  <div
                    className={`h-full ${
                      entry.level === 'CRITICAL'
                        ? 'bg-rose-500'
                        : entry.level === 'HIGH'
                        ? 'bg-orange-500'
                        : entry.level === 'MEDIUM'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(5, entry.score)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge.bg} ${badge.border}`}
                >
                  {entry.level}
                </span>
                {isLatest && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" title="Active" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Continuous voice and conversation analysis</span>
          <span className="font-semibold text-slate-500">Continuous Protection Active</span>
        </div>
      )}
    </div>
  );
};

export default RiskTimeline;
