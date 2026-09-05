// src/components/common/StatusIndicator.jsx
import React from 'react';

export function StatusIndicator({ status, label, showLabel = true, pulse = true }) {
  let color = 'bg-emerald-500';
  let textColor = 'text-emerald-400';
  let displayLabel = label || status;

  switch (status?.toUpperCase()) {
    case 'OPERATIONAL':
    case 'LIVE':
    case 'ONLINE':
      color = 'bg-emerald-500';
      textColor = 'text-emerald-400';
      break;
    case 'RECONNECTING':
    case 'WARNING':
    case 'DEGRADED':
      color = 'bg-amber-500';
      textColor = 'text-amber-400';
      break;
    case 'CRITICAL':
    case 'DISCONNECTED':
    case 'OFFLINE':
      color = 'bg-red-500';
      textColor = 'text-red-400';
      break;
    default:
      color = 'bg-slate-400';
      textColor = 'text-slate-400';
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
      </span>
      {showLabel && (
        <span className={`font-mono text-xs uppercase tracking-wider font-semibold ${textColor}`}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}
