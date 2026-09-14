// src/components/incidents/DetectionEvidenceCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { AlertTriangle, ShieldAlert, Activity, CheckCircle2 } from 'lucide-react';
import { formatIdentityVerification } from '../../utils/formatters';

export function DetectionEvidenceCard({ evidence }) {
  if (!evidence) return null;

  const identityStatus = formatIdentityVerification(evidence.identityVerification);
  const isSuspiciousVoice = evidence.voiceAuthenticity === 'SUSPICIOUS';

  return (
    <Card title="Detected Security Events & Context">
      <div className="space-y-4 font-mono text-xs">
        {/* Core Event Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-2xs text-slate-400 block uppercase">Voice Authenticity</span>
            <div className="mt-2">
              <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${isSuspiciousVoice ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                {isSuspiciousVoice ? 'WARNING DETECTED' : 'NORMAL'}
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              Acoustic analysis event
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-2xs text-slate-400 block uppercase">Identity Match</span>
            <div className="mt-2">
              <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${identityStatus.badge}`}>
                {identityStatus.label}
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              Speaker profile correlation
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-2xs text-slate-400 block uppercase">Liveness Status</span>
            <div className="mt-2">
              <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                UNVERIFIED
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              No active challenge completed
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-2xs text-slate-400 block uppercase">Verification Level</span>
            <div className="mt-2">
              <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                PENDING ACTION
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              Employee intervention required
            </span>
          </div>
        </div>

        {/* Human-Readable Observed Indicators */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded">
          <div className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Identified Conversation & Communication Indicators
          </div>
          {evidence.indicators && evidence.indicators.length > 0 ? (
            <div className="space-y-1.5">
              {evidence.indicators.map((indicator, idx) => (
                <div key={idx} className="flex items-start gap-2 text-slate-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{indicator}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 italic">No specific communication anomalies recorded.</div>
          )}
        </div>
      </div>
    </Card>
  );
}
