// src/components/incidents/AssignModal.jsx
import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { UserCheck, Shield } from 'lucide-react';

export function AssignModal({ isOpen, onClose, incident, onAssign }) {
  const [analyst, setAnalyst] = useState(incident?.assignedAnalyst || 'Sarah Chen (SOC Lead)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!incident) return null;

  const analysts = [
    { name: 'Sarah Chen (SOC Lead)', role: 'Lead Tier-3 Specialist', activeCount: 3 },
    { name: 'Marcus Vance (Analyst II)', role: 'Voice Biometrics Specialist', activeCount: 2 },
    { name: 'Alex Mercer (Analyst I)', role: 'Triage & Ingress Auditor', activeCount: 1 },
    { name: 'Elena Zhou (CIRT Escalation)', role: 'Forensic Investigator', activeCount: 0 }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onAssign(incident.id, analyst);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Assign Incident ${incident.id}`} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
        <div>
          <label className="text-2xs text-slate-400 uppercase tracking-wider block font-semibold mb-2">
            Select SOC Analyst
          </label>
          <div className="space-y-2">
            {analysts.map((a) => (
              <label
                key={a.name}
                className={`flex items-center justify-between p-3 rounded border cursor-pointer transition-colors ${
                  analyst === a.name
                    ? 'border-soc-accent bg-soc-accent/10 text-slate-100'
                    : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="analyst"
                    value={a.name}
                    checked={analyst === a.name}
                    onChange={(e) => setAnalyst(e.target.value)}
                    className="accent-soc-accent"
                  />
                  <div>
                    <div className="font-semibold text-xs text-slate-200">{a.name}</div>
                    <div className="text-2xs text-slate-500">{a.role}</div>
                  </div>
                </div>
                <span className="text-2xs text-slate-500 font-mono">
                  {a.activeCount} active cases
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-soc-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Assign Analyst'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
