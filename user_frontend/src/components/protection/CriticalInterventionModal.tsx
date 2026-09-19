import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  PauseCircle,
  Volume2,
  Clock,
  PhoneOff,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { CriticalInterventionState } from '../../types/protection';
import { useDemoScenario } from '../../context/DemoScenarioContext';
import { warningAudioService } from '../../services/warningAudioService';

interface CriticalInterventionModalProps {
  intervention: CriticalInterventionState;
  onDismiss: () => void;
  onEndCall: () => void;
}

export default function CriticalInterventionModal({
  intervention,
  onDismiss,
  onEndCall,
}: CriticalInterventionModalProps) {
  const navigate = useNavigate();
  const { selectedLanguage } = useDemoScenario();
  const [audioState, setAudioState] = useState(() => warningAudioService.getState());

  useEffect(() => {
    return warningAudioService.subscribe((s) => setAudioState(s));
  }, []);

  if (!intervention.active) return null;

  const { step, countdownValue, incidentRef } = intervention;

  const isStep1 = step === 'critical_detected';
  const isStep2 = step === 'call_held';
  const isStep3 = step === 'security_announcement';
  const isStep4 = step === 'countdown';
  const isStep5 = step === 'terminated';
  const isStep6 = step === 'incident_created';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-md animate-slow-fade"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intervention-title"
    >
      <div className="w-full max-w-xl card-enterprise p-6 shadow-2xl border-2 border-red-300/80 bg-white/95 overflow-hidden">
        {/* Header with SIMULATION badge */}
        <div className="flex items-center justify-between pb-4 border-b border-red-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={22} className="text-red-600" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                <span>Active Protection Triggered</span>
                <span className="px-1.5 py-0.2 rounded bg-red-600 text-white text-[9px] font-extrabold tracking-widest">
                  SIMULATION
                </span>
              </div>
              <h2 id="intervention-title" className="text-lg font-extrabold text-slate-900">
                VoiceShield Autonomous Intervention
              </h2>
            </div>
          </div>

          <span className="text-xs font-mono text-slate-400">Policy: ZERO-TRUST</span>
        </div>

        {/* Step Progression Visualizer */}
        <div className="my-5">
          <div className="grid grid-cols-6 gap-1.5 text-[10px] text-center font-semibold mb-2">
            <div className={`p-1.5 rounded ${isStep1 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              1. Detected
            </div>
            <div className={`p-1.5 rounded ${isStep2 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              2. Hold
            </div>
            <div className={`p-1.5 rounded ${isStep3 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              3. Warning
            </div>
            <div className={`p-1.5 rounded ${isStep4 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              4. 3-2-1
            </div>
            <div className={`p-1.5 rounded ${isStep5 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              5. Terminated
            </div>
            <div className={`p-1.5 rounded ${isStep6 ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              6. SOC
            </div>
          </div>
        </div>

        {/* Step-by-Step Dynamic Body Content */}
        <div className="min-h-[170px] flex flex-col justify-center">
          {isStep1 && (
            <div className="bg-red-50/70 border border-red-200 rounded-xl p-4 text-center animate-slow-fade">
              <AlertTriangle size={28} className="text-red-600 mx-auto mb-2" />
              <div className="text-base font-bold text-red-950">Critical Request Detected</div>
              <p className="text-xs text-red-800 mt-1 max-w-md mx-auto">
                Sensitive credential / OTP information is being requested during a high-risk conversation with unverified acoustic patterns.
              </p>
            </div>
          )}

          {isStep2 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-center animate-slow-fade">
              <PauseCircle size={28} className="text-amber-600 mx-auto mb-2 animate-pulse" />
              <div className="text-base font-bold text-amber-950">Protecting Employee</div>
              <p className="text-xs text-amber-800 mt-1">
                Active call has been placed on hold. Outgoing microphone stream paused to prevent credential leakage.
              </p>
            </div>
          )}

          {isStep3 && (
            <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 text-center animate-slow-fade">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Volume2 size={28} className="text-blue-600 animate-pulse" />
              </div>
              <div className="text-sm font-bold text-blue-950">Active Security Announcement (Spoken Warning)</div>
              <div className="mt-2 text-xs font-medium text-slate-800 bg-white/90 p-3 rounded-lg border border-blue-100 italic leading-relaxed">
                “{warningAudioService.getWarningScript(intervention.reason || 'CRITICAL', selectedLanguage.code || selectedLanguage.language)}”
              </div>
              <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-blue-700 flex-wrap">
                <span>Target Language: <strong>{selectedLanguage.language} ({selectedLanguage.code})</strong></span>
                <span>•</span>
                <span className="font-semibold text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  VoiceShield Dynamic TTS
                </span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    warningAudioService.playSecurityWarning(intervention.reason || 'CRITICAL', selectedLanguage.code || selectedLanguage.language, true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Manual fallback to speak warning aloud"
                >
                  <Volume2 size={14} className={audioState.isSpeaking ? 'animate-pulse text-emerald-300' : ''} />
                  <span>
                    {audioState.isSpeaking
                      ? `Speaking in ${selectedLanguage.language}...`
                      : `Play Warning (${selectedLanguage.language})`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {isStep4 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center animate-slow-fade">
              <Clock size={24} className="text-red-600 mx-auto mb-1" />
              <div className="text-xs font-semibold text-red-800 uppercase tracking-wider">
                Automated Protection Disconnect in Progress
              </div>
              <div className="text-5xl font-extrabold text-red-600 my-2 animate-countdown font-mono">
                {countdownValue}
              </div>
              <div className="text-xs text-slate-600">
                Safely disconnecting line to protect employee credentials...
              </div>
            </div>
          )}

          {(isStep5 || isStep6) && (
            <div className="space-y-3 animate-slow-fade">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
                  <PhoneOff size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">Call Terminated</span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-mono font-bold">
                      SIMULATION
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Your call was protected. The impersonation attempt was intercepted before credentials were disclosed.
                  </p>
                </div>
              </div>

              {/* Step 6: SOC Incident Confirmation */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-emerald-950">SOC Incident Created</div>
                    <div className="text-slate-600 text-[11px]">
                      Incident recorded for investigation and audit: <strong className="font-mono">{incidentRef || 'INC-2026-0142'}</strong>
                    </div>
                  </div>
                </div>
                <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-md font-semibold text-[11px] whitespace-nowrap">
                  Logged & Audited
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Independent Verification Guidance (Requirement #13) */}
        {(isStep5 || isStep6) && (
          <div className="mt-4 p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 text-xs">
            <div className="font-bold text-blue-950 flex items-center gap-1.5">
              <span>Next Safe Step: Verify through a trusted channel</span>
            </div>
            <p className="mt-1 text-slate-600 leading-relaxed">
              Do not use contact details provided during this call. Confirm the request using an official company directory, known contact method or other trusted channel.
            </p>
          </div>
        )}

        {/* Footer Actions (Requirement #13: limited and meaningful) */}
        <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          {!(isStep5 || isStep6) ? (
            <div className="text-xs text-slate-500 italic">
              Autonomous security intervention running...
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  onEndCall();
                  onDismiss();
                  navigate('/verification');
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <span>Verify Independently</span>
                <ExternalLink size={13} />
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onEndCall();
                    onDismiss();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs"
                >
                  Close & Protect
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
