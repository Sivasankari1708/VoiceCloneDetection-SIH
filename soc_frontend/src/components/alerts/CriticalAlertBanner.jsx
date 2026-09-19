// src/components/alerts/CriticalAlertBanner.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowRight, X, ShieldAlert } from 'lucide-react';
import { Button } from '../common/Button';

export function CriticalAlertBanner({ incident, onAcknowledge, onEscalate }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  if (!incident || dismissed) return null;

  const handleAcknowledge = async () => {
    setLoadingAction(true);
    await onAcknowledge(incident.id);
    setLoadingAction(false);
  };

  const handleEscalate = async () => {
    setLoadingAction(true);
    await onEscalate(incident.id);
    setLoadingAction(false);
  };

  const handleInvestigate = () => {
    navigate(`/investigations/${incident.id}`);
  };

  return (
    <div className="bg-red-50/90 border border-red-200/90 rounded-xl p-4 sm:p-5 mb-6 relative shadow-xs">
      <button 
        onClick={() => setDismissed(true)}
        className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
        title="Dismiss alert banner"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Warning Info */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-red-100/90 border border-red-200 flex items-center justify-center text-red-700 shrink-0 mt-0.5">
            <AlertOctagon className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-sans text-xs font-semibold px-2.5 py-0.5 bg-red-100/80 text-red-800 border border-red-200 rounded-md">
                Critical Security Intervention
              </span>
              <span className="font-sans text-xs text-slate-700 font-semibold">{incident.id}</span>
              <span className="text-xs text-slate-500">• {incident.channel || 'VoIP Ingress'}</span>
            </div>

            <h2 className="text-sm font-semibold text-slate-900 mt-1">
              Active Executive Voice Impersonation Detected
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 mt-2 text-xs font-sans text-slate-700">
              <div>
                <span className="text-slate-500">Claimed Executive: </span>
                <span className="font-semibold text-red-700">{incident.claimedIdentity?.name || 'Chief Financial Officer'}</span>
              </div>
              <div>
                <span className="text-slate-500">Target Employee: </span>
                <span className="font-semibold text-slate-900">{incident.target?.name || 'Finance Executive'}</span>
              </div>
              <div>
                <span className="text-slate-500">Protection Action: </span>
                <span className="font-semibold text-emerald-700">Autonomous Hold & Intervention</span>
              </div>
            </div>

            {/* Key Security Observations */}
            <div className="mt-2 text-xs font-sans text-slate-600 flex items-center gap-3 flex-wrap">
              <span className="text-slate-500 font-semibold text-2xs uppercase">Threat Indicators:</span>
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                • Synthetic Voice Inconsistency
              </span>
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                • Biometric Identity Mismatch
              </span>
              <span className="inline-flex items-center gap-1 text-amber-800">
                • Urgent Financial Disbursement Request
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAcknowledge}
            disabled={loadingAction || incident.status === 'UNDER_INVESTIGATION'}
          >
            {incident.status === 'UNDER_INVESTIGATION' ? 'Acknowledged' : 'Acknowledge'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleInvestigate}
            icon={ArrowRight}
          >
            Investigate Incident
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={handleEscalate}
            disabled={loadingAction || incident.status === 'ESCALATED'}
          >
            {incident.status === 'ESCALATED' ? 'Escalated' : 'Escalate (CIRT)'}
          </Button>
        </div>
      </div>
    </div>
  );
}

