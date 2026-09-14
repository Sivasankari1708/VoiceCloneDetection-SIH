// src/components/incidents/IdentityVerificationCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { Info } from 'lucide-react';
import { formatIdentityVerification } from '../../utils/formatters';

export function IdentityVerificationCard({ identityDetails, claimedIdentity }) {
  if (!identityDetails) return null;

  const hasProfile = identityDetails.protectedProfile === 'Available';
  const statusMeta = formatIdentityVerification(identityDetails.verification);

  return (
    <Card title="Identity Verification Status">
      <div className="font-mono text-xs space-y-4">
        {!hasProfile ? (
          <div className="p-3 bg-amber-950/20 border border-amber-800/60 rounded text-amber-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Verification profile unavailable.</div>
              <p className="text-2xs text-amber-400/80 mt-0.5">
                No enrolled profile exists for the claimed caller identity. Identity matching cannot be performed automatically. Do not classify as impersonation solely on this basis.
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
                <span>Protected Profile:</span>
                <span className="text-emerald-400 font-semibold">ENROLLED</span>
              </div>
            </div>

            {/* Verification Outcome */}
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded flex flex-col justify-between">
              <div>
                <span className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold mb-2">
                  System Matching Outcome
                </span>
                <span className={`px-2.5 py-1 rounded text-xs font-bold ${statusMeta.badge}`}>
                  {statusMeta.label}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 mt-2 text-2xs text-slate-400">
                <p>The caller's voice did not confidently match the enrolled profile for this identity. Conditions or impersonation may be factors.</p>
              </div>
            </div>
          </div>
        )}

        <div className="text-2xs text-slate-500 border-t border-soc-border pt-2 flex items-center justify-between">
          <span>Analysis Method: <span className="text-slate-400">Automated Profile Matching</span></span>
          <span>Status: <span className="text-slate-400">Continuous Assessment</span></span>
        </div>
      </div>
    </Card>
  );
}
