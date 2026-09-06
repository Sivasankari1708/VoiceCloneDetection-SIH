import { CheckCircle, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import type { CallerIdentity, CommunicationSource } from '../../types';

interface CallerCardProps {
  caller: CallerIdentity;
  source?: CommunicationSource;
  compact?: boolean;
}

const SOURCE_LABELS: Record<CommunicationSource, string> = {
  browser: 'Microphone',
  phone: 'Phone',
  voip: 'VoIP',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
};

const IDENTITY_CONFIG = {
  verified: { icon: CheckCircle, text: 'Caller identity verified', color: 'text-green-600' },
  unverified: { icon: HelpCircle, text: 'Identity not confirmed', color: 'text-amber-600' },
  failed: { icon: XCircle, text: 'Caller identity could not be verified', color: 'text-red-600' },
  unavailable: { icon: HelpCircle, text: 'Verification unavailable', color: 'text-slate-500' },
  checking: { icon: Loader2, text: 'Verifying caller identity…', color: 'text-blue-600' },
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function CallerCard({ caller, source, compact = false }: CallerCardProps) {
  const config = IDENTITY_CONFIG[caller.status];
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 ${compact ? '' : 'p-4'}`}>
      {/* Avatar */}
      <div className={`rounded-full bg-slate-700 text-white font-semibold flex items-center justify-center flex-shrink-0
        ${compact ? 'w-10 h-10 text-sm' : 'w-14 h-14 text-lg'}`}>
        {getInitials(caller.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-slate-900 ${compact ? 'text-base' : 'text-xl'}`}>{caller.name}</div>
        <div className={`text-slate-500 ${compact ? 'text-sm' : 'text-base'}`}>{caller.claimedRole}</div>
        {!compact && <div className="text-sm text-slate-400">{caller.organization}</div>}

        {/* Identity status */}
        <div className={`flex items-center gap-1.5 mt-1.5 ${compact ? 'text-xs' : 'text-sm'} ${config.color}`}>
          <Icon size={compact ? 12 : 14} className={caller.status === 'checking' ? 'animate-spin' : ''} aria-hidden />
          <span>{config.text}</span>
        </div>

        {source && !compact && (
          <div className="text-xs text-slate-400 mt-1">
            Source: {SOURCE_LABELS[source]}
          </div>
        )}
      </div>
    </div>
  );
}
