// src/components/common/Button.jsx
import React from 'react';

export function Button({
  children,
  variant = 'secondary', // 'primary', 'secondary', 'danger', 'outline', 'ghost', 'warning'
  size = 'md', // 'xs', 'sm', 'md', 'lg'
  onClick,
  disabled = false,
  className = '',
  icon: Icon,
  type = 'button'
}) {
  const baseClasses = 'inline-flex items-center justify-center font-sans font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const sizeClasses = {
    xs: 'text-2xs px-2.5 py-1 gap-1',
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-xs px-4 py-2 gap-2 font-medium',
    lg: 'text-sm px-5 py-2.5 gap-2 font-medium',
  }[size] || 'text-xs px-3.5 py-2 gap-1.5';

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs hover:shadow transition-all',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300/80 hover:border-slate-400 shadow-xs',
    danger: 'bg-red-50 hover:bg-red-100/90 text-red-700 border border-red-200 font-medium shadow-xs',
    warning: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-medium shadow-xs',
    outline: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 shadow-xs',
    ghost: 'bg-transparent hover:bg-slate-100/80 text-slate-600 hover:text-slate-900',
  }[variant] || 'bg-white text-slate-700 border border-slate-300';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{children}</span>
    </button>
  );
}

