// src/components/common/PrivacyBanner.jsx
import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

export function PrivacyBanner({ compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 border border-blue-200/80 rounded-lg text-2xs text-blue-900 font-medium">
        <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>Live audio is not streamed to SOC — Security telemetry only.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50/60 border border-blue-200/80 rounded-xl text-xs text-blue-950 shadow-2xs">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          <strong className="text-blue-950 font-bold">Privacy Compliance:</strong> Raw call audio is never retained or streamed to the SOC — Metadata and security signals only.
        </span>
      </div>
      <span className="text-2xs text-blue-600 font-semibold uppercase tracking-wider hidden sm:inline">
        Zero-Audio Retention Architecture
      </span>
    </div>
  );
}
