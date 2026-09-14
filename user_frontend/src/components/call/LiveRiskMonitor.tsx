import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  PhoneOff,
  UserCheck,
  Info,
  Volume2,
} from 'lucide-react';
import type { SecurityStatus, CallerIdentity, SeverityLevel } from '../../types';
import { useSettings } from '../../context/AppContext';
import { getWarningText } from '../../utils/translations';

interface LiveRiskMonitorProps {
  security: SecurityStatus;
  caller: CallerIdentity;
  onVerify?: () => void;
  onEndCall?: () => void;
  interventionActive?: boolean;
}

const SEVERITY_THEMES: Record<
  SeverityLevel,
  {
    cardBg: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    accentText: string;
    statusLabel: string;
    trustTitle: string;
  }
> = {
  SAFE: {
    cardBg: 'bg-white',
    border: 'border-slate-200',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-200',
    accentText: 'text-slate-800',
    statusLabel: 'SAFE',
    trustTitle: 'Normal Call — Voice Patterns Consistent',
  },
  LOW: {
    cardBg: 'bg-blue-50/40',
    border: 'border-blue-200/80',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    badgeBorder: 'border-blue-200',
    accentText: 'text-blue-900',
    statusLabel: 'LOW RISK',
    trustTitle: 'Routine Conversation — Minor Variance Noted',
  },
  CAUTION: {
    cardBg: 'bg-slate-50',
    border: 'border-amber-200/90',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    badgeBorder: 'border-amber-300',
    accentText: 'text-slate-900',
    statusLabel: 'CAUTION',
    trustTitle: 'Exercise Caution — Unusual Request or Signal',
  },
  MEDIUM: {
    cardBg: 'bg-slate-50',
    border: 'border-amber-200/90',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    badgeBorder: 'border-amber-300',
    accentText: 'text-slate-900',
    statusLabel: 'CAUTION',
    trustTitle: 'Exercise Caution — Unusual Request or Signal',
  },
  HIGH: {
    cardBg: 'bg-blue-900/5',
    border: 'border-blue-300',
    badgeBg: 'bg-blue-900 text-white',
    badgeText: 'text-white',
    badgeBorder: 'border-blue-800',
    accentText: 'text-blue-950',
    statusLabel: 'HIGH RISK',
    trustTitle: 'Suspicious Activity Detected — Verification Recommended',
  },
  CRITICAL: {
    // Soft translucent red background per design system (NO neon)
    cardBg: 'bg-red-50/90 backdrop-blur-sm',
    border: 'border-red-300/80 shadow-sm',
    badgeBg: 'bg-red-100 text-red-900',
    badgeText: 'text-red-900',
    badgeBorder: 'border-red-300',
    accentText: 'text-red-950',
    statusLabel: 'CRITICAL THREAT',
    trustTitle: 'Critical Threat: Sensitive Request or Impersonation',
  },
};

export const LiveRiskMonitor: React.FC<LiveRiskMonitorProps> = ({
  security,
  caller,
  onVerify,
  onEndCall,
  interventionActive,
}) => {
  const { settings } = useSettings();
  const lang = settings.warningLanguage;

  const isCritical = security.severity === 'CRITICAL';
  const isHigh = security.severity === 'HIGH';
  const isCaution = security.severity === 'CAUTION' || security.severity === 'MEDIUM';

  const theme = SEVERITY_THEMES[security.severity] || SEVERITY_THEMES.SAFE;

  // ─── Apply Translation ───
  let translationKey: Parameters<typeof getWarningText>[0] = 'safe';
  if (isCritical) translationKey = 'critical';
  else if (isHigh) translationKey = 'high';
  else if (isCaution) translationKey = 'medium';
  else if (security.severity === 'LOW') translationKey = 'low';

  const translatedStatusTitle = getWarningText(translationKey, lang);

  // Identity verification state: check if degraded
  const isDegraded =
    caller.status === 'degraded' ||
    (security.callerIdentity as string) === 'degraded' ||
    (security.callerIdentity as string) === 'checking';

  // Plain-English Detection Summary (No raw ML numbers)
  const detectedSignalsList = security.signals.filter((s) => s.type !== 'normal');
  const hasSensitiveRequest = detectedSignalsList.some(
    (s) =>
      s.type === 'otp_request' ||
      s.type === 'credential_request' ||
      s.type === 'payment_request' ||
      s.type === 'sensitive_info_request'
  );

  // "Why it matters" narrative
  const getWhyItMatters = () => {
    if (isCritical || hasSensitiveRequest) {
      return 'Impersonators frequently manufacture urgent pretexts to solicit one-time codes, passwords, or immediate wire transfers. Legitimate organizations will never demand an OTP or password over an unsolicited call.';
    }
    if (isHigh) {
      return 'Voice characteristics deviate from standard human speech patterns or caller authority is being asserted without independent confirmation.';
    }
    if (isDegraded) {
      return 'Unclear acoustic conditions or channel noise can obscure subtle impersonation artifacts. Confirming identity independently ensures your safety.';
    }
    return 'VoiceShield continuously monitors incoming dialogue patterns to keep corporate and personal credentials safe.';
  };

  // "What you should do" narrative
  const getWhatYouShouldDo = () => {
    if (isCritical) {
      return 'Do not share OTPs, passwords, PINs, banking credentials or sensitive information. Hang up or verify the caller independently.';
    }
    if (isHigh) {
      return 'Refrain from confirming sensitive details or approving pending authorizations. Request a callback through official channels.';
    }
    if (isCaution || isDegraded) {
      return 'Exercise standard vigilance. If caller requests any internal data, initiate secondary verification.';
    }
    return 'You may proceed with the conversation. VoiceShield remains active in the background.';
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 p-5 ${theme.cardBg} ${theme.border} ${
        isCritical ? 'ring-1 ring-red-300/60' : ''
      }`}
    >
      {/* 1. Header Strip: Trust Question & Risk Level Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-200/70">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Trust Assessment
          </span>
          <h3 className={`text-base font-bold ${theme.accentText} mt-0.5 flex items-center gap-2`}>
            {isCritical ? (
              <ShieldAlert className="w-5 h-5 text-red-700 flex-shrink-0" />
            ) : isHigh ? (
              <AlertTriangle className="w-5 h-5 text-blue-900 flex-shrink-0" />
            ) : isCaution ? (
              <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-slate-700 flex-shrink-0" />
            )}
            <span>{translatedStatusTitle}</span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isCritical
                  ? 'bg-red-600 animate-pulse'
                  : isHigh
                  ? 'bg-blue-800'
                  : isCaution
                  ? 'bg-amber-600'
                  : 'bg-slate-400'
              }`}
            />
            {theme.statusLabel}
          </span>
        </div>
      </div>

      {/* 2. Critical Warning Banner (Prominent soft translucent red) */}
      {isCritical && (
        <div className="mt-3.5 p-3.5 rounded-xl bg-red-100/70 border border-red-300/80 text-red-950">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-red-900">
                CRITICAL REQUEST DETECTED
              </div>
              <p className="text-xs text-red-950 font-medium mt-1 leading-relaxed">
                We detected a request for sensitive information during this call.
              </p>
              <p className="text-xs text-red-900/90 font-semibold mt-0.5">
                Do not share OTPs, passwords, PINs, banking credentials or sensitive information.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Verification Degraded State Banner (if caller is in degraded condition) */}
      {isDegraded && !isCritical && (
        <div className="mt-3.5 p-3 rounded-xl bg-slate-100 border border-slate-300/80 text-slate-800">
          <div className="flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-slate-900">
                VERIFICATION DEGRADED
              </div>
              <p className="text-slate-700 mt-0.5 leading-relaxed">
                We couldn't confidently verify the caller. Voice or call conditions may be affecting verification.
              </p>
              <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-2">
                <span>Possible factors: Background noise, call quality, or speaker variation.</span>
                <span className="font-semibold text-blue-900">• Additional verification recommended.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Three-Column Context Grid: What was Detected / Why It Matters / What to Do */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-3.5">
        {/* Box A: What Was Detected */}
        <div className="p-3.5 rounded-xl bg-white/80 border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-blue-700" />
            What Was Detected
          </span>
          {detectedSignalsList.length === 0 ? (
            <p className="text-xs text-slate-600 leading-relaxed">
              Normal conversation flow. No sensitive requests, urgency pressure, or synthetic voice anomalies identified.
            </p>
          ) : (
            <div className="space-y-1.5">
              {detectedSignalsList.map((sig, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-700" />
                  <span>{sig.label}</span>
                </div>
              ))}
              <div className="text-[11px] text-slate-500 pt-1">
                Claimed caller:{' '}
                <strong className="text-slate-700">{caller.name || 'External Speaker'}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Box B: Why It Matters */}
        <div className="p-3.5 rounded-xl bg-white/80 border border-slate-200/80 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5 flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5 text-slate-600" />
            Why It Matters
          </span>
          <p className="text-xs text-slate-600 leading-relaxed">
            {getWhyItMatters()}
          </p>
        </div>

        {/* Box C: What You Should Do */}
        <div
          className={`p-3.5 rounded-xl border shadow-xs ${
            isCritical
              ? 'bg-red-50/50 border-red-200 text-red-950'
              : 'bg-white/80 border-slate-200/80 text-slate-800'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            Recommended Action
          </span>
          <p className="text-xs font-medium leading-relaxed">
            {getWhatYouShouldDo()}
          </p>
        </div>
      </div>

      {/* 5. Limited Primary Actions (Verify / End Call) */}
      {(isCritical || isHigh || isCaution || isDegraded) && !interventionActive && (
        <div className="mt-4 pt-3.5 border-t border-slate-200/70 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500">
            {isCritical
              ? 'Immediate action advised. Do not disclose confidential items.'
              : 'Protect your account by verifying unusual callers.'}
          </div>

          <div className="flex items-center gap-2">
            {onVerify && (
              <button
                type="button"
                onClick={onVerify}
                className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <UserCheck size={14} />
                <span>Verify Caller</span>
              </button>
            )}

            {onEndCall && (
              <button
                type="button"
                onClick={onEndCall}
                className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer ${
                  isCritical
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                }`}
              >
                <PhoneOff size={14} />
                <span>End Call</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveRiskMonitor;
