// src/components/incidents/FinancialFraudReportModal.jsx
import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ShieldAlert, AlertTriangle, Send, CheckCircle2, Lock, Info } from 'lucide-react';

export function FinancialFraudReportModal({ isOpen, onClose, incident, onComplete }) {
  const [reportType, setReportType] = useState('UNAUTHORIZED_FINANCIAL_SOLICITATION');
  const [urgencyLevel, setUrgencyLevel] = useState('IMMEDIATE_INTERCEPTION');
  const [officerNotes, setOfficerNotes] = useState(
    'Suspect placed unsolicited call soliciting OTP and banking wire transfer under executive impersonation.'
  );
  const [phase, setPhase] = useState('form'); // 'form' | 'simulation'

  if (!incident) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Transition to simulation disclosure — no real API call
    setPhase('simulation');
    onComplete?.({
      routedTo: 'National Cyber Crime Reporting Portal (NCRP / 1930)',
      incidentId: incident.id,
      timestamp: new Date().toISOString(),
    });
  };

  const handleClose = () => {
    setPhase('form');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="National Cyber Crime Reporting Portal — Financial Fraud Routing"
      size="lg"
    >
      <div className="space-y-4 font-mono text-xs text-slate-300">

        {/* === Simulation disclosure screen === */}
        {phase === 'simulation' && (
          <div className="space-y-4 text-center py-4">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-blue-950/50 border border-blue-700 flex items-center justify-center">
                <Info className="w-8 h-8 text-blue-400" />
              </div>
            </div>
            <div>
              <div className="text-base font-bold text-slate-100 mb-1">Prototype Simulation</div>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                External National Cyber Crime Portal submission is not connected in the current prototype.
              </p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed max-w-sm mx-auto">
                The SOC has been prepared for the escalation path. In a production deployment, this would route a structured
                report to the NCRP (1930 Helpline) / Financial Fraud Division.
              </p>
            </div>
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded text-left space-y-1.5">
              <span className="text-2xs text-slate-500 uppercase font-semibold block">Prepared Dispatch Package</span>
              <div className="flex justify-between text-2xs">
                <span className="text-slate-400">Incident Reference:</span>
                <span className="text-slate-200 font-bold">{incident.id}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-slate-400">Affected Employee:</span>
                <span className="text-slate-200">{incident.target?.name || 'Protected User'}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-slate-400">Caller Identity:</span>
                <span className="text-red-300">{incident.claimedIdentity?.name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between text-2xs">
                <span className="text-slate-400">Classification:</span>
                <span className="text-slate-200">{reportType.replace(/_/g, ' ')}</span>
              </div>
            </div>
            <Button variant="primary" size="sm" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}

        {/* === Form screen === */}
        {phase === 'form' && (
          <>
            {/* Banner with clear simulation disclosure */}
            <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-md text-red-200 flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold uppercase tracking-wider text-2xs text-red-300 flex items-center gap-2">
                  <span>Possible Credential / Financial Information Exposure</span>
                  <span className="bg-red-900/60 text-red-200 px-1.5 py-0.5 rounded text-[10px] border border-red-700">
                    Simulation Workflow
                  </span>
                </div>
                <p className="text-2xs text-slate-300 mt-1 leading-relaxed">
                  This workflow routes verified voice impersonation threats to the National Cyber Crime Portal (1930 Financial Fraud Helpline) to initiate preventive core-banking freezes.
                </p>
                <p className="text-2xs text-slate-400 mt-1 italic">
                  *Prototype Demonstration: Does not execute live external government API calls.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">Victim / Target Employee</span>
                  <span className="text-xs text-slate-200 font-bold block mt-0.5">{incident.target?.name || 'Protected User'}</span>
                  <span className="text-2xs text-slate-400 block">{incident.target?.department}</span>
                </div>

                <div className="p-2.5 bg-slate-900 rounded border border-slate-800">
                  <span className="text-2xs text-slate-500 uppercase block font-semibold">Suspect Ingress Number</span>
                  <span className="text-xs text-red-300 font-bold block mt-0.5">{incident.callerNumber || 'Unknown'}</span>
                  <span className="text-2xs text-slate-400 block">Claimed: {incident.claimedIdentity?.name}</span>
                </div>
              </div>

              <div>
                <label className="block text-2xs text-slate-400 uppercase font-semibold mb-1">
                  National Portal Classification
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-soc-accent"
                >
                  <option value="UNAUTHORIZED_FINANCIAL_SOLICITATION">
                    NCRP-1930: Unauthorized Financial &amp; Wire Transfer Solicitation
                  </option>
                  <option value="OTP_CREDENTIAL_EXTRACTION">
                    NCRP-1930: Social Engineering / OTP &amp; Net Banking Extraction
                  </option>
                  <option value="EXECUTIVE_IMPERSONATION_FRAUD">
                    NCRP-1930: CEO / Executive Impersonation Financial Mandate
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-2xs text-slate-400 uppercase font-semibold mb-1">
                  Priority Escalation Level
                </label>
                <select
                  value={urgencyLevel}
                  onChange={(e) => setUrgencyLevel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-soc-accent"
                >
                  <option value="IMMEDIATE_INTERCEPTION">Immediate Priority (Account / Freeze Precaution)</option>
                  <option value="STANDARD_INVESTIGATION">Standard Evidentiary Referral</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs text-slate-400 uppercase font-semibold mb-1">
                  Investigator Synopsis for NCRP Desk
                </label>
                <textarea
                  rows={3}
                  value={officerNotes}
                  onChange={(e) => setOfficerNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
                  placeholder="Add investigator observations..."
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div className="text-2xs text-slate-500 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>NCRP Prototype Routing</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button variant="danger" size="sm" type="submit" icon={Send}>
                    Proceed to Financial Fraud Reporting
                  </Button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}

export default FinancialFraudReportModal;
