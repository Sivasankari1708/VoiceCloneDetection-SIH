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
  SAFE: { icon: CheckCircle, label: 'Safe', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  LOW: { icon: Info, label: 'Low', classes: 'bg-blue-50 text-blue-800 border-blue-200' },
  CAUTION: { icon: AlertTriangle, label: 'Caution', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  MEDIUM: { icon: AlertTriangle, label: 'Caution', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  HIGH: { icon: AlertOctagon, label: 'High', classes: 'bg-blue-900 text-blue-100 border-blue-800' },
  CRITICAL: { icon: ShieldAlert, label: 'Critical', classes: 'bg-red-50 text-red-900 border-red-200/90' },
};

const SIZES = {
  sm: { badge: 'px-2.5 py-0.5 text-xs rounded-full gap-1', icon: 12 },
  md: { badge: 'px-3 py-1 text-xs font-semibold rounded-full gap-1.5', icon: 13 },
  lg: { badge: 'px-3.5 py-1.5 text-sm font-semibold rounded-full gap-2', icon: 15 },
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
