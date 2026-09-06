import { CheckCircle, Info, AlertTriangle, AlertOctagon, ShieldAlert } from 'lucide-react';
import type { SeverityLevel } from '../../types';

interface SeverityBadgeProps {
  level: SeverityLevel;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  pulse?: boolean;
  className?: string;
}

const CONFIG: Record<SeverityLevel, { icon: React.ElementType; label: string; classes: string }> = {
  SAFE: { icon: CheckCircle, label: 'Safe', classes: 'bg-green-100 text-green-800 border-green-200' },
  LOW: { icon: Info, label: 'Low', classes: 'bg-blue-100 text-blue-800 border-blue-200' },
  MEDIUM: { icon: AlertTriangle, label: 'Medium', classes: 'bg-amber-100 text-amber-800 border-amber-200' },
  HIGH: { icon: AlertOctagon, label: 'High', classes: 'bg-orange-100 text-orange-800 border-orange-200' },
  CRITICAL: { icon: ShieldAlert, label: 'Critical', classes: 'bg-red-100 text-red-800 border-red-200' },
};

const SIZES = {
  sm: { badge: 'px-2 py-0.5 text-xs rounded gap-1', icon: 12 },
  md: { badge: 'px-2.5 py-1 text-xs font-semibold rounded-md gap-1.5', icon: 14 },
  lg: { badge: 'px-3 py-1.5 text-sm font-semibold rounded-lg gap-2', icon: 16 },
};

export default function SeverityBadge({ level, size = 'md', showIcon = true, pulse = false, className = '' }: SeverityBadgeProps) {
  const { icon: Icon, label, classes } = CONFIG[level];
  const { badge, icon: iconSize } = SIZES[size];

  return (
    <span
      className={`inline-flex items-center border font-medium ${classes} ${badge} ${pulse && level === 'CRITICAL' ? 'animate-severity-pulse' : ''} ${className}`}
      role="status"
      aria-label={`Severity: ${label}`}
    >
      {showIcon && <Icon size={iconSize} aria-hidden />}
      {label.toUpperCase()}
    </span>
  );
}
