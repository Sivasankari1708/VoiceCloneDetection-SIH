import React from 'react';
import { ShieldCheck, AlertCircle, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';
import type { ProgressiveRiskInfo, ProgressiveRiskLevel } from '../../types/protection';

interface ProgressiveRiskCardProps {
  risk: ProgressiveRiskInfo;
  onSelectLevel?: (level: ProgressiveRiskLevel) => void;
  interactive?: boolean;
}

const LEVEL_STYLES: Record<
  ProgressiveRiskLevel,
  {
    border: string;
    bg: string;
    badgeBg: string;
    badgeText: string;
    accent: string;
    icon: React.ReactNode;
  }
> = {
  Safe: {
    border: 'border-emerald-200/80',
    bg: 'bg-emerald-50/40',
    badgeBg: 'bg-emerald-100/90 text-emerald-800 border-emerald-300',
    badgeText: 'text-emerald-800',
    accent: 'text-emerald-700',
    icon: <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0" />,
  },
  Low: {
    border: 'border-blue-200/80',
    bg: 'bg-blue-50/40',
    badgeBg: 'bg-blue-100/90 text-blue-800 border-blue-300',
    badgeText: 'text-blue-800',
    accent: 'text-blue-700',
    icon: <Activity size={20} className="text-blue-600 flex-shrink-0" />,
  },
  Caution: {
    border: 'border-amber-200/90',
    bg: 'bg-amber-50/40',
    badgeBg: 'bg-amber-100/90 text-amber-900 border-amber-300',
    badgeText: 'text-amber-900',
    accent: 'text-amber-800',
    icon: <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />,
  },
  High: {
    border: 'border-orange-300',
    bg: 'bg-orange-50/40',
    badgeBg: 'bg-orange-100 text-orange-900 border-orange-300',
    badgeText: 'text-orange-900',
    accent: 'text-orange-800',
    icon: <AlertTriangle size={20} className="text-orange-600 flex-shrink-0" />,
  },
  Critical: {
    // Restrained translucent red treatment per Requirements #1, #5
    border: 'border-red-300/80',
    bg: 'card-critical-intervention',
    badgeBg: 'bg-red-100/90 text-red-900 border-red-300',
    badgeText: 'text-red-900 font-bold',
    accent: 'text-red-800',
    icon: <ShieldAlert size={20} className="text-red-600 flex-shrink-0" />,
  },
};

const ALL_LEVELS: ProgressiveRiskLevel[] = ['Safe', 'Low', 'Caution', 'High', 'Critical'];

export default function ProgressiveRiskCard({ risk, onSelectLevel, interactive = false }: ProgressiveRiskCardProps) {
  const currentStyle = LEVEL_STYLES[risk.level] || LEVEL_STYLES.Safe;

  return (
    <div className={`card-enterprise p-5 transition-all duration-200 ${currentStyle.bg} ${currentStyle.border}`}>
      {/* Top status bar */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
        <div className="flex items-center gap-2.5">
          {currentStyle.icon}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Real-Time Security Assessment
            </div>
            <div className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{risk.headline}</span>
            </div>
          </div>
        </div>

        {/* State Badge */}
        <div
          className={`px-3 py-1 rounded-full text-xs font-semibold border shadow-2xs inline-flex items-center gap-1.5 ${currentStyle.badgeBg}`}
        >
          <span className="w-2 h-2 rounded-full bg-current opacity-80" />
          <span>{risk.level}</span>
        </div>
      </div>

      {/* Structured Communication: What was detected, Why it matters, What to do */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
        {/* What was detected */}
        <div className="bg-white/80 rounded-xl p-3 border border-slate-200/60 shadow-2xs">
          <div className="text-slate-400 font-medium uppercase tracking-wider text-[10px] mb-1">
            What was detected
          </div>
          <div className="text-slate-800 font-medium leading-relaxed">
            {risk.detected}
          </div>
        </div>

        {/* Why it matters */}
        <div className="bg-white/80 rounded-xl p-3 border border-slate-200/60 shadow-2xs">
          <div className="text-slate-400 font-medium uppercase tracking-wider text-[10px] mb-1">
            Why it matters
          </div>
          <div className="text-slate-700 leading-relaxed">
            {risk.whyItMatters}
          </div>
        </div>

        {/* Recommended employee action */}
        <div
          className={`rounded-xl p-3 border shadow-2xs ${
            risk.level === 'Critical'
              ? 'bg-red-50/90 border-red-200 text-red-900'
              : risk.level === 'High'
              ? 'bg-orange-50/90 border-orange-200 text-orange-900'
              : 'bg-blue-50/90 border-blue-200 text-blue-900'
          }`}
        >
          <div className="font-semibold uppercase tracking-wider text-[10px] opacity-75 mb-1">
            Recommended Action
          </div>
          <div className="font-bold text-sm leading-snug">
            {risk.recommendedAction}
          </div>
        </div>
      </div>

      {/* Optional Interactive State Selector (for manual testing/demonstration) */}
      {interactive && onSelectLevel && (
        <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 font-medium">Test Progressive State:</span>
          <div className="flex gap-1.5 flex-wrap">
            {ALL_LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => onSelectLevel(lvl)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  risk.level === lvl
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
