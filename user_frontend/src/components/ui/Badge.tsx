import type { SeverityLevel } from '../../types';

type BadgeVariant = SeverityLevel | 'info' | 'default' | 'success';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  SAFE: 'bg-slate-100 text-slate-700 border border-slate-200',
  LOW: 'bg-blue-50 text-blue-800 border border-blue-200',
  CAUTION: 'bg-amber-50 text-amber-800 border border-amber-200',
  MEDIUM: 'bg-amber-50 text-amber-800 border border-amber-200',
  HIGH: 'bg-blue-900 text-white border border-blue-800',
  CRITICAL: 'bg-red-50 text-red-900 border border-red-200',
  info: 'bg-slate-100 text-slate-700 border border-slate-200',
  default: 'bg-slate-100 text-slate-600 border border-slate-200',
  success: 'bg-blue-50 text-blue-800 border border-blue-200',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs font-medium rounded',
  md: 'px-2.5 py-1 text-xs font-semibold rounded-md',
};

export default function Badge({ variant = 'default', size = 'md', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}>
      {children}
    </span>
  );
}
