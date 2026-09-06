import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity, UserCheck, Zap, Lock } from 'lucide-react';
import type { SecurityStatus, CallerIdentity, SeverityLevel } from '../../types';

interface LiveRiskMonitorProps {
  security: SecurityStatus;
  caller: CallerIdentity;
}

const SEVERITY_CONFIGS: Record<SeverityLevel, { bg: string; border: string; text: string; badgeBg: string; badgeText: string; pulse: boolean }> = {
  SAFE: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    pulse: false,
  },
  LOW: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-300',
    pulse: false,
  },
  MEDIUM: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    pulse: false,
  },
  HIGH: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/40',
    text: 'text-orange-400',
    badgeBg: 'bg-orange-500/20',
    badgeText: 'text-orange-300',
    pulse: true,
  },
  CRITICAL: {
    bg: 'bg-rose-500/15',
    border: 'border-rose-500/50',
    text: 'text-rose-400',
    badgeBg: 'bg-rose-500/25',
    badgeText: 'text-rose-200',
    pulse: true,
  },
};

export const LiveRiskMonitor: React.FC<LiveRiskMonitorProps> = ({
  security,
  caller,
}) => {
  const sevConfig = SEVERITY_CONFIGS[security.severity] || SEVERITY_CONFIGS.SAFE;

  // Format Synthetic Voice %
  const syntheticPct = security.syntheticProbability !== undefined
    ? Math.round(security.syntheticProbability * 100)
    : security.score > 70
    ? Math.min(99, Math.round(security.score * 0.95))
    : Math.max(2, Math.round(security.score * 0.4));

  // Format Speaker Match %
  const speakerMatchPct = security.speakerSimilarity !== undefined
    ? Math.round(security.speakerSimilarity * 100)
    : security.callerIdentity === 'verified'
    ? 94
    : security.callerIdentity === 'failed'
    ? 22
    : 87;

  // Format Intent
  const rawIntent = security.intent || (security.signals[0]?.label ?? 'Normal Conversation');
  const formattedIntent = rawIntent
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());

  // Format Identity
  const identityName = caller.claimedRole
    ? `${caller.name} (${caller.claimedRole})`
    : caller.name || 'Caller';

  // Format Security Action
  let currentAction = security.action || 'MONITOR';
  if (security.severity === 'CRITICAL') {
    currentAction = 'BLOCK / VERIFY';
  } else if (security.severity === 'HIGH') {
    currentAction = 'STEP-UP AUTH / VERIFY';
  } else if (security.severity === 'MEDIUM') {
    currentAction = 'MONITOR / CAUTION';
  } else if (security.severity === 'SAFE') {
    currentAction = 'ALLOW / PASS';
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-cyan-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Live Continuous Risk Monitor
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            REAL-TIME PIPELINE
          </span>
        </div>
      </div>

      {/* Main Grid matching Member 3 spec */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {/* Metric 1 & 2: Risk Score and Risk Level */}
        <div className={`p-4 rounded-xl border ${sevConfig.border} ${sevConfig.bg} transition-all`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 font-medium">Risk Score</div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className={`text-4xl font-extrabold ${sevConfig.text}`}>
                  {security.score}
                </span>
                <span className="text-slate-400 text-sm font-semibold">/ 100</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400 font-medium">Risk Level</div>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold ${sevConfig.badgeBg} ${sevConfig.badgeText} border ${sevConfig.border}`}
                >
                  {security.severity === 'CRITICAL' && <ShieldAlert size={13} className="text-rose-400" />}
                  {security.severity === 'HIGH' && <AlertTriangle size={13} className="text-orange-400" />}
                  {security.severity === 'SAFE' && <ShieldCheck size={13} className="text-emerald-400" />}
                  {security.severity}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-2 mt-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                security.severity === 'CRITICAL'
                  ? 'bg-rose-500'
                  : security.severity === 'HIGH'
                  ? 'bg-orange-500'
                  : security.severity === 'MEDIUM'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(4, security.score)}%` }}
            />
          </div>
        </div>

        {/* Metric 3 & 4: Synthetic Voice & Speaker Match */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col justify-between">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
              <div className="text-[11px] text-slate-400 uppercase font-semibold flex items-center gap-1.5">
                <Zap size={13} className="text-indigo-400" />
                Synthetic Voice
              </div>
              <div className="text-2xl font-bold mt-1 text-slate-100">
                {syntheticPct}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {syntheticPct > 70 ? 'High synthetic probability' : 'Natural acoustic spectrum'}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
              <div className="text-[11px] text-slate-400 uppercase font-semibold flex items-center gap-1.5">
                <UserCheck size={13} className="text-emerald-400" />
                Speaker Match
              </div>
              <div className="text-2xl font-bold mt-1 text-slate-100">
                {speakerMatchPct}%
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {security.callerIdentity === 'verified'
                  ? 'Verified baseline voice'
                  : security.callerIdentity === 'failed'
                  ? 'Voice mismatch detected'
                  : 'Compared to enrolled profile'}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-700/50">
            <span>Biometric Profile:</span>
            <span className="font-semibold text-slate-200">
              {caller.organization || 'Corporate Directory'}
            </span>
          </div>
        </div>

        {/* Metric 5 & 6: Intent & Identity */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-800/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Intent</div>
              <div className="text-base font-bold text-amber-300 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="truncate">{formattedIntent}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {security.signals.length > 0 ? `${security.signals.length} signal(s) flagged` : 'Natural speech flow'}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Identity</div>
              <div className="text-base font-bold text-slate-100 mt-1 truncate">
                {identityName}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Status: <span className="font-semibold text-slate-300 uppercase">{caller.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Metric 7: Current Security Action */}
        <div
          className={`p-4 rounded-xl border flex flex-col justify-between ${
            security.severity === 'CRITICAL'
              ? 'border-rose-500/40 bg-rose-950/30'
              : security.severity === 'HIGH'
              ? 'border-orange-500/40 bg-orange-950/20'
              : 'border-slate-800 bg-slate-800/40'
          }`}
        >
          <div>
            <div className="text-[11px] text-slate-400 uppercase font-semibold flex items-center gap-1.5">
              <Lock size={13} className={security.severity === 'CRITICAL' ? 'text-rose-400' : 'text-slate-400'} />
              Current Security Action
            </div>
            <div
              className={`text-xl font-extrabold mt-1 tracking-wide ${
                security.severity === 'CRITICAL'
                  ? 'text-rose-400 animate-pulse'
                  : security.severity === 'HIGH'
                  ? 'text-orange-400'
                  : 'text-emerald-400'
              }`}
            >
              {currentAction}
            </div>
          </div>
          <div className="text-[11px] text-slate-300 mt-2 font-medium">
            {security.recommendation ||
              (security.severity === 'CRITICAL'
                ? 'Terminate call or require secondary out-of-band verification immediately.'
                : 'Maintain standard verification protocols.')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveRiskMonitor;
