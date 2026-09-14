import React from 'react';
import { AlertTriangle, ShieldAlert, PhoneOff, UserCheck, X } from 'lucide-react';
import type { SeverityLevel } from '../../types';

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
  onVerify,
  onHangUp,
  onDismiss,
}) => {
  if (!isOpen) return null;

  const isCritical = severity === 'CRITICAL';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div
        className={`w-full max-w-md rounded-2xl bg-white shadow-xl border overflow-hidden transform transition-all ${
          isCritical ? 'border-red-200' : 'border-slate-200'
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="warning-modal-title"
      >
        {/* Soft Banner Strip */}
        <div
          className={`px-6 py-4 flex items-start justify-between border-b ${
            isCritical
              ? 'bg-red-50/90 border-red-100 text-red-950'
              : 'bg-blue-50/80 border-blue-100 text-blue-950'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isCritical
                  ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {isCritical ? <ShieldAlert size={22} /> : <AlertTriangle size={22} />}
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider block opacity-75">
                VoiceShield Security Advisory
              </span>
              <h2 id="warning-modal-title" className="text-base font-bold text-slate-900">
                {isCritical ? 'CRITICAL REQUEST DETECTED' : 'UNUSUAL REQUEST DETECTED'}
              </h2>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div
            className={`p-4 rounded-xl border text-xs leading-relaxed ${
              isCritical
                ? 'bg-red-50/60 border-red-200/80 text-red-950'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <p className="font-semibold text-sm mb-1.5">
              {isCritical
                ? 'We detected a request for sensitive information during this call.'
                : 'We detected unusual conversation patterns that require verification.'}
            </p>
            <p className="opacity-90">
              Do not share OTPs, passwords, PINs, banking credentials or sensitive information. Legitimate organizations do not request confidential codes over an unsolicited call.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            You can verify this caller through an independent trusted channel before taking any action, or end the call immediately.
          </p>

          {/* Limited Primary Actions */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={onVerify}
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserCheck size={15} />
              <span>Verify Caller</span>
            </button>

            <button
              type="button"
              onClick={onHangUp}
              className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <PhoneOff size={15} />
              <span>End Call</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeWarningModal;
