import { DollarSign, Key, Zap, UserCheck, Lock, KeyRound, MessageCircle, AlertOctagon } from 'lucide-react';
import type { ConversationSignal, SignalType } from '../../types';

const SIGNAL_CONFIG: Record<SignalType, { icon: React.ElementType; bg: string; text: string }> = {
  payment_request: { icon: DollarSign, bg: 'bg-orange-50 border-orange-200 text-orange-700', text: 'Payment request' },
  otp_request: { icon: Key, bg: 'bg-red-50 border-red-200 text-red-700', text: 'OTP / code request' },
  urgent_request: { icon: Zap, bg: 'bg-amber-50 border-amber-200 text-amber-700', text: 'Urgent request' },
  authority_claim: { icon: UserCheck, bg: 'bg-blue-50 border-blue-200 text-blue-700', text: 'Authority claim' },
  sensitive_info_request: { icon: Lock, bg: 'bg-orange-50 border-orange-200 text-orange-700', text: 'Sensitive information requested' },
  credential_request: { icon: KeyRound, bg: 'bg-red-50 border-red-200 text-red-700', text: 'Credential request' },
  threat: { icon: AlertOctagon, bg: 'bg-rose-50 border-rose-200 text-rose-700', text: 'Threat / Coercion' },
  normal: { icon: MessageCircle, bg: 'bg-slate-50 border-slate-200 text-slate-600', text: 'Normal conversation' },
};

interface ConversationSignalTagProps {
  signal: ConversationSignal;
  className?: string;
}

export default function ConversationSignalTag({ signal, className = '' }: ConversationSignalTagProps) {
  const config = SIGNAL_CONFIG[signal.type];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full ${config.bg} ${className}`}>
      <Icon size={11} aria-hidden />
      {signal.label}
    </span>
  );
}
