import { useState, type ReactNode } from 'react';
import { ShieldCheck, AlertCircle, HelpCircle, ShieldAlert, ExternalLink } from 'lucide-react';
import type { VerificationInfo, VerificationState } from '../../types/protection';

interface VerificationPanelProps {
  verification: VerificationInfo;
  onVerifyIndependently?: () => void;
  onStateChange?: (state: VerificationState) => void;
  interactive?: boolean;
}

const STATE_CONFIG: Record<
  VerificationState,
  {
    icon: ReactNode;
    badgeBg: string;
    border: string;
    bg: string;
    titleColor: string;
  }
> = {
  Verified: {
    icon: <ShieldCheck size={18} className="text-emerald-600" />,
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/30',
    titleColor: 'text-emerald-950',
  },
  'Verification Degraded': {
    icon: <AlertCircle size={18} className="text-amber-600" />,
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
    border: 'border-amber-200',
    bg: 'bg-amber-50/30',
    titleColor: 'text-amber-950',
  },
  'Identity Cannot Be Verified': {
    icon: <HelpCircle size={18} className="text-slate-600" />,
    badgeBg: 'bg-slate-200 text-slate-800 border-slate-300',
    border: 'border-slate-300',
    bg: 'bg-slate-100/60',
    titleColor: 'text-slate-900',
  },
  Suspicious: {
    icon: <ShieldAlert size={18} className="text-red-600" />,
    badgeBg: 'bg-red-100 text-red-800 border-red-300',
    border: 'border-red-200',
    bg: 'bg-red-50/40',
    titleColor: 'text-red-950',
  },
};

const ALL_VERIFICATION_STATES: VerificationState[] = [
  'Verified',
  'Verification Degraded',
  'Identity Cannot Be Verified',
  'Suspicious',
];

export default function VerificationPanel({
  verification,
  onVerifyIndependently,
  onStateChange,
  interactive = false,
}: VerificationPanelProps) {
  const [showTrustedGuide, setShowTrustedGuide] = useState(false);
  const cfg = STATE_CONFIG[verification.state] || STATE_CONFIG['Verification Degraded'];

  return (
    <div className={`card-enterprise p-5 transition-all ${cfg.border} ${cfg.bg}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Identity Verification Status
            </div>
            <div className={`text-base font-bold ${cfg.titleColor}`}>
              {verification.headline}
            </div>
          </div>
        </div>

        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badgeBg}`}>
          {verification.state}
        </span>
      </div>

      {/* Description */}
      <div className="mt-3 text-xs text-slate-700 leading-relaxed">
        {verification.description}
      </div>

      {/* Supporting voice conditions if Degraded (Requirement #9) */}
      {verification.state === 'Verification Degraded' && verification.degradedFactors && verification.degradedFactors.length > 0 && (
        <div className="mt-3 bg-white/80 rounded-xl p-3 border border-amber-200/60 text-xs">
          <div className="font-semibold text-amber-900 text-[11px] mb-1.5 flex items-center gap-1.5">
            <span>Observable Audio & Speaking Conditions:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {verification.degradedFactors.map((factor) => (
              <span
                key={factor}
                className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-medium border border-amber-200"
              >
                • {factor}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2 italic">
            Note: Environmental conditions or connection quality do not automatically indicate fraudulent intent.
          </p>
        </div>
      )}

      {/* Action: Verify Independently (Requirement #6 & #13) */}
      <div className="mt-4 pt-3 border-t border-slate-200/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-medium text-slate-900">Independent Confirmation:</span> Confirm the request using an official trusted channel.
          </div>

          <button
            onClick={() => {
              setShowTrustedGuide((prev) => !prev);
              if (onVerifyIndependently) onVerifyIndependently();
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <span>Verify Independently</span>
            <ExternalLink size={13} />
          </button>
        </div>

        {/* Supporting trusted channel guide drop-down */}
        {showTrustedGuide && (
          <div className="mt-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 animate-slow-fade">
            <div className="font-bold text-blue-950 flex items-center justify-between">
              <span>Trusted Channel Guidelines</span>
              <button
                onClick={() => setShowTrustedGuide(false)}
                className="text-[10px] text-blue-600 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <ul className="mt-1.5 space-y-1 text-slate-700 list-disc list-inside">
              <li>Do not use phone numbers or links provided during this ongoing call.</li>
              <li>Look up the contact in the official corporate directory or internal Intranet.</li>
              <li>Initiate a separate out-of-band call, enterprise Slack message, or email.</li>
            </ul>
            <p className="mt-2 text-[10px] text-blue-800 font-medium">
              * VoiceShield does not claim this ongoing call session is verified until out-of-band confirmation is completed.
            </p>
          </div>
        )}
      </div>

      {/* Interactive state selector */}
      {interactive && onStateChange && (
        <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-slate-500 font-medium">Test Verification State:</span>
          <div className="flex gap-1.5 flex-wrap">
            {ALL_VERIFICATION_STATES.map((st) => (
              <button
                key={st}
                onClick={() => onStateChange(st)}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  verification.state === st
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
