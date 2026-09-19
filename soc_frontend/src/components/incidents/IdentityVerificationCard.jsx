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
    <Card title="Voice Authenticity & Reference Verification">
      <div className="font-sans text-xs space-y-4">
        {!hasProfile ? (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Reference profile unavailable.</div>
              <p className="text-2xs text-amber-700 mt-0.5">
                No enrolled voice reference exists for claimed caller identity. Biometric comparison not performed — do not classify as impersonation solely on this basis.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Claimed Profile */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <span className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold">
                Claimed Executive Identity
              </span>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-700 font-bold">
                  {claimedIdentity?.name?.slice(0, 2).toUpperCase() || 'EX'}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{claimedIdentity?.name || identityDetails.claimed}</div>
                  <div className="text-2xs text-slate-500">{claimedIdentity?.role || identityDetails.claimed}</div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200/60 text-2xs text-slate-600 flex justify-between">
                <span>Protected Voice Reference:</span>
                <span className="text-emerald-700 font-semibold">ENROLLED</span>
              </div>
            </div>

            {/* Verification Outcome */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
              <span className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold">
                Verification Outcome
              </span>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${statusMeta.badge}`}>
                  {statusMeta.label}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 text-2xs text-slate-600">
                <div>
                  <span>Voice Match: </span>
                  <strong className="text-red-600">{identityDetails.speakerSimilarity}</strong>
                </div>
                <div>
                  <span>Confidence: </span>
                  <strong className="text-slate-900">{identityDetails.verificationConfidence}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-2xs text-slate-500 border-t border-slate-100 pt-2.5 flex items-center justify-between">
          <span>Verification Subsystem: <span className="text-slate-700 font-medium">Enterprise Voice Authenticity Shield</span></span>
          <span>Zero-Audio Retention: <span className="text-emerald-700 font-medium">Enforced</span></span>
        </div>
      </div>
    </Card>
  );
}
