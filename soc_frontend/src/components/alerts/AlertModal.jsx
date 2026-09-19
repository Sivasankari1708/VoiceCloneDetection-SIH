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
      <div className="space-y-4 font-sans">
        <p className="text-xs text-slate-500">
          Inbound voice sessions exhibiting acoustic voice cloning markers, executive impersonation patterns, or biometric identity conflicts.
        </p>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
          {criticals.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No active critical alerts in the queue.
            </div>
          ) : (
            criticals.map((incident) => (
              <div key={incident.id} className="p-4 bg-white hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <SeverityTag severity={incident.severity} />
                    <span className="font-sans text-xs font-bold text-slate-900">{incident.id}</span>
                    <span className="text-xs text-slate-500">• {incident.duration}</span>
                  </div>
                  <span className="font-sans text-xs font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                    High Priority Threat
                  </span>
                </div>

                <div className="mt-2 text-xs font-semibold text-slate-900">
                  {incident.title}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                  <div>
                    <span className="text-slate-500">Target:</span> <strong className="text-slate-800">{incident.target?.name}</strong> ({incident.target?.role})
                  </div>
                  <div>
                    <span className="text-slate-500">Claimed:</span> <strong className="text-red-700">{incident.claimedIdentity?.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Attack Classification:</span> {incident.attackType || 'AI Voice Clone'}
                  </div>
                  <div>
                    <span className="text-slate-500">Protection Action:</span> <span className="text-emerald-700 font-medium">Autonomous Intervention</span>
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

