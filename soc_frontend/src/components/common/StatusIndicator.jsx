// src/components/common/StatusIndicator.jsx
import React from 'react';

export function StatusIndicator({ status, label, showLabel = true, pulse = true }) {
  let dotColor = 'bg-emerald-500';
  let textColor = 'text-emerald-700';
  let displayLabel = label || status;

  switch (status?.toUpperCase()) {
    case 'OPERATIONAL':
    case 'LIVE':
    case 'ONLINE':
      dotColor = 'bg-emerald-500';
      textColor = 'text-emerald-700';
      break;
    case 'RECONNECTING':
    case 'WARNING':
    case 'DEGRADED':
      dotColor = 'bg-amber-500';
      textColor = 'text-amber-800';
      break;
    case 'CRITICAL':
    case 'DISCONNECTED':
    case 'OFFLINE':
      dotColor = 'bg-red-500';
      textColor = 'text-red-700';
      break;
    default:
      dotColor = 'bg-slate-400';
      textColor = 'text-slate-600';
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`} />
      </span>
      {showLabel && (
        <span className={`font-sans text-xs uppercase tracking-wider font-semibold ${textColor}`}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}

