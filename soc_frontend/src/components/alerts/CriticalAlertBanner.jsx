// src/components/alerts/CriticalAlertBanner.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, ArrowRight, ShieldAlert, X } from 'lucide-react';
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
    <div className="bg-red-950/40 border border-red-800/80 rounded-lg p-4 mb-6 relative shadow-lg shadow-red-950/20">
      <button 
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-red-400/60 hover:text-red-300 p-1 rounded"
        title="Dismiss banner"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Warning Info */}
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded bg-red-900/60 border border-red-600/80 flex items-center justify-center text-red-300 shrink-0 mt-0.5 animate-pulse">
            <AlertOctagon className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-2xs font-bold uppercase tracking-widest px-2 py-0.5 bg-red-900/80 text-red-200 border border-red-600 rounded">
                CRITICAL SECURITY ALERT
              </span>
              <span className="font-mono text-xs text-red-300 font-semibold">{incident.id}</span>
              <span className="text-xs text-slate-400 font-mono">• {incident.channel}</span>
            </div>

            <h2 className="text-sm font-semibold text-slate-100 mt-1">
              Potential voice impersonation attack detected.
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 mt-2 text-xs font-mono text-slate-300">
              <div>
                <span className="text-slate-500">Claimed Identity: </span>
                <span className="font-semibold text-red-300">{incident.claimedIdentity?.name || 'CFO'}</span>
              </div>
              <div>
                <span className="text-slate-500">Target: </span>
                <span className="font-semibold text-slate-200">{incident.target?.name || 'Finance Officer'}</span>
              </div>
              <div>
                <span className="text-slate-500">Risk: </span>
                <span className="font-bold text-red-400">{incident.riskScore} / 100 (CRITICAL)</span>
              </div>
            </div>

            {/* Evidence List */}
            <div className="mt-2 text-2xs font-mono text-slate-300 flex items-center gap-3 flex-wrap">
              <span className="text-slate-500 font-semibold uppercase">Evidence:</span>
              <span className="inline-flex items-center gap-1 text-red-300">
                • High synthetic-voice probability ({Math.round(incident.detectionEvidence?.syntheticProbability * 100)}%)
              </span>
              <span className="inline-flex items-center gap-1 text-red-300">
                • Speaker identity conflict ({incident.detectionEvidence?.identityVerification})
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300">
                • Sensitive financial request
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300">
                • Urgency detected
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
            {incident.status === 'UNDER_INVESTIGATION' ? 'ACKNOWLEDGED' : 'ACKNOWLEDGE'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleInvestigate}
            icon={ArrowRight}
          >
            INVESTIGATE
          </Button>

          <Button
            variant="danger"
            size="sm"
            onClick={handleEscalate}
            disabled={loadingAction || incident.status === 'ESCALATED'}
          >
            {incident.status === 'ESCALATED' ? 'ESCALATED' : 'ESCALATE'}
          </Button>
        </div>
      </div>
    </div>
  );
}
