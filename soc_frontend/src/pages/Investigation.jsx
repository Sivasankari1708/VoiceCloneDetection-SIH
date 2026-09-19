// src/pages/Investigation.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { SeverityTag } from '../components/common/SeverityTag';
import { formatStatus } from '../utils/formatters';
import { Button } from '../components/common/Button';
import { ResolutionModal } from '../components/incidents/ResolutionModal';
import { AssignModal } from '../components/incidents/AssignModal';
import {
  ArrowLeft,
  ShieldAlert,
  UserCheck,
  AlertOctagon,
  CheckCircle,
  Clock,
  PhoneCall,
  User,
  Building2,
  FileCheck2,
  Lock,
  Send,
  AlertTriangle,
  Landmark,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  FileText,
  AlertCircle
} from 'lucide-react';

export function Investigation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { incidents, loading, acknowledge, escalate, resolve, update } = useIncidents();

  const [incident, setIncident] = useState(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCybercrimeModalOpen, setIsCybercrimeModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [cybercrimeRef, setCybercrimeRef] = useState(null);
  const [submittingCybercrime, setSubmittingCybercrime] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadIncident() {
      if (id) {
        try {
          const inc = await api.getIncidentById(id);
          if (inc && isMounted) {
            setIncident(inc);
            return;
          }
        } catch {
          // fallback to list
        }
      }
      if (incidents.length > 0 && isMounted) {
        const found = incidents.find((i) => i.id === id) || incidents[0];
        setIncident(found);
      }
    }
    loadIncident();
    return () => { isMounted = false; };
  }, [id, incidents]);

  if (loading && !incident) {
    return (
      <div className="p-12 text-center text-xs font-sans text-slate-500">
        Loading incident investigation workspace for {id}...
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-12 text-center text-xs font-sans text-slate-500 space-y-3">
        <div>Incident {id} not found in current investigation index.</div>
        <Link to="/incidents" className="text-blue-600 underline font-medium">
          Return to Incident Center
        </Link>
      </div>
    );
  }

  const statusMeta = formatStatus(incident.status);

  const showFeedback = (msg) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 4500);
  };

  const handleAcknowledge = async () => {
    await acknowledge(incident.id, 'Sarah Chen (SOC Lead)');
    showFeedback('Incident successfully acknowledged by Sarah Chen (SOC Lead).');
  };

  const handleEscalateManager = async () => {
    await escalate(incident.id, 'Escalated to Department Manager & Internal Corporate Security Desk.');
    showFeedback('Escalation dispatched: Department Head & Internal Security notified.');
  };

  const handleEscalateBank = async () => {
    await escalate(incident.id, 'Urgent escalation sent to Banking Partner Fraud Desk for account freeze.');
    showFeedback('Escalation dispatched: Banking Fraud Operations notified for originating account hold.');
  };

  const handleAssign = async (incidentId, analystName) => {
    await update(incidentId, { assignedAnalyst: analystName });
    showFeedback(`Incident reassigned to ${analystName}.`);
  };

  const handleRouteCybercrime = async () => {
    setSubmittingCybercrime(true);
    setTimeout(() => {
      const generatedRef = `NCRP-IN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      setCybercrimeRef(generatedRef);
      setSubmittingCybercrime(false);
      showFeedback(`Case successfully routed to National Cybercrime Reporting Portal. Reference: ${generatedRef}`);
    }, 1200);
  };

  // Plain-language What Happened description
  const narrative = incident.narrative || 
    `An inbound voice call was directed to ${incident.target?.name || 'Sreya Sengupta'} claiming to be ${incident.claimedIdentity?.name || 'Arun Kumar'}. The caller demanded immediate action under pretext of urgent financial payment verification and OTP authorization. The VoiceShield enterprise security engine identified synthetic voice manipulation and suspicious keyword patterns, placing the call on administrative hold and terminating the transmission prior to any credential or financial compromise.`;

  return (
    <div className="space-y-6 font-sans text-slate-800 pb-12">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{feedbackMessage}</span>
          </div>
          <button onClick={() => setFeedbackMessage('')} className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold">✕</button>
        </div>
      )}

      {/* Top Breadcrumb & Incident Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/incidents" className="hover:text-slate-800 flex items-center gap-1 font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Incident Center
          </Link>
          <span>/</span>
          <span className="text-slate-700 font-semibold">{incident.id}</span>
        </div>

        {/* 1. REPORTED INCIDENT (Header) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-base font-bold text-slate-900">{incident.id}</span>
              <SeverityTag severity={incident.severity} size="md" />
              <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${statusMeta.badge}`}>
                {statusMeta.label}
              </span>
              <span className="text-xs text-slate-500">• Channel: {incident.channel || 'Enterprise VoIP Ingress'}</span>
            </div>

            <h1 className="text-lg font-semibold text-slate-900 mt-1.5 tracking-tight">
              {incident.title}
            </h1>
          </div>

          {/* Core Status & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {incident.status === 'OPEN' && (
              <Button variant="secondary" size="sm" onClick={handleAcknowledge}>
                Acknowledge
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setIsAssignModalOpen(true)}>
              Assign ({incident.assignedAnalyst?.split(' ')[0] || 'Unassigned'})
            </Button>

            {incident.status !== 'RESOLVED' && incident.status !== 'FALSE_POSITIVE' && (
              <Button variant="primary" size="sm" onClick={() => setIsResolutionModalOpen(true)}>
                Resolve Incident
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 1. REPORTED INCIDENT (Metadata Strip) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Target Employee</span>
          <span className="text-xs text-slate-900 font-semibold block mt-1 truncate">{incident.target?.name || 'Sreya Sengupta'}</span>
          <span className="text-2xs text-slate-500 block truncate">{incident.target?.role || 'Citizen / Finance Executive'}</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Department</span>
          <span className="text-xs text-slate-900 font-semibold block mt-1">{incident.target?.department || 'Finance Operations'}</span>
          <span className="text-2xs text-slate-500 block truncate">{incident.target?.endpointId || 'EMP-FIN-4091'}</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Claimed Identity</span>
          <span className="text-xs text-red-700 font-semibold block mt-1 truncate">{incident.claimedIdentity?.name || 'Arun Kumar'}</span>
          <span className="text-2xs text-slate-500 block truncate">{incident.claimedIdentity?.role || 'Senior Executive — Finance'}</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Caller Origin</span>
          <span className="text-xs text-slate-900 font-semibold block mt-1 truncate">{incident.callerNumber || '+91 98450 11234'}</span>
          <span className="text-2xs text-slate-500 block">VoIP Carrier Route</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Assigned Analyst</span>
          <span className="text-xs text-slate-900 font-semibold block mt-1 truncate">{incident.assignedAnalyst || 'Sarah Chen (Lead)'}</span>
          <span className="text-2xs text-emerald-700 font-medium block">Active Investigation</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Incident Timestamp</span>
          <span className="text-xs text-slate-900 font-semibold block mt-1">{incident.createdAt?.split(' ')[1] || '10:14:02 IST'}</span>
          <span className="text-2xs text-slate-500 block">{incident.createdAt?.split(' ')[0] || '2026-09-15'}</span>
        </div>
      </div>

      {/* Main 2-Column Clean Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column (8 cols): What Happened, Incident Type & Exposure Assessment */}
        <div className="lg:col-span-8 space-y-6">

          {/* 2. WHAT HAPPENED */}
          <div className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
              <FileText className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                Incident Narrative & What Happened
              </h2>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {narrative}
            </p>

            {/* Observed Pretext & Protection Trigger */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <span className="text-2xs uppercase text-slate-500 font-semibold block">Observed Pretext</span>
                <span className="text-xs text-slate-900 font-semibold block mt-1">High-Urgency Executive Impersonation</span>
                <p className="text-xs text-slate-600 mt-1.5 leading-normal">
                  Caller claimed urgent administrative deadline, requested bypassing internal approval mechanisms, and pressured employee for instant authorization.
                </p>
              </div>

              <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                <span className="text-2xs uppercase text-emerald-800 font-semibold block">Autonomous Protective Action</span>
                <span className="text-xs text-emerald-900 font-semibold block mt-1">Call Intercepted & Disconnected</span>
                <p className="text-xs text-emerald-800/90 mt-1.5 leading-normal">
                  Call placed on hold, localized security advisory delivered to both parties, and audio transmission safely terminated before credentials were disclosed.
                </p>
              </div>
            </div>
          </div>

          {/* 3. RELEVANT INCIDENT TYPE */}
          <div className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                Relevant Incident Classification
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="px-3 py-1 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-semibold">
                Executive Voice Impersonation
              </span>
              <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-semibold">
                Urgent Financial Fraud / Wire Solicitation
              </span>
              <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs font-semibold">
                Credential & OTP Harvesting Attempt
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed pt-2">
              Categorized under <strong>CIRT Threat Category 4 (Advanced Social Engineering & Synthetic Pretexting)</strong>. 
              The adversary weaponized synthetic speech to impersonate organizational leadership with intent to facilitate fraudulent disbursements.
            </p>
          </div>

          {/* 4. WHETHER CREDENTIAL / FINANCIAL EXPOSURE IS POSSIBLE */}
          <div className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold tracking-tight text-slate-900">
                  Exposure Risk Assessment
                </h2>
              </div>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800">
                Zero Compromise Verified
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
                <div className="text-2xs uppercase text-slate-500 font-semibold">Potential Financial Exposure</div>
                <div className="text-sm font-bold text-slate-900">
                  ₹12,50,000 (~$15,000 USD) Attempted
                </div>
                <p className="text-xs text-slate-600">
                  Caller solicited immediate wire authorization to an unverified third-party vendor ledger.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
                <div className="text-2xs uppercase text-slate-500 font-semibold">Credential Exposure Status</div>
                <div className="text-sm font-bold text-emerald-700">
                  No Credentials or OTPs Disclosed
                </div>
                <p className="text-xs text-slate-600">
                  Employee did not enter single sign-on passwords, 2FA tokens, or corporate credentials.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-950">Mitigation Verified:</strong> Because the protective intervention executed during the request phase, all downstream bank accounts, corporate treasury rails, and enterprise credentials remain uncompromised.
              </div>
            </div>
          </div>

        </div>

        {/* Right Column (4 cols): Escalation Pathway & National Cybercrime Portal */}
        <div className="lg:col-span-4 space-y-6">

          {/* 5. THE APPROPRIATE ESCALATION PATHWAY */}
          <div className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
              <AlertOctagon className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                Appropriate Escalation Pathway
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              {/* Pathway 1: Internal Management / HR / Security */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Workplace Impersonation Pathway</span>
                </div>
                <p className="text-xs text-slate-600 leading-normal">
                  Route to Finance Department Head & Internal Corporate Security Desk to issue targeted advisory.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center text-xs mt-1"
                  onClick={handleEscalateManager}
                >
                  Notify Manager & Security Desk
                </Button>
              </div>

              {/* Pathway 2: Financial / Banking Fraud Operations */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-slate-900 font-semibold">
                  <Landmark className="w-4 h-4 text-amber-700" />
                  <span>Banking & Treasury Pathway</span>
                </div>
                <p className="text-xs text-slate-600 leading-normal">
                  Escalate to FinCorp Banking Partner Fraud Operations & flag originating caller account numbers.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center text-xs mt-1"
                  onClick={handleEscalateBank}
                >
                  Alert Banking Fraud Desk
                </Button>
              </div>
            </div>
          </div>

          {/* 6. OPTION / PATHWAY TO ROUTE TO NATIONAL CYBERCRIME UNIT / PORTAL */}
          <div className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
              <Send className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                National Cybercrime Portal
              </h2>
            </div>

            <div className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-red-900">NCRP Escalation Desk</span>
                <span className="text-2xs px-2 py-0.5 bg-red-100 text-red-800 rounded-md font-bold">
                  Helpline 1930
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-normal">
                Direct integration pathway to the <strong>National Cybercrime Reporting Portal (cybercrime.gov.in)</strong> for financial fraud attempt documentation.
              </p>

              {cybercrimeRef ? (
                <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <div className="font-semibold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Referral Submitted to NCRP</span>
                  </div>
                  <div className="text-xs font-bold text-emerald-800 mt-1">
                    Token: {cybercrimeRef}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Logged to audit chain for national regulatory compliance.
                  </div>
                </div>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full justify-center text-xs mt-1"
                  onClick={() => setIsCybercrimeModalOpen(true)}
                  disabled={submittingCybercrime}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  <span>Route to National Cybercrime Portal</span>
                </Button>
              )}
            </div>

            <div className="text-xs text-slate-500 leading-normal">
              Official referral transmits caller ingress identifier, timestamped audio transcript snippets, and fraud classification.
            </div>
          </div>

          {/* Quick Case Resolution Record */}
          <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs text-xs space-y-2.5">
            <div className="text-2xs uppercase text-slate-500 font-semibold">Case Status</div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">{incident.status}</span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsResolutionModalOpen(true)}
              >
                Document Verdict
              </Button>
            </div>
          </div>

        </div>

      </div>

      {/* Cybercrime Referral Confirmation Modal */}
      {isCybercrimeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">National Cybercrime Portal Referral</h3>
                  <p className="text-xs text-slate-500">Citizen Financial Cyber Fraud Reporting (1930 / cybercrime.gov.in)</p>
                </div>
              </div>
              <button
                onClick={() => setIsCybercrimeModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <p className="text-xs text-slate-600">
                You are preparing an official escalation package for the National Cybercrime Reporting Portal:
              </p>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Incident Reference:</span>
                  <span className="font-semibold text-slate-900">{incident.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Employee:</span>
                  <span className="text-slate-800">{incident.target?.name} ({incident.target?.department})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Impersonated Executive:</span>
                  <span className="text-red-700 font-semibold">{incident.claimedIdentity?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Suspect Caller Origin:</span>
                  <span className="text-slate-800">{incident.callerNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Attempted Exposure:</span>
                  <span className="text-amber-800 font-semibold">₹12,50,000 (Payment Diversion Pretext)</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                <strong>Demonstration Mode:</strong> Forwarding will generate an official receipt token and log this action into the enterprise audit chain.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCybercrimeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setIsCybercrimeModalOpen(false);
                  handleRouteCybercrime();
                }}
              >
                Confirm & Dispatch to Portal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution Modal */}
      <ResolutionModal
        isOpen={isResolutionModalOpen}
        onClose={() => setIsResolutionModalOpen(false)}
        incident={incident}
        onResolve={resolve}
      />

      {/* Assign Modal */}
      <AssignModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        incident={incident}
        onAssign={handleAssign}
      />
    </div>
  );
}

