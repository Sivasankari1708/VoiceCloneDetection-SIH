// src/pages/Investigation.jsx
// VoiceShield Enterprise SOC — Event Reporting & Response Center
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { SeverityTag } from '../components/common/SeverityTag';
import { formatStatus } from '../utils/formatters';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { IncidentTimeline } from '../components/incidents/IncidentTimeline';
import { ResolutionModal } from '../components/incidents/ResolutionModal';
import { AssignModal } from '../components/incidents/AssignModal';
import { FinancialFraudReportModal } from '../components/incidents/FinancialFraudReportModal';
import {
  ArrowLeft,
  ShieldAlert,
  AlertOctagon,
  CheckCircle,
  PhoneCall,
  FileCheck2,
  FileText,
  ShieldCheck,
} from 'lucide-react';

export function Investigation() {
  const { id } = useParams();
  const { incidents, loading, acknowledge, escalate, resolve, update } = useIncidents();

  const [incident, setIncident] = useState(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isFraudModalOpen, setIsFraudModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  useEffect(() => {
    if (incidents.length > 0) {
      const found = incidents.find((i) => i.id === id) || incidents[0];
      setIncident(found);
    }
  }, [id, incidents]);

  if (loading && !incident) {
    return (
      <div className="p-12 text-center text-xs font-mono text-slate-500">
        Loading incident event workspace for {id}...
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-12 text-center text-xs font-mono text-slate-400 space-y-3">
        <div>Incident {id} not found in current investigation index.</div>
        <Link to="/incidents" className="text-soc-accent underline">
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
    showFeedback('Incident acknowledged by Sarah Chen (SOC Lead).');
  };

  const handleEscalate = async () => {
    await escalate(incident.id, 'Escalated by Tier-3 SOC analyst to CIRT.');
    showFeedback('Incident escalated to CIRT & Executive Security Desk.');
  };

  const handleAssign = async (incidentId, analystName) => {
    await update(incidentId, { assignedAnalyst: analystName });
    showFeedback(`Incident reassigned to ${analystName}.`);
  };

  const handleUserCallback = () => {
    showFeedback('Out-of-Band Callback placed to target employee (Simulation).');
  };

  const handleFraudReportComplete = (details) => {
    showFeedback(`Draft report routed to National Cyber Crime Portal (1930 Helpline) — Reference: ${details.incidentId} (Simulation).`);
  };

  // Determine possible credential / financial exposure
  const isCredentialOrFinancialExposure =
    incident.severity === 'CRITICAL' ||
    (incident.intent && incident.intent.includes('FINANCIAL')) ||
    (incident.scenario && incident.scenario.toLowerCase().includes('wire')) ||
    (incident.conversationIntelligence?.sensitiveKeywords || []).some(
      (k) =>
        k.toLowerCase().includes('wire') ||
        k.toLowerCase().includes('otp') ||
        k.toLowerCase().includes('transfer') ||
        k.toLowerCase().includes('authorization')
    );

  // User intervention status
  const userInterventionStatus = incident.status === 'CONFIRMED_ATTACK'
    ? 'PROTECTED AUTOMATICALLY (SIMULATION)'
    : incident.status === 'RESOLVED'
    ? 'RESOLVED BY OPERATOR'
    : 'PROTECTED AUTOMATICALLY (SIMULATION)';

  // Structured Intervention Timeline (Objective 8)
  const interventionTimeline = [
    {
      id: 'tl-1',
      time: '13:21:02',
      event: 'Suspicious conversation anomalies detected.',
      severity: 'HIGH',
    },
    {
      id: 'tl-2',
      time: '13:21:04',
      event: 'Employee prompted to verify caller.',
      severity: 'MEDIUM',
    },
    {
      id: 'tl-3',
      time: '13:21:06',
      event: 'Active Challenge Presented to caller (Liveness/Verification Check).',
      severity: 'INFO',
    },
    {
      id: 'tl-4',
      time: '13:21:08',
      event: 'Verification Failed. Active liveness check unsuccessful.',
      severity: 'CRITICAL',
    },
    {
      id: 'tl-5',
      time: '13:21:10',
      event: 'Protective action: Call placed on hold (Simulation).',
      severity: 'CRITICAL',
    },
    {
      id: 'tl-6',
      time: '13:21:14',
      event: 'Session severed by VoiceShield automated protection protocol (Simulation).',
      severity: 'CRITICAL',
    },
    {
      id: 'tl-7',
      time: '13:21:15',
      event: 'Security incident registered and routed to Enterprise SOC queue.',
      severity: 'INFO',
    },
  ];

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div className="p-3 bg-blue-950/80 border border-blue-700 text-blue-200 text-xs rounded-md flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-400" />
            <span>{feedbackMessage}</span>
          </div>
          <button onClick={() => setFeedbackMessage('')} className="text-blue-400 hover:text-blue-200 cursor-pointer">✕</button>
        </div>
      )}

      {/* Top Breadcrumb & Incident Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-2xs text-slate-500">
          <Link to="/incidents" className="hover:text-slate-300 flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Incident Center
          </Link>
          <span>/</span>
          <span className="text-slate-300">{incident.id}</span>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-soc-card border border-soc-border rounded-md">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-base font-bold text-slate-100">{incident.id}</span>
              <SeverityTag severity={incident.severity} size="md" />
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusMeta.badge}`}>
                {statusMeta.label}
              </span>
              <span className="text-xs text-slate-500">• Ingress Channel: {incident.channel}</span>
            </div>

            <h1 className="text-base font-semibold text-slate-100 mt-1.5">
              {incident.title}
            </h1>
          </div>

          {/* Quick Action Header Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {incident.status === 'OPEN' && (
              <Button variant="secondary" size="sm" onClick={handleAcknowledge}>
                Acknowledge
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setIsAssignModalOpen(true)}>
              Assign ({incident.assignedAnalyst?.split(' ')[0] || 'Unassigned'})
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={handleEscalate}
              disabled={incident.status === 'ESCALATED'}
            >
              {incident.status === 'ESCALATED' ? 'Escalated to CIRT' : 'Escalate to CIRT'}
            </Button>

            <Button variant="primary" size="sm" onClick={() => setIsResolutionModalOpen(true)}>
              Resolve Incident
            </Button>
          </div>
        </div>
      </div>

      {/* Incident Metadata Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Target Employee</span>
          <span className="text-xs text-slate-200 font-bold block mt-1 truncate">{incident.target?.name}</span>
          <span className="text-2xs text-slate-400 block truncate">{incident.target?.role}</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Department</span>
          <span className="text-xs text-slate-200 font-bold block mt-1">{incident.target?.department}</span>
          <span className="text-2xs text-slate-400 block truncate">{incident.target?.endpointId}</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Claimed Identity</span>
          <span className="text-xs text-red-300 font-bold block mt-1 truncate">{incident.claimedIdentity?.name}</span>
          <span className="text-2xs text-slate-400 block truncate">{incident.claimedIdentity?.role}</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Caller Origin</span>
          <span className="text-xs text-slate-200 font-bold block mt-1 truncate">{incident.callerNumber}</span>
          <span className="text-2xs text-slate-400 block">Duration: {incident.duration}</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Assigned Analyst</span>
          <span className="text-xs text-slate-200 font-bold block mt-1 truncate">{incident.assignedAnalyst || 'Unassigned'}</span>
          <span className="text-2xs text-emerald-400 block">Tier-3 Active</span>
        </div>

        <div className="p-3 bg-soc-card border border-soc-border rounded">
          <span className="text-2xs text-slate-500 uppercase block font-semibold">Timestamp</span>
          <span className="text-xs text-slate-200 font-bold block mt-1">{incident.createdAt?.split(' ')[1] || '13:21:15'}</span>
          <span className="text-2xs text-slate-400 block">{incident.createdAt?.split(' ')[0] || '2026-09-13'}</span>
        </div>
      </div>

      {/* Main Grid: Event Reporting & Limited Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): Event Summary, Exposure, User Intervention Status */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: What Happened? (Event Overview) */}
          <Card title="Event Summary & Threat Description">
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-900/80 rounded border border-slate-800 text-xs leading-relaxed text-slate-300">
                <div className="font-bold text-slate-100 mb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-soc-accent" />
                  <span>Threat Event Description</span>
                </div>
                <p>
                  Caller claiming to be <strong className="text-red-300">{incident.claimedIdentity?.name}</strong> placed an unsolicited call to employee <strong className="text-slate-100">{incident.target?.name}</strong> ({incident.target?.department}). The caller exerted artificial urgency to solicit sensitive authorization and financial wire execution.
                </p>
              </div>

              {/* What Action Was Taken? */}
              <div className="p-3.5 bg-slate-900/80 rounded border border-slate-800 text-xs leading-relaxed text-slate-300">
                <div className="font-bold text-slate-100 mb-1 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Protective Action Taken</span>
                </div>
                <p>
                  VoiceShield real-time defense intercepted the request. The client interface broadcasted an in-call security warning, placed the call on hold, and executed protective termination before sensitive credentials were exchanged.
                </p>
              </div>

              {/* Language & Region Context (Objective 12) */}
              <div className="p-3 bg-slate-900/50 rounded border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-2xs text-slate-500 uppercase font-semibold block">Warning Language</span>
                  <span className="font-bold text-slate-200">English (with Regional Support)</span>
                </div>
                <div>
                  <span className="text-2xs text-slate-500 uppercase font-semibold block">Region Context</span>
                  <span className="font-bold text-slate-200">Tamil Nadu (SIM context)</span>
                </div>
                <div className="text-2xs text-slate-400 italic max-w-xs sm:text-right">
                  *Region context provided for routing assistance only; does not infer authenticity.
                </div>
              </div>
            </div>
          </Card>

          {/* Card 2: Possible Credential / Financial Exposure & User Intervention Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Box A: Possible Exposure */}
            <Card title="Information Exposure Assessment">
              <div className="space-y-3 text-xs">
                {isCredentialOrFinancialExposure ? (
                  <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-200 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-red-300">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                      <span>POSSIBLE CREDENTIAL EXPOSURE DETECTED</span>
                    </div>
                    <p className="text-2xs text-slate-300 leading-relaxed">
                      Urgent financial transfer or authentication codes were solicited during this call session.
                    </p>
                    <div className="text-[11px] text-red-300 font-semibold pt-1">
                      Immediate employee callback and banking verification advised.
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    <span className="text-emerald-400 font-bold">No Confirmed Credential Disclosure</span>
                    <p className="text-2xs text-slate-400 mt-1">
                      No passwords, OTPs, or financial secrets confirmed during call dialogue.
                    </p>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-2xs text-slate-500 uppercase font-semibold block">Solicited Indicators</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(incident.conversationIntelligence?.sensitiveKeywords || ['urgent wire transfer', 'immediate authorization']).map(
                      (kw, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-2xs bg-slate-800 text-slate-300 border border-slate-700"
                        >
                          {kw}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Box B: User Intervention Status (Objective 9) */}
            <Card title="User Endpoint Intervention Status">
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded bg-blue-950/40 border border-blue-800 text-blue-200">
                  <span className="text-2xs text-blue-400 font-bold uppercase tracking-wider block">
                    Current Intervention Event
                  </span>
                  <div className="text-sm font-bold text-white mt-1">
                    {userInterventionStatus}
                  </div>
                  <p className="text-2xs text-slate-300 mt-1 leading-relaxed">
                    Employee received real-time critical warning and automated protective hold sequence before disconnecting.
                  </p>
                </div>

                <div className="space-y-1.5 text-2xs text-slate-400">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Protective Hold Triggered:</span>
                    <strong className="text-slate-200">Yes (Simulation)</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Security Announcement Played:</span>
                    <strong className="text-slate-200">Yes (Simulation)</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Call Status:</span>
                    <strong className="text-red-400">Terminated (Simulation)</strong>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Right Column (4 cols): Limited Actions & Intervention Timeline */}
        <div className="lg:col-span-4 space-y-6">
          {/* Limited Response Options (Objective 10 & 11) */}
          <Card title="Operational Response Options">
            <div className="space-y-2.5 font-mono text-xs">
              {/* Action 1: Contact / Callback User */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleUserCallback}
                icon={PhoneCall}
              >
                Contact / Callback User (Simulation)
              </Button>

              {/* Action 2: Conditional Report Financial Fraud */}
              {isCredentialOrFinancialExposure && (
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full justify-start border-red-700 bg-red-950/70 hover:bg-red-900/80 text-red-200"
                  onClick={() => setIsFraudModalOpen(true)}
                  icon={ShieldAlert}
                >
                  Report Financial Fraud (1930 NCRP)
                </Button>
              )}

              {/* Action 3: Escalate */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleEscalate}
                icon={AlertOctagon}
                disabled={incident.status === 'ESCALATED'}
              >
                {incident.status === 'ESCALATED' ? 'Escalated to CIRT' : 'Escalate to Enterprise CIRT'}
              </Button>

              {/* Action 4: Resolve */}
              <Button
                variant="primary"
                size="sm"
                className="w-full justify-start"
                onClick={() => setIsResolutionModalOpen(true)}
                icon={FileCheck2}
              >
                Resolve Incident & Record Verdict
              </Button>

              <div className="p-2.5 bg-slate-950/60 border border-dashed border-slate-800 rounded text-2xs text-slate-500 mt-2">
                <span className="font-semibold text-slate-400 block mb-0.5">Response Protocol Notice:</span>
                All telecom callbacks and external reporting workflows are operated in prototype simulation mode.
              </div>
            </div>
          </Card>

          {/* Intervention Timeline (Objective 8) */}
          <IncidentTimeline timeline={interventionTimeline} />
        </div>
      </div>

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

      {/* Financial Fraud Reporting Modal (Objective 11) */}
      <FinancialFraudReportModal
        isOpen={isFraudModalOpen}
        onClose={() => setIsFraudModalOpen(false)}
        incident={incident}
        onComplete={handleFraudReportComplete}
      />
    </div>
  );
}

export default Investigation;
