import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity, UserCheck, Zap } from 'lucide-react';
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

  // 1. Dynamic Synthetic Voice %
  const hasSynthetic = security.syntheticProbability !== undefined && security.syntheticProbability !== null;
  const syntheticPct = hasSynthetic ? Math.round((security.syntheticProbability ?? 0) * 100) : null;
  const syntheticDisplay = syntheticPct !== null ? `${syntheticPct}%` : 'ANALYZING';
  const syntheticSubtitle = syntheticPct !== null
    ? syntheticPct >= 60
      ? 'Synthetic speech detected'
      : 'Natural acoustic spectrum'
    : 'Evaluating voice frames';

  // 2. Dynamic Speaker Verification % (or NOT AVAILABLE)
  const hasSpeakerSim = security.speakerSimilarity !== undefined && security.speakerSimilarity !== null;
  const speakerMatchPct = hasSpeakerSim ? Math.round((security.speakerSimilarity ?? 0) * 100) : null;
  const speakerDisplay = speakerMatchPct !== null ? `${speakerMatchPct}%` : 'NOT AVAILABLE';
  const speakerSubtitle = speakerMatchPct !== null
    ? (security.callerIdentity === 'verified'
        ? 'Verified baseline voice'
        : 'Biometric mismatch against claimed profile')
    : 'No reference profile claimed';

  // 3. Dynamic Identity Claim
  const isIdentityClaimed = caller.name && caller.name !== 'Incoming Call' && caller.name !== 'Unknown Caller' && caller.name !== 'Inbound Call';
  const cleanClaimedName = isIdentityClaimed ? caller.name.replace(/\s*\(Claimed\)/i, '').trim() : 'UNVERIFIED';

  // 4. Format Intent
  const rawIntent = security.intent || (security.signals[0]?.label ?? 'Normal Conversation');
  const formattedIntent = rawIntent
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());

  // 5. Recommended Action
  let currentAction = security.action || 'MONITOR';
  let actionAdvice = 'Continue monitoring conversation.';
  if (security.severity === 'CRITICAL') {
    currentAction = 'BLOCK / TERMINATE';
    actionAdvice = 'Do not share OTP, credentials, or transfer funds. Disconnect immediately.';
  } else if (security.severity === 'HIGH') {
    currentAction = 'REQUIRE VERIFICATION';
    actionAdvice = 'Verify caller identity through a separate trusted out-of-band channel.';
  } else if (security.severity === 'MEDIUM') {
    currentAction = 'CAUTION / MONITOR';
    actionAdvice = 'Exercise caution before executing any requests.';
  } else if (security.severity === 'SAFE') {
    currentAction = 'ALLOW / SAFE';
    actionAdvice = 'Natural acoustic patterns verified. No threat signals detected.';
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-cyan-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            VoiceShield Real-Time Analysis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            LIVE PIPELINE
          </span>
        </div>
      </div>

      {/* Main Grid */}
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
                Voice Authenticity
              </div>
              <div className="text-xl font-bold mt-1 text-slate-100">
                {syntheticDisplay}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {syntheticSubtitle}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50">
              <div className="text-[11px] text-slate-400 uppercase font-semibold flex items-center gap-1.5">
                <UserCheck size={13} className="text-emerald-400" />
                Speaker Match
              </div>
              <div className={`text-xl font-bold mt-1 ${speakerMatchPct !== null ? 'text-slate-100' : 'text-slate-400 text-sm font-semibold'}`}>
                {speakerDisplay}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                {speakerSubtitle}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between pt-2 border-t border-slate-700/50">
            <span>Claimed Identity:</span>
            <span className={`font-semibold ${isIdentityClaimed ? 'text-cyan-300' : 'text-slate-400'}`}>
              {cleanClaimedName}
            </span>
          </div>
        </div>

        {/* Metric 5 & 6: Intent & Signals */}
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-800/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Conversational Intent</div>
              <div className="text-base font-bold text-amber-300 mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="truncate">{formattedIntent}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {security.signals.length > 0 ? `${security.signals.length} threat signal(s) detected` : 'Natural speech flow'}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 uppercase font-semibold">Verification Status</div>
              <div className="text-base font-bold text-slate-100 mt-1 truncate">
                {security.callerIdentity ? security.callerIdentity.toUpperCase() : 'UNVERIFIED'}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Target: <span className="font-semibold text-slate-300">Sreya Sengupta (Citizen)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Metric 7: Recommended Action */}
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
            <div className="text-[11px] text-slate-400 uppercase font-semibold">Recommended Action</div>
            <div
              className={`text-sm font-extrabold mt-1 ${
                security.severity === 'CRITICAL'
                  ? 'text-rose-400'
                  : security.severity === 'HIGH'
                  ? 'text-orange-400'
                  : 'text-emerald-400'
              }`}
            >
              {currentAction}
            </div>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
              {actionAdvice}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveRiskMonitor;
