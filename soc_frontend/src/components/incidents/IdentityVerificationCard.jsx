// src/components/incidents/IdentityVerificationCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { UserX, UserCheck, Shield, AlertOctagon, Info } from 'lucide-react';
import { formatIdentityVerification } from '../../utils/formatters';

export function IdentityVerificationCard({ identityDetails, claimedIdentity }) {
  if (!identityDetails) return null;

  const hasProfile = identityDetails.protectedProfile === 'Available';
  const statusMeta = formatIdentityVerification(identityDetails.verification);

  return (
    <Card title="Identity Biometric Verification (ECAPA-TDNN)">
      <div className="font-mono text-xs space-y-4">
        {!hasProfile ? (
          <div className="p-3 bg-amber-950/20 border border-amber-800/60 rounded text-amber-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Speaker verification unavailable.</div>
              <p className="text-2xs text-amber-400/80 mt-0.5">
                No enrolled voiceprint exists for claimed caller identity. Biometric comparison not performed — do not automatically classify as impersonation solely on this basis.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Claimed Profile */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded space-y-2">
              <span className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold">
                Claimed Executive Identity
              </span>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-red-950/70 border border-red-800 flex items-center justify-center text-red-300 font-bold">
                  {claimedIdentity?.name?.slice(0, 2).toUpperCase() || 'EX'}
                </div>
                <div>
                  <div className="font-semibold text-slate-100">{claimedIdentity?.name || identityDetails.claimed}</div>
                  <div className="text-2xs text-slate-400">{claimedIdentity?.role || identityDetails.claimed}</div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800 text-2xs text-slate-400 flex justify-between">
                <span>Protected Voiceprint:</span>
                <span className="text-emerald-400 font-semibold">ENROLLED (5 Samples)</span>
              </div>
            </div>

            {/* Verification Outcome */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded space-y-2">
              <span className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold">
                Biometric Outcome
              </span>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded text-xs font-bold ${statusMeta.badge}`}>
                  {statusMeta.label}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 text-2xs text-slate-400">
                <div>
                  <span>Similarity Score: </span>
                  <strong className="text-red-400">{identityDetails.speakerSimilarity}</strong>
                </div>
                <div>
                  <span>Confidence: </span>
                  <strong className="text-slate-200">{identityDetails.verificationConfidence}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-2xs text-slate-500 border-t border-soc-border pt-2 flex items-center justify-between">
          <span>Engine: <span className="text-slate-400">SpeechBrain ECAPA-TDNN</span></span>
          <span>Dimensionality: <span className="text-slate-400">192-D L2-Normalized</span></span>
        </div>
      </div>
    </Card>
  );
}
