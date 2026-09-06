import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  hoverable?: boolean;
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };

export default function Card({
  children,
  className = '',
  padding = 'md',
  header,
  footer,
  onClick,
  hoverable = false,
}: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden
        ${hoverable ? 'hover:border-slate-300 hover:shadow-md transition-all duration-150 cursor-pointer' : ''}
        ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {header && (
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          {header}
        </div>
      )}
      <div className={PADDING[padding]}>{children}</div>
      {footer && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          {footer}
        </div>
      )}
    </div>
  );
}
