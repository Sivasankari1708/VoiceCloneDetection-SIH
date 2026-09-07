import { useNavigate } from 'react-router-dom';
import { ShieldAlert, XCircle, Lock, Home, User, PhoneOff } from 'lucide-react';
import { useActiveCall, useCallHistory } from '../context/AppContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SeverityBadge from '../components/severity/SeverityBadge';
import type { ConversationSignal } from '../types';

export default function SecurityAlertPage() {
  const navigate = useNavigate();
  const { activeCall } = useActiveCall();
  const { callHistory } = useCallHistory();

  // Use active call or latest critical/high risk call from history
  const call = activeCall ?? callHistory.find((c) => c.finalSeverity === 'CRITICAL' || c.finalSeverity === 'HIGH');
  if (!call) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <ShieldAlert size={40} className="text-slate-300 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">No Active Security Alerts</h2>
        <p className="text-slate-500 text-sm mt-1">There are no critical security alerts requiring immediate attention.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/home')}>
          Return Home
        </Button>
      </div>
    );
  }

  const caller = call.caller;
  const signals: ConversationSignal[] =
    'security' in call ? (call.security?.signals ?? []) : ((call as any).signals ?? []);

  // Build reason list
  const reasons: string[] = [];
  if (caller.status === 'failed') reasons.push('Caller identity could not be verified');
  signals.forEach((s) => {
    if (s.type === 'otp_request') reasons.push('An OTP or authentication code was requested');
    if (s.type === 'payment_request') reasons.push('A financial transfer was requested');
    if (s.type === 'urgent_request') reasons.push('The request appears unusually urgent');
    if (s.type === 'credential_request') reasons.push('Login credentials were requested');
    if (s.type === 'sensitive_info_request') reasons.push('Sensitive confidential information was requested');
  });
  if (reasons.length === 0) reasons.push('Synthetic voice anomaly or social engineering patterns detected');

  const refId = `INC-${call.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}`;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="bg-red-600 rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert size={28} />
          <h1 className="text-xl font-bold">Critical Security Alert</h1>
        </div>
        <p className="text-red-100 text-sm">This call may be a voice clone impersonation attempt. Take action now.</p>
        <div className="mt-3">
          <SeverityBadge level="CRITICAL" size="md" className="bg-red-700 text-white border-red-500" />
        </div>
      </div>

      {/* Caller info */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-700 text-white font-semibold flex items-center justify-center">
            {caller.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div>
            <div className="font-semibold text-slate-900">{caller.name}</div>
            <div className="text-sm text-slate-500">{caller.claimedRole || 'Inbound Voice Call'}</div>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-red-600">
              <XCircle size={12} />
              {caller.statusMessage || 'Security alert triggered'}
            </div>
          </div>
        </div>
      </Card>

      {/* Why is this suspicious */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Why this call is suspicious</span>}>
        <ul className="space-y-2">
          {reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <XCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              {reason}
            </li>
          ))}
        </ul>
      </Card>

      {/* Recommendation */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Lock size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-900 text-sm mb-1">Recommended action</div>
            <p className="text-sm text-amber-800">
              Do not share OTPs, passwords, or financial information. Verify the caller through a trusted channel before taking any action.
            </p>
          </div>
        </div>
      </div>

      {/* Security team notification */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="font-semibold text-blue-900 text-sm">✓ Your security team (SOC) has been notified.</div>
        <div className="text-xs text-blue-600 mt-1 font-mono">
          Incident reference: <span className="font-bold">{refId}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="primary" fullWidth onClick={() => navigate('/verification')} icon={<User size={16} />}>
          Verify Caller
        </Button>
        <Button variant="danger" fullWidth onClick={() => navigate('/live')} icon={<PhoneOff size={16} />}>
          Return to Call
        </Button>
      </div>

      <Button variant="ghost" size="sm" fullWidth onClick={() => navigate('/home')} icon={<Home size={14} />}>
        Return to Home
      </Button>
    </div>
  );
}
