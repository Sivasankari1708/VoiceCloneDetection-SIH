import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Clock,
  AlertOctagon,
  Lock,
  Info,
  PhoneOff,
  ShieldAlert,
} from 'lucide-react';
import { useActiveCall, useCallHistory } from '../context/AppContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import type { CallerIdentity } from '../types';

export default function VerificationPage() {
  const navigate = useNavigate();
  const { activeCall, endActiveCall } = useActiveCall();
  const { callHistory } = useCallHistory();

  const caller: CallerIdentity = activeCall?.caller ?? {
    name: 'Incoming Caller',
    claimedRole: 'Government Official / Protected Authority',
    organization: 'Government Agency / Law Enforcement',
    status: 'unverified',
    statusMessage: 'Incident escalated to organization',
  };

  const currentRiskScore = activeCall?.security.score ?? 90;
  const currentRiskLevel = activeCall?.security.severity ?? 'CRITICAL';
  const incidentRef = `INC-${(activeCall?.id || (callHistory[0]?.id ?? 'GOV-2026-8841'))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10)
    .toUpperCase()}`;

  const handleHangUp = () => {
    endActiveCall();
    navigate('/history');
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Call
      </button>

      {/* Main Restriction & Escalation Header */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 rounded-2xl p-6 text-white border border-rose-800/60 shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
            <AlertOctagon size={28} />
          </div>
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase tracking-wider bg-rose-500/30 text-rose-200 border border-rose-500/50 mb-1">
              Official Safety Policy
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Direct Verification Restricted
            </h1>
          </div>
        </div>

        <p className="text-sm text-rose-100/90 leading-relaxed">
          <strong>Notice:</strong> Citizens <span className="underline decoration-rose-400 font-bold">cannot</span> request direct or self-service verification from a government organisation, regulatory body, or law enforcement agency. Fraudulent actors frequently forge credentials during active impersonation attempts.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-rose-200">
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-amber-400 animate-pulse" />
            <strong>Requirement:</strong> You must wait until the incident is investigated and resolved by the organisation.
          </span>
        </div>
      </div>

      {/* Active Incident Escalation Status Card */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" />
              Organisation Incident Telemetry
            </span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              UNDER INVESTIGATION BY ORGANISATION (SOC)
            </span>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Incident Reference ID</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{incidentRef}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Claimed Organisation</span>
              <span className="font-semibold text-slate-900 text-sm">
                {caller.organization || 'Government Authority / Law Enforcement'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Claimed Speaker Identity</span>
              <span className="font-semibold text-slate-900">{caller.name}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">AI Risk Score Trigger</span>
              <span className="font-mono font-bold text-rose-600 text-sm">
                {currentRiskScore} / 100 ({currentRiskLevel})
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-blue-950">
              <Info size={15} className="text-blue-600" />
              Automated Incident Dispatch Confirmation
            </div>
            <p className="leading-relaxed">
              Real-time acoustic telemetry, synthetic voice indicators, and conversation transcripts have been securely dispatched to the organisation&apos;s Security Operations Center (SOC). Security analysts have been alerted to review this session.
            </p>
          </div>
        </div>
      </Card>

      {/* Mandatory Instructions for Citizen */}
      <Card
        header={
          <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Lock size={16} className="text-rose-600" />
            Mandatory Action Protocol for Citizens
          </span>
        }
      >
        <div className="space-y-3.5 text-xs text-slate-700">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
            <div className="w-6 h-6 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
              1
            </div>
            <div>
              <div className="font-bold text-rose-900 text-sm">Terminate The Call Immediately</div>
              <p className="text-slate-600 mt-0.5 leading-relaxed">
                Disconnect right away. Legitimate government bodies and financial institutions will never demand urgent action, threaten arrest, or ask you to remain on an uninterrupted call.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="w-6 h-6 rounded-full bg-amber-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
              2
            </div>
            <div>
              <div className="font-bold text-amber-900 text-sm">Do Not Share Sensitive Information</div>
              <p className="text-slate-600 mt-0.5 leading-relaxed">
                Never disclose OTPs, banking passwords, PINs, Aadhaar numbers, or authorize digital payment transfers under any circumstance.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-100 border border-slate-200">
            <div className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
              3
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">Wait Till Incident Is Formally Resolved</div>
              <p className="text-slate-600 mt-0.5 leading-relaxed">
                The organisation&apos;s incident response team must conclude their investigation before any further contact is permitted. Any follow-up from the official organisation will occur through certified, registered portals — never unverified outbound phone calls.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          variant="danger"
          size="lg"
          className="flex-1 py-3 text-base font-bold bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/20"
          icon={<PhoneOff size={18} />}
          onClick={handleHangUp}
        >
          Hang Up & End Call
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1 py-3"
          icon={<ShieldAlert size={18} className="text-amber-500" />}
          onClick={() => navigate('/alert')}
        >
          View Security Alert Details
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => navigate('/home')}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
