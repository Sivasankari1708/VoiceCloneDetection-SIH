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
  const baseClasses = 'inline-flex items-center justify-center font-mono font-medium rounded transition-colors duration-150 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeClasses = {
    xs: 'text-2xs px-2 py-1 gap-1',
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs px-3.5 py-2 gap-2',
    lg: 'text-sm px-4 py-2.5 gap-2',
  }[size] || 'text-xs px-3 py-1.5 gap-1.5';

  const variantClasses = {
    primary: 'bg-soc-accent hover:bg-soc-accentHover text-slate-950 font-semibold shadow-sm',
    secondary: 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600',
    danger: 'bg-red-950/80 hover:bg-red-900/90 text-red-200 border border-red-800 hover:border-red-700',
    warning: 'bg-amber-950/80 hover:bg-amber-900/90 text-amber-200 border border-amber-800 hover:border-amber-700',
    outline: 'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200',
  }[variant] || 'bg-slate-800 text-slate-200';

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
