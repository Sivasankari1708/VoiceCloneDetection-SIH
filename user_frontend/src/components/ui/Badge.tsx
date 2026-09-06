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
  SAFE: 'bg-green-100 text-green-800 border border-green-200',
  LOW: 'bg-blue-100 text-blue-800 border border-blue-200',
  MEDIUM: 'bg-amber-100 text-amber-800 border border-amber-200',
  HIGH: 'bg-orange-100 text-orange-800 border border-orange-200',
  CRITICAL: 'bg-red-100 text-red-800 border border-red-200',
  info: 'bg-slate-100 text-slate-700 border border-slate-200',
  default: 'bg-slate-100 text-slate-600 border border-slate-200',
  success: 'bg-green-100 text-green-800 border border-green-200',
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
