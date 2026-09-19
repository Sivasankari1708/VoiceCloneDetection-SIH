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
      color: 'text-red-600',
      badge: 'border-red-200 bg-red-50/80 text-red-900'
    },
    {
      id: 'FALSE_POSITIVE',
      label: 'False Positive',
      description: 'Legitimate caller flagged due to channel noise, compression, or benign anomalies.',
      icon: AlertTriangle,
      color: 'text-amber-600',
      badge: 'border-amber-200 bg-amber-50/80 text-amber-900'
    },
    {
      id: 'LEGITIMATE_CALLER',
      label: 'Legitimate Caller',
      description: 'Confirmed genuine caller via secondary channel or supervisor confirmation.',
      icon: CheckCircle,
      color: 'text-emerald-600',
      badge: 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
    },
    {
      id: 'UNABLE_TO_VERIFY',
      label: 'Unable to Verify',
      description: 'Inconclusive telemetry and caller hung up prior to full biometric evaluation.',
      icon: HelpCircle,
      color: 'text-slate-500',
      badge: 'border-slate-200 bg-slate-100 text-slate-800'
    },
    {
      id: 'RESOLVED_AFTER_VERIFICATION',
      label: 'Resolved After Verification',
      description: 'Employee performed out-of-band video/passphrase callback; risk cleared.',
      icon: ShieldCheck,
      color: 'text-blue-600',
      badge: 'border-blue-200 bg-blue-50/80 text-blue-900'
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
      <form onSubmit={handleSubmit} className="space-y-4 font-sans text-xs text-slate-800">
        <div>
          <label className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold mb-2">
            Select Final Security Verdict *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {verdictOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = verdict === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => setVerdict(opt.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? `${opt.badge} ring-2 ring-blue-500/30 shadow-xs font-medium`
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-xs">
                    <Icon className={`w-4 h-4 ${opt.color}`} />
                    <span>{opt.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">
                    {opt.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resolution Reason */}
        <div>
          <label className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold mb-1">
            Mandatory Resolution Reason *
          </label>
          <textarea
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this verdict was reached (e.g., secondary verification confirmed employee was on flight; cellular AMR codec caused acoustic artifact)..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition"
          />
        </div>

        {/* Additional Investigation Notes */}
        <div>
          <label className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold mb-1">
            Investigation Summary & Evidence Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details for law enforcement, CIRT dossier, or forensic audit..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition"
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
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

