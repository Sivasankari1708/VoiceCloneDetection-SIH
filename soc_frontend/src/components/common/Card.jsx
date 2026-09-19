// src/components/common/Card.jsx
import React from 'react';

export function Card({ children, className = '', title, action, subtitle, headerBorder = true }) {
  return (
    <div className={`bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between px-5 py-4 ${headerBorder ? 'border-b border-slate-100' : ''}`}>
          <div>
            {title && <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-slate-800">{title}</h3>}
            {subtitle && <p className="text-2xs text-slate-500 mt-0.5 font-normal">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
