import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  PauseCircle,
  Volume2,
  PhoneOff,
  CheckCircle2,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import type { InterventionStage } from '../../types';

interface CriticalInterventionBannerProps {
  stage: InterventionStage;
  onStageChange: (nextStage: InterventionStage) => void;
  onVerify: () => void;
  onEndCall: () => void;
  incidentId?: string;
  announcementLanguage?: string;
  announcementRegion?: string;
}

export const CriticalInterventionBanner: React.FC<CriticalInterventionBannerProps> = ({
  stage,
  onStageChange,
  onVerify,
  onEndCall,
  incidentId = 'SEC-8429-INC',
  announcementLanguage = 'English',
  announcementRegion = 'Tamil Nadu',
}) => {
  const [countdown, setCountdown] = useState(3);
  const [announcementProgress, setAnnouncementProgress] = useState(0);

  // Auto-progress stages for the simulated intervention
  useEffect(() => {
    if (stage === 'critical_detected') {
      const timer = setTimeout(() => {
        onStageChange('hold_call');
      }, 2000);
      return () => clearTimeout(timer);
    }

    if (stage === 'hold_call') {
      const timer = setTimeout(() => {
        onStageChange('announcement_playing');
      }, 2200);
      return () => clearTimeout(timer);
    }

    if (stage === 'announcement_playing') {
      setAnnouncementProgress(0);
      const interval = setInterval(() => {
        setAnnouncementProgress((p) => {
          if (p >= 100) {
            clearInterval(interval);
            onStageChange('countdown');
            return 100;
          }
          return p + 25;
        });
      }, 750);
      return () => clearInterval(interval);
    }

    if (stage === 'countdown') {
      setCountdown(3);
      const timer1 = setTimeout(() => setCountdown(2), 1000);
      const timer2 = setTimeout(() => setCountdown(1), 2000);
      const timer3 = setTimeout(() => {
        onStageChange('terminated_simulation');
      }, 3000);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }

    if (stage === 'terminated_simulation') {
      const timer = setTimeout(() => {
        onStageChange('incident_created');
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [stage, onStageChange]);

  if (stage === 'none') return null;

  const steps: { id: InterventionStage; label: string }[] = [
    { id: 'critical_detected', label: '1. Detected' },
    { id: 'hold_call', label: '2. Hold Call' },
    { id: 'announcement_playing', label: '3. Security Audio' },
    { id: 'countdown', label: '4. Disconnect' },
    { id: 'terminated_simulation', label: '5. Terminated' },
    { id: 'incident_created', label: '6. SOC Incident' },
  ];

  const currentIdx = steps.findIndex((s) => s.id === stage);

  return (
    <div className="rounded-2xl border border-red-300/80 bg-red-50/95 backdrop-blur-sm p-5 shadow-sm text-red-950 transition-all duration-300">
      {/* Simulation Badge Header */}
      <div className="flex items-center justify-between pb-3 border-b border-red-200/70">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-700 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-red-900">
            Critical Request Protective Intervention
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold bg-white/90 text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200">
            Prototype Simulation
          </span>
        </div>
      </div>

      {/* Step Tracker Indicator */}
      <div className="grid grid-cols-6 gap-1 my-3 text-center">
        {steps.map((s, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;
          return (
            <div key={s.id} className="space-y-1">
              <div
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  isActive
                    ? 'bg-red-600'
                    : isDone
                    ? 'bg-red-400'
                    : 'bg-red-200/60'
                }`}
              />
              <span
                className={`text-[10px] font-semibold block truncate ${
                  isActive ? 'text-red-900 font-bold' : isDone ? 'text-red-800' : 'text-red-300'
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stage-Specific Content */}
      <div className="bg-white/90 rounded-xl p-4 border border-red-200/80 shadow-xs space-y-3">
        {stage === 'critical_detected' && (
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              Critical Credential Request Intercepted
            </h4>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              The conversation contains urgent solicitations for OTP, PIN, or banking authorization. Automatic protective sequence initiated to shield your credentials.
            </p>
          </div>
        )}

        {stage === 'hold_call' && (
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-amber-600" />
              Protecting You — Call Placed on Hold (Simulation)
            </h4>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Inbound voice transmission is muted to prevent unauthorized extraction of confidential information.
            </p>
          </div>
        )}

        {stage === 'announcement_playing' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-blue-700 animate-pulse" />
                Security Announcement Playing (Simulation)
              </h4>
              <span className="text-[11px] font-semibold text-slate-500">
                {announcementProgress}%
              </span>
            </div>

            {/* Simulated Announcement Audio Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 italic leading-relaxed">
              "For your security, never share OTPs, passwords, PINs, KYC information or other sensitive credentials over an unsolicited call. Please verify this request through an official trusted channel."
            </div>

            {/* Language & Context Metadata */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>
                Language: <strong className="text-slate-800">{announcementLanguage}</strong>
              </span>
              <span>
                Region Context:{' '}
                <strong className="text-slate-800">{announcementRegion}</strong>
              </span>
            </div>
          </div>
        )}

        {stage === 'countdown' && (
          <div className="text-center py-2 space-y-1.5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-700 text-xl font-black">
              {countdown}
            </div>
            <h4 className="text-sm font-bold text-slate-900">
              Protective Call Disconnect in Progress...
            </h4>
            <p className="text-xs text-slate-500">
              Terminating call stream to safeguard credentials against social engineering.
            </p>
          </div>
        )}

        {stage === 'terminated_simulation' && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-red-900 flex items-center gap-2">
              <PhoneOff className="w-4 h-4 text-red-700" />
              Call Terminated — Simulation
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              The active session has been safely severed under VoiceShield protective policy. No sensitive credentials were confirmed.
            </p>
          </div>
        )}

        {stage === 'incident_created' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Security Incident Registered with SOC
              </h4>
              <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {incidentId}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              A critical threat event report containing the call telemetry, transcription snippets, and impersonation flags was dispatched to your Security Operations Center.
            </p>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-3.5 pt-2.5 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-red-900/80 font-bold">
          {stage === 'incident_created' || stage === 'terminated_simulation'
            ? (announcementLanguage === 'Tamil' ? 'உங்கள் பாதுகாப்பிற்காக இந்தத் தொடர்பு பாதுகாக்கப்பட்டுள்ளது.' :
               announcementLanguage === 'Hindi' ? 'यह संचार आपकी सुरक्षा के लिए सुरक्षित किया गया है।' :
               'This communication has been protected for your security.')
            : 'Automated defense active.'}
        </span>

        <div className="flex items-center gap-2">
          {stage !== 'incident_created' && stage !== 'terminated_simulation' && (
            <button
              type="button"
              onClick={onVerify}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserCheck size={13} />
              <span>Verify Independently</span>
            </button>
          )}

          <button
            type="button"
            onClick={onEndCall}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{stage === 'incident_created' ? 'Return to Home' : 'Close Session'}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CriticalInterventionBanner;
