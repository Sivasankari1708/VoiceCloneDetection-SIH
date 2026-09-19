import { useState } from 'react';
import {
  ShieldAlert,
  Send,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Building2,
  Landmark,
  ShieldCheck,
} from 'lucide-react';
import { useDemoScenario } from '../../context/DemoScenarioContext';

export default function SocDashboardPage() {
  const { socIncidents, escalateToCybercrimePortal } = useDemoScenario();
  const [selectedIncidentId] = useState<string>(socIncidents[0]?.id || 'INC-2026-0142');
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);

  const incident = socIncidents.find((i) => i.id === selectedIncidentId) || socIncidents[0];

  const handleEscalateToCybercrime = () => {
    escalateToCybercrimePortal(incident.id);
    setShowConfirmationModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
              <Lock size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">SOC Incident Response</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">
                  INCIDENT TRIAGE
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Understand reported voice incidents, assess financial/credential exposure, and execute appropriate escalations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-slate-500">Incident Ref:</span>
            <strong className="font-mono text-slate-900 font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200">
              {incident.id}
            </strong>
          </div>
        </div>
      </header>

      {/* Main Content (Story: Incident reported → Understand incident → Escalate appropriately) */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-5">
        {/* 1. Reported Incident Overview (Requirement #3) */}
        <div className="card-enterprise p-5 border border-slate-200/90 bg-white space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={20} className="text-red-600 flex-shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Reported Incident</div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Critical Voice Impersonation Event — {incident.id}
                </h2>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-900 border border-red-300">
              Employee Protected
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Timestamp</div>
              <div className="font-semibold text-slate-800 mt-0.5">{incident.timestamp}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Target Employee</div>
              <div className="font-semibold text-slate-800 mt-0.5">{incident.employee} ({incident.employeeRole})</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Claimed Identity</div>
              <div className="font-semibold text-slate-800 mt-0.5">{incident.claimedCaller} ({incident.claimedDepartment})</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Protection Action</div>
              <div className="font-semibold text-red-700 mt-0.5 truncate">{incident.protectionAction}</div>
            </div>
          </div>
        </div>

        {/* 2. What Happened & Relevant Incident Type (Requirement #3) */}
        <div className="card-enterprise p-5 border border-slate-200/90 bg-white space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">What Happened</h3>
            {/* Relevant incident type */}
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Incident Type: Voice Impersonation / Credential Solicitation
            </span>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">
            An inbound caller claimed to be Senior Executive <strong>Arun Kumar</strong> from the Finance Department. During the call, the caller claimed to be in an urgent board meeting and solicited an immediate One-Time Password (OTP) to clear a vendor wire transfer.
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">
            VoiceShield detected the combination of conversational urgency and unverified acoustic patterns, initiated an autonomous employee hold, broadcast a security announcement, and terminated the call to protect employee credentials.
          </p>
        </div>

        {/* 3. Whether Credential / Financial Exposure Is Possible (Requirement #3) */}
        <div className="card-enterprise p-5 border border-slate-200/90 bg-white space-y-3">
          <div className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            Credential / Financial Exposure Assessment
          </div>

          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950 text-sm">
                Potential Exposure: HIGH RISK PREVENTED
              </div>
              <p className="text-amber-900 mt-1 leading-relaxed">
                The caller attempted to solicit sensitive banking OTP credentials. Because VoiceShield terminated the call before the employee disclosed any code, <strong>no credential exposure or fund leakage occurred</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* 4. The Appropriate Escalation Pathway & National Cybercrime Portal Option (Requirement #3) */}
        <div className="card-enterprise p-5 border border-slate-200/90 bg-white space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Appropriate Escalation Pathway</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Follow established enterprise incident protocols based on the financial and impersonation nature of the attack.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Step 1: Internal Workplace Security Notification */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <Building2 size={15} className="text-slate-700" />
                <span>1. Internal Company Security & Manager</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Notify the executive whose identity was impersonated (Arun Kumar) and alert company accounts personnel against similar incoming calls.
              </p>
            </div>

            {/* Step 2: Designated Banking Alert */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                <Landmark size={15} className="text-slate-700" />
                <span>2. Corporate Banking Fraud Desk</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Contact corporate bank relationship team to place a temporary verification hold on high-value outbound wire transfers.
              </p>
            </div>
          </div>

          {/* Option/Pathway to route case to National Cybercrime Unit/Portal (Requirement #3) */}
          <div className="mt-4 p-4 rounded-xl border-2 border-blue-200 bg-blue-50/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-blue-950 text-sm flex items-center gap-2">
                  <span>National Cybercrime Unit / Portal Escalation</span>
                  <span className="px-2 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    SIMULATION / PROTOTYPE
                  </span>
                </div>
                <p className="text-xs text-blue-900 mt-0.5">
                  Route financial fraud / credential exposure evidence package directly to National Cybercrime authorities.
                </p>
              </div>

              {!incident.escalatedToCybercrimePortal ? (
                <button
                  onClick={handleEscalateToCybercrime}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer self-start sm:self-auto"
                >
                  <Send size={13} />
                  <span>Route to National Cybercrime Portal (Simulation)</span>
                </button>
              ) : (
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1.5">
                  <CheckCircle2 size={14} />
                  <span>Escalation Submitted (Simulation)</span>
                </span>
              )}
            </div>

            {incident.escalatedToCybercrimePortal && (
              <div className="p-3 bg-white rounded-lg border border-blue-200 text-xs space-y-1 animate-slow-fade">
                <div className="text-slate-700">
                  Routing Reference: <strong className="font-mono text-blue-800">{incident.cybercrimeEscalationRef}</strong>
                </div>
                <div className="text-slate-500 italic text-[11px]">
                  “Prototype: escalation workflow demonstrated. No external complaint was submitted.”
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="card-enterprise p-6 max-w-md w-full bg-white shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-blue-950 font-bold text-base">
              <ShieldCheck size={22} className="text-emerald-600" />
              <span>National Cybercrime Escalation Prepared</span>
            </div>
            <div className="text-xs text-slate-700 space-y-2">
              <p>
                Incident Reference: <strong className="font-mono">{incident.id}</strong>
              </p>
              <p className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 italic text-[11px]">
                “Prototype: escalation workflow demonstrated. No external complaint was submitted.”
              </p>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowConfirmationModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
