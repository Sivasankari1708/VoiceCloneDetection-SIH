import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, PhoneOff, X, Volume2 } from 'lucide-react';
import type { SeverityLevel } from '../../types';
import Button from '../ui/Button';
import { useDemoScenario } from '../../context/DemoScenarioContext';
import { warningAudioService } from '../../services/warningAudioService';

interface RealTimeWarningModalProps {
  isOpen: boolean;
  severity: SeverityLevel;
  score: number;
  message?: string;
  onVerify: () => void;
  onHangUp: () => void;
  onDismiss: () => void;
}

export const RealTimeWarningModal: React.FC<RealTimeWarningModalProps> = ({
  isOpen,
  severity,
  score,
  message,
  onVerify,
  onHangUp,
  onDismiss,
}) => {
  const { selectedLanguage } = useDemoScenario();
  const [audioState, setAudioState] = useState(() => warningAudioService.getState());

  useEffect(() => {
    return warningAudioService.subscribe((state) => {
      setAudioState(state);
    });
  }, []);

  if (!isOpen) return null;

  const isCritical = severity === 'CRITICAL';
  const localizedScript = warningAudioService.getWarningScript(
    isCritical ? 'CRITICAL' : 'HIGH',
    selectedLanguage.code || selectedLanguage.language
  );

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-50 max-w-md w-[calc(100%-2rem)] sm:w-[420px] pointer-events-none animate-fade-in-down">
      <div
        className={`pointer-events-auto rounded-2xl shadow-2xl border overflow-hidden transform transition-all backdrop-blur-md ${
          isCritical
            ? 'bg-slate-900/95 border-rose-500 shadow-2xl shadow-rose-950/60'
            : 'bg-slate-900/95 border-orange-500 shadow-2xl shadow-orange-950/60'
        }`}
        role="alert"
        aria-live="assertive"
      >
        {/* Top Accent Strip */}
        <div
          className={`h-2 w-full ${
            isCritical ? 'bg-gradient-to-r from-rose-600 via-red-500 to-rose-600 animate-pulse' : 'bg-gradient-to-r from-orange-500 to-amber-500'
          }`}
        />

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isCritical ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                }`}
              >
                {isCritical ? <ShieldAlert size={28} /> : <AlertTriangle size={28} />}
              </div>
              <div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-extrabold tracking-wider uppercase mb-1 ${
                    isCritical ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                  }`}
                >
                  {isCritical ? '⚠ CRITICAL RISK DETECTED' : '⚠ HIGH RISK WARNING'}
                </span>
                <h2 id="warning-modal-title" className="text-xl font-extrabold text-white">
                  AI Voice Clone Impersonation Detected
                </h2>
              </div>
            </div>

            <button
              onClick={onDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Dismiss modal"
            >
              <X size={18} />
            </button>
          </div>

          <div
            id="warning-modal-desc"
            className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
          >
            {/* Matching localized warning script */}
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1 flex items-center justify-between">
                <span>Spoken Warning ({selectedLanguage.language})</span>
                <span className="text-[10px] text-emerald-400 font-mono">Dynamic TTS Active</span>
              </div>
              <p className="text-xs font-semibold text-rose-100 italic leading-relaxed">
                “{localizedScript}”
              </p>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {message ||
                'Voice biometric analysis detected synthetic acoustic artifacts consistent with an AI voice clone.'}
            </p>

            {/* Government / Organisation Policy Notice */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-rose-200/90 leading-relaxed">
              <span className="font-bold text-rose-300 block mb-0.5">⚠️ Organisation Verification Policy:</span>
              Citizens cannot directly request verification from a government organisation or public authority. An official Security Incident has been escalated to the organisation&apos;s SOC. Please hang up and wait until the incident is resolved by the organisation.
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">Current AI Risk Score:</span>
              <span className="font-mono font-bold text-rose-400 text-sm">
                {score} / 100 ({severity})
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {/* Manual Play / Replay Fallback Button */}
            <button
              type="button"
              onClick={() => {
                warningAudioService.playSecurityWarning(
                  isCritical ? 'CRITICAL' : 'HIGH',
                  selectedLanguage.code || selectedLanguage.language,
                  true
                );
              }}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-blue-600/90 hover:bg-blue-600 text-white flex items-center justify-center gap-2 border border-blue-400/30 shadow-xs cursor-pointer transition"
            >
              <Volume2 size={15} className={audioState.isSpeaking ? 'animate-pulse text-emerald-300' : ''} />
              <span>
                {audioState.isSpeaking
                  ? `Speaking Warning in ${selectedLanguage.language}...`
                  : `Play Warning (${selectedLanguage.language})`}
              </span>
            </button>

            <Button
              variant="danger"
              className="w-full py-3 text-sm font-bold bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2"
              icon={<PhoneOff size={17} />}
              onClick={onHangUp}
            >
              Hang Up Immediately
            </Button>
            <Button
              variant="outline"
              className="w-full py-2 text-xs border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 flex items-center justify-center gap-1.5"
              icon={<ShieldAlert size={14} className="text-amber-400" />}
              onClick={onVerify}
            >
              View Organisation Incident Notice
            </Button>
          </div>
          
          <div className="mt-3 text-center">
            <button
              onClick={onDismiss}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              I understand the risk, continue monitoring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeWarningModal;
