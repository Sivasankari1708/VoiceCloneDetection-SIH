// src/components/common/PrivacyBanner.jsx
import React from 'react';
import { ShieldAlert, Lock } from 'lucide-react';

export function PrivacyBanner({ compact = false }) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded text-2xs font-mono text-slate-400">
        <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>Live audio is not streamed to SOC — Security telemetry only.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border border-slate-800/80 rounded-md text-xs font-mono text-slate-300">
      <div className="flex items-center gap-2.5">
        <ShieldAlert className="w-4 h-4 text-soc-accent shrink-0" />
        <span>
          <strong className="text-soc-text uppercase font-semibold">Privacy Compliance:</strong> Live audio is not streamed to SOC — Security telemetry only.
        </span>
      </div>
      <span className="text-2xs text-slate-500 uppercase tracking-widest hidden sm:inline">
        Zero-Audio Retention Architecture
      </span>
    </div>
  );
}
