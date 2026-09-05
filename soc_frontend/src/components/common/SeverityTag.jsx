// src/components/common/SeverityTag.jsx
import React from 'react';
import { formatSeverity } from '../../utils/formatters';

export function SeverityTag({ severity, size = 'sm', showDot = true }) {
  const meta = formatSeverity(severity);
  const sizeClasses = size === 'xs' 
    ? 'text-2xs px-1.5 py-0.5' 
    : size === 'md' 
    ? 'text-xs px-2.5 py-1' 
    : 'text-xs px-2 py-0.5';

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono font-medium rounded ${sizeClasses} ${meta.badge}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} animate-pulse`} />}
      <span>{meta.label}</span>
    </span>
  );
}
