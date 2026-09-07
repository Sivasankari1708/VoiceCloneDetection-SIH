import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, HelpCircle, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useActiveCall } from '../context/AppContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import type { IdentityStatus, CallerIdentity } from '../types';

export default function IdentityPage() {
  const navigate = useNavigate();
  const { activeCall } = useActiveCall();
  const caller: CallerIdentity = activeCall?.caller ?? {
    name: 'Inbound Voice Call',
    claimedRole: 'Inbound Stream',
    organization: 'VoiceShield Protection',
    status: 'unverified',
    statusMessage: 'No active identity verification in progress',
  };
  const status: IdentityStatus = caller.status;

  const STATUS_CONFIG = {
    verified: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50 border-green-200',
      title: 'Caller identity verified',
      detail: `We confirmed that this caller is ${caller.name}.`,
    },
    unverified: {
      icon: HelpCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-200',
      title: 'Identity not confirmed',
      detail: `We could not fully confirm that this caller is ${caller.name}.`,
    },
    failed: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
      title: `We couldn't confirm this is ${caller.name}`,
      detail: `The caller's voice could not be matched to the expected identity. This does not necessarily mean the caller is malicious, but verification is recommended.`,
    },
    unavailable: {
      icon: HelpCircle,
      color: 'text-slate-500',
      bg: 'bg-slate-50 border-slate-200',
      title: 'Verification unavailable',
      detail: 'Identity verification is not available for this call.',
    },
    checking: {
      icon: Loader2,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-200',
      title: 'Verifying caller identity…',
      detail: 'Please wait while we verify the caller\'s identity.',
    },
  };

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </button>

      <h1 className="text-2xl font-bold text-slate-900">
        Is this really {caller.name}?
      </h1>

      {/* Claimed identity */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Claimed identity</span>}>
        <div className="flex items-center gap-4 pt-1">
          <div className="w-14 h-14 rounded-full bg-slate-700 text-white text-xl font-semibold flex items-center justify-center flex-shrink-0">
            {caller.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900">{caller.name}</div>
            <div className="text-slate-500">{caller.claimedRole}</div>
            <div className="text-sm text-slate-400">{caller.organization}</div>
          </div>
        </div>
      </Card>

      {/* Identity status */}
      <div className={`rounded-xl border p-5 ${config.bg}`}>
        <div className="flex items-start gap-3">
          <Icon size={24} className={`${config.color} flex-shrink-0 ${status === 'checking' ? 'animate-spin' : ''}`} />
          <div>
            <div className={`font-semibold text-lg ${config.color}`}>{config.title}</div>
            <p className="text-sm text-slate-600 mt-2">{config.detail}</p>
          </div>
        </div>
      </div>

      {/* What this means */}
      <Card header={<span className="text-sm font-semibold text-slate-700">What this means</span>}>
        <div className="space-y-3 text-sm text-slate-600">
          {status === 'verified' ? (
            <div className="flex items-start gap-2">
              <ShieldCheck size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
              <p>VoiceShield analyzed the caller's voice and confirmed it matches the expected person. You can continue the call with confidence.</p>
            </div>
          ) : status === 'failed' || status === 'unverified' ? (
            <>
              <div className="flex items-start gap-2">
                <XCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p>The caller's voice could not be matched to the expected person. This could indicate a spoofed or cloned voice.</p>
              </div>
              <div className="flex items-start gap-2">
                <HelpCircle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p>Before sharing any sensitive information, please verify this caller through an independent trusted method.</p>
              </div>
            </>
          ) : (
            <p>Identity verification is not available for this call. Use an independent verification method to confirm the caller's identity.</p>
          )}
        </div>
      </Card>

      {/* Actions */}
      {(status === 'failed' || status === 'unverified' || status === 'unavailable') && (
        <Button variant="primary" fullWidth onClick={() => navigate('/verification')}>
          Verify Independently
        </Button>
      )}

      <Button variant="outline" fullWidth onClick={() => navigate('/live')}>
        Return to Call
      </Button>
    </div>
  );
}
