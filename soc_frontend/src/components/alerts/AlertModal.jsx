// src/components/alerts/AlertModal.jsx
import React from 'react';
import { Modal } from '../common/Modal';
import { SeverityTag } from '../common/SeverityTag';
import { Button } from '../common/Button';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AlertModal({ isOpen, onClose, incidents, onAcknowledge, onEscalate }) {
  const navigate = useNavigate();
  const criticals = incidents.filter(i => i.severity === 'CRITICAL');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Active Critical Voice Security Alerts" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <p className="text-xs text-slate-400 font-mono">
          The following inbound voice interactions exhibit confirmed high-confidence acoustic cloning anomalies and biometric identity mismatches.
        </p>

        <div className="divide-y divide-soc-border border border-soc-border rounded-md overflow-hidden">
          {criticals.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-slate-500">
              No active critical alerts in the queue.
            </div>
          ) : (
            criticals.map((incident) => (
              <div key={incident.id} className="p-4 bg-slate-900/40 hover:bg-slate-900/80 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <SeverityTag severity={incident.severity} />
                    <span className="font-mono text-xs font-bold text-slate-200">{incident.id}</span>
                    <span className="text-2xs font-mono text-slate-400">• {incident.duration}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-red-400">
                    Risk: {incident.riskScore} / 100
                  </span>
                </div>

                <div className="mt-2 text-xs font-medium text-slate-200">
                  {incident.title}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-2xs font-mono text-slate-400 bg-slate-950/60 p-2.5 rounded border border-slate-800">
                  <div>
                    <span className="text-slate-500">Target:</span> {incident.target?.name} ({incident.target?.role})
                  </div>
                  <div>
                    <span className="text-slate-500">Claimed:</span> <span className="text-red-300 font-semibold">{incident.claimedIdentity?.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Synthetic Prob:</span> {Math.round(incident.detectionEvidence?.syntheticProbability * 100)}%
                  </div>
                  <div>
                    <span className="text-slate-500">Biometric Similarity:</span> {incident.detectionEvidence?.speakerSimilarity}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      onAcknowledge(incident.id);
                    }}
                    disabled={incident.status === 'UNDER_INVESTIGATION'}
                  >
                    {incident.status === 'UNDER_INVESTIGATION' ? 'Acknowledged' : 'Acknowledge'}
                  </Button>
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => {
                      onEscalate(incident.id);
                    }}
                    disabled={incident.status === 'ESCALATED'}
                  >
                    {incident.status === 'ESCALATED' ? 'Escalated' : 'Escalate (CIRT)'}
                  </Button>
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => {
                      onClose();
                      navigate(`/investigations/${incident.id}`);
                    }}
                    icon={ArrowRight}
                  >
                    Open Investigation
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
