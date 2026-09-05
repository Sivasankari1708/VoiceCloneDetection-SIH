// src/components/incidents/ResolutionModal.jsx
import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle, ShieldCheck } from 'lucide-react';

export function ResolutionModal({ isOpen, onClose, incident, onResolve }) {
  const [verdict, setVerdict] = useState('CONFIRMED_ATTACK');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!incident) return null;

  const verdictOptions = [
    {
      id: 'CONFIRMED_ATTACK',
      label: 'Confirmed Attack',
      description: 'Definitive malicious impersonation or AI voice cloning verified.',
      icon: XCircle,
      color: 'text-red-400',
      badge: 'border-red-800 bg-red-950/40 text-red-300'
    },
    {
      id: 'FALSE_POSITIVE',
      label: 'False Positive',
      description: 'Legitimate caller flagged due to channel noise, compression, or benign anomalies.',
      icon: AlertTriangle,
      color: 'text-amber-400',
      badge: 'border-amber-800 bg-amber-950/40 text-amber-300'
    },
    {
      id: 'LEGITIMATE_CALLER',
      label: 'Legitimate Caller',
      description: 'Confirmed genuine caller via secondary channel or supervisor confirmation.',
      icon: CheckCircle,
      color: 'text-emerald-400',
      badge: 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
    },
    {
      id: 'UNABLE_TO_VERIFY',
      label: 'Unable to Verify',
      description: 'Inconclusive telemetry and caller hung up prior to full biometric evaluation.',
      icon: HelpCircle,
      color: 'text-slate-400',
      badge: 'border-slate-800 bg-slate-900/60 text-slate-300'
    },
    {
      id: 'RESOLVED_AFTER_VERIFICATION',
      label: 'Resolved After Verification',
      description: 'Employee performed out-of-band video/passphrase callback; risk cleared.',
      icon: ShieldCheck,
      color: 'text-sky-400',
      badge: 'border-sky-800 bg-sky-950/40 text-sky-300'
    }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Resolution reason is mandatory for SOC audit compliance.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onResolve(incident.id, {
        verdict,
        reason: reason.trim(),
        notes: notes.trim(),
        resolvedBy: 'Sarah Chen (SOC Lead)'
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to submit resolution');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Resolve Incident ${incident.id}`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
        <div>
          <label className="text-2xs text-slate-400 uppercase tracking-wider block font-semibold mb-2">
            Select Final Security Verdict *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {verdictOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = verdict === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setVerdict(opt.id)}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    isSelected
                      ? `${opt.badge} ring-1 ring-soc-accent`
                      : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/80 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Icon className={`w-4 h-4 ${opt.color}`} />
                    <span>{opt.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                    {opt.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resolution Reason */}
        <div>
          <label className="text-2xs text-slate-400 uppercase tracking-wider block font-semibold mb-1">
            Mandatory Resolution Reason *
          </label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this verdict was reached (e.g., secondary verification confirmed employee was on flight; cellular AMR codec caused acoustic artifact)..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded p-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
          />
        </div>

        {/* Additional Investigation Notes */}
        <div>
          <label className="text-2xs text-slate-400 uppercase tracking-wider block font-semibold mb-1">
            Investigation Summary & Evidence Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details for law enforcement, CIRT dossier, or forensic audit..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded p-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
          />
        </div>

        {error && (
          <div className="p-2 rounded bg-red-950/60 border border-red-800 text-red-300 text-2xs">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-soc-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Recording Resolution...' : 'Commit Resolution & Close Incident'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
