// src/pages/Investigation.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { SeverityTag } from '../components/common/SeverityTag';
import { formatStatus, getRiskColor, getRiskBarColor } from '../utils/formatters';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { RiskOverTimeChart } from '../components/incidents/RiskOverTimeChart';
import { DetectionEvidenceCard } from '../components/incidents/DetectionEvidenceCard';
import { IdentityVerificationCard } from '../components/incidents/IdentityVerificationCard';
import { ConversationIntelligenceCard } from '../components/incidents/ConversationIntelligenceCard';
import { ExplainabilityCard } from '../components/incidents/ExplainabilityCard';
import { IncidentTimeline } from '../components/incidents/IncidentTimeline';
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
  Share2,
  Send,
  AlertTriangle
} from 'lucide-react';

export function Investigation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { incidents, loading, acknowledge, escalate, resolve, update } = useIncidents();

  const [incident, setIncident] = useState(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
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
        Loading investigation workspace for {id}...
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
  const riskColor = getRiskColor(incident.riskScore);

  const showFeedback = (msg) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 4000);
  };

  const handleAcknowledge = async () => {
    await acknowledge(incident.id, 'Sarah Chen (SOC Lead)');
    showFeedback('Incident successfully acknowledged by Sarah Chen (SOC Lead).');
  };

  const handleEscalate = async () => {
    await escalate(incident.id, 'Escalated by Tier-3 SOC analyst to CIRT.');
    showFeedback('Incident escalated to CIRT & Executive Security Desk.');
  };

  const handleAssign = async (incidentId, analystName) => {
    await update(incidentId, { assignedAnalyst: analystName });
    showFeedback(`Incident reassigned to ${analystName}.`);
  };

  const handleVerifyIdentityCallback = () => {
    showFeedback('Secondary Out-of-Band Callback initiated to registered executive device.');
  };

  const handleRequestVerification = () => {
    showFeedback('Additional Verification prompt dispatched to target receiver endpoint.');
  };

  return (
    <div className="space-y-6 font-mono pb-12">
      {/* Toast Feedback Notification */}
      {feedbackMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs rounded-md flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{feedbackMessage}</span>
          </div>
          <button onClick={() => setFeedbackMessage('')} className="text-emerald-400 hover:text-emerald-200">✕</button>
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

          {/* Quick Action Buttons */}
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

            {incident.status !== 'RESOLVED' && incident.status !== 'FALSE_POSITIVE' && incident.status !== 'CONFIRMED_ATTACK' ? (
              <Button variant="primary" size="sm" onClick={() => setIsResolutionModalOpen(true)}>
                Resolve Incident
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIsResolutionModalOpen(true)}>
                Update Verdict
              </Button>
            )}
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
          <span className="text-xs text-slate-200 font-bold block mt-1">{incident.createdAt?.split(' ')[1] || 'N/A'}</span>
          <span className="text-2xs text-slate-400 block">{incident.createdAt?.split(' ')[0]}</span>
        </div>
      </div>

      {/* Resolution Verdict Banner (If Resolved) */}
      {incident.resolution && (
        <div className="p-4 bg-slate-900/90 border border-slate-700 rounded-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xs uppercase tracking-widest text-slate-400 font-bold">
              Official Resolution Record
            </span>
            <span className="text-2xs text-slate-500">Resolved at: {incident.resolution.resolvedAt}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 uppercase">Final Verdict:</span>
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${formatStatus(incident.resolution.verdict).badge}`}>
              {formatStatus(incident.resolution.verdict).label}
            </span>
            <span className="text-2xs text-slate-400 font-mono">• Investigator: {incident.resolution.resolvedBy}</span>
          </div>
          <p className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded border border-slate-800">
            {incident.resolution.reason}
          </p>
        </div>
      )}

      {/* Main Analysis Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Risk & Detection Details */}
        <div className="lg:col-span-8 space-y-6">
          {/* Overall Risk & Risk Breakdown */}
          <Card title="Overall Risk Scoring & Biometric Breakdown">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Overall Risk Gauge */}
              <div className="md:col-span-4 p-4 rounded bg-slate-900/60 border border-slate-800 text-center flex flex-col justify-center">
                <span className="text-2xs text-slate-500 uppercase tracking-widest block font-semibold">
                  Synthesized Risk Score
                </span>
                <div className="my-2">
                  <span className={`text-4xl font-black ${riskColor}`}>
                    {incident.riskScore}
                  </span>
                  <span className="text-sm font-bold text-slate-500"> / 100</span>
                </div>
                <div className="mt-1">
                  <span className={`px-2.5 py-1 rounded text-xs font-bold tracking-wider ${incident.overallRisk?.level === 'CRITICAL' ? 'bg-red-950/80 text-red-300 border border-red-700' : 'bg-orange-950/80 text-orange-300 border border-orange-700'}`}>
                    {incident.overallRisk?.level || incident.severity}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 mt-2">
                  Recommended Action: <strong className="text-slate-300">{incident.overallRisk?.recommendation || 'ESCALATE'}</strong>
                </span>
              </div>

              {/* Sub-Risk Breakdown Bars */}
              <div className="md:col-span-8 space-y-2.5">
                <div>
                  <div className="flex justify-between text-2xs mb-1">
                    <span className="text-slate-400">Voice Authenticity (Acoustic Deepfake Likelihood)</span>
                    <strong className="text-red-400">{incident.riskBreakdown?.voiceAuthenticity}%</strong>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${incident.riskBreakdown?.voiceAuthenticity}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-2xs mb-1">
                    <span className="text-slate-400">Identity Risk (Biometric Separation Distance)</span>
                    <strong className="text-red-400">{incident.riskBreakdown?.identityRisk}%</strong>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500" style={{ width: `${incident.riskBreakdown?.identityRisk}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-2xs mb-1">
                    <span className="text-slate-400">Conversation Risk (Urgency & Fraud Intent)</span>
                    <strong className="text-amber-400">{incident.riskBreakdown?.conversationRisk}%</strong>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${incident.riskBreakdown?.conversationRisk}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-2xs mb-1">
                    <span className="text-slate-400">Contextual Risk (Target Vulnerability & Timing)</span>
                    <strong className="text-orange-400">{incident.riskBreakdown?.contextualRisk}%</strong>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500" style={{ width: `${incident.riskBreakdown?.contextualRisk}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-2xs mb-1">
                    <span className="text-slate-500">Transaction Risk (External Core Banking Wire)</span>
                    <span className="text-slate-500">N/A (Integration Not Configured)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Risk Over Time Chart */}
            <div className="mt-5 pt-4 border-t border-soc-border">
              <RiskOverTimeChart data={incident.riskOverTime} />
            </div>
          </Card>

          {/* Detection Evidence (Section 9) */}
          <DetectionEvidenceCard evidence={incident.detectionEvidence} />

          {/* Identity Biometric Verification (Section 10) */}
          <IdentityVerificationCard
            identityDetails={incident.identityDetails}
            claimedIdentity={incident.claimedIdentity}
          />

          {/* Conversational Intelligence (Section 11) */}
          <ConversationIntelligenceCard intelligence={incident.conversationIntelligence} />
        </div>

        {/* Right Column: Explainability, Actions & Timeline */}
        <div className="lg:col-span-4 space-y-6">
          {/* Response Actions (Section 14) */}
          <Card title="Operational SOC Response Actions">
            <div className="space-y-2.5 font-mono text-xs">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleVerifyIdentityCallback}
                icon={PhoneCall}
              >
                Trigger Out-of-Band Callback
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleRequestVerification}
                icon={ShieldAlert}
              >
                Request Endpoint Step-Up MFA
              </Button>

              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                onClick={() => setIsAssignModalOpen(true)}
                icon={UserCheck}
              >
                Reassign Case Specialist
              </Button>

              <Button
                variant="danger"
                size="sm"
                className="w-full justify-start"
                onClick={handleEscalate}
                icon={AlertOctagon}
                disabled={incident.status === 'ESCALATED'}
              >
                Escalate to Enterprise CIRT
              </Button>

              <div className="pt-2 border-t border-soc-border space-y-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={() => setIsResolutionModalOpen(true)}
                  icon={FileCheck2}
                >
                  Document Verdict / Resolve Case
                </Button>

                {/* Realism: Mark unavailable enterprise PBX integrations as Coming Soon */}
                <div className="p-2.5 bg-slate-950/60 border border-dashed border-slate-800 rounded text-2xs text-slate-500">
                  <div className="font-semibold text-slate-400 mb-0.5">Automated Call Termination:</div>
                  PSTN/PBX hardware disconnect adapter: <span className="text-amber-400">Request Preventive Action</span> (Coming Soon via SIP trunk connector).
                </div>
              </div>
            </div>
          </Card>

          {/* Explainability (Section 12) */}
          <ExplainabilityCard explainability={incident.explainability} />

          {/* Chronological Incident Timeline (Section 13) */}
          <IncidentTimeline timeline={incident.timeline} />
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
    </div>
  );
}
