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
  SAFE: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', border: 'border-emerald-300' },
  LOW: { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', border: 'border-blue-300' },
  MEDIUM: { bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', border: 'border-amber-300' },
  HIGH: { bg: 'bg-orange-50 text-orange-700 border-orange-200', text: 'text-orange-700', border: 'border-orange-300' },
  CRITICAL: { bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', border: 'border-rose-300' },
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
                <span className="text-slate-400 font-mono">{entry.timestamp}</span>
                <span className="text-sm font-bold text-slate-800 w-8 text-right">
                  {entry.score}
                </span>
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
          <span>Continuous risk scoring across voice acoustic and conversational NLP models</span>
          <span className="font-semibold text-slate-500">Peak: {Math.max(...entries.map((e) => e.score), currentScore)}/100</span>
        </div>
      )}
    </div>
  );
};

export default RiskTimeline;
