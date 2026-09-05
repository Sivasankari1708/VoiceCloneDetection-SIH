// src/components/common/Card.jsx
import React from 'react';

export function Card({ children, className = '', title, action, subtitle, headerBorder = true }) {
  return (
    <div className={`bg-soc-card border border-soc-border rounded-md ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between px-4 py-3 ${headerBorder ? 'border-b border-soc-border' : ''}`}>
          <div>
            {title && <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-soc-text">{title}</h3>}
            {subtitle && <p className="text-2xs text-soc-muted mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
