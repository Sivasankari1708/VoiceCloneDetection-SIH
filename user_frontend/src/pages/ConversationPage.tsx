import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Info } from 'lucide-react';
import { useActiveCall } from '../context/AppContext';
import { MOCK_CALL_HISTORY } from '../mock-data';
import TranscriptDisplay from '../components/call/TranscriptDisplay';
import ConversationSignalTag from '../components/call/ConversationSignalTag';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import type { ConversationSignal } from '../types';

const SIGNAL_EXPLANATIONS: Record<string, string> = {
  payment_request: 'The caller asked for a financial payment or transfer.',
  otp_request: 'The caller asked for a one-time code (OTP) or verification code.',
  urgent_request: 'The caller expressed unusual urgency to pressure a quick decision.',
  authority_claim: 'The caller claimed to be in a position of authority.',
  sensitive_info_request: 'The caller asked for sensitive or confidential information.',
  credential_request: 'The caller asked for login credentials or passwords.',
};

export default function ConversationPage() {
  const navigate = useNavigate();
  const { activeCall } = useActiveCall();

  const transcript = activeCall?.transcript ?? MOCK_CALL_HISTORY[0].transcript;
  const signals: ConversationSignal[] = activeCall?.security.signals ?? MOCK_CALL_HISTORY[0].signals;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">What's happening in this call?</h1>
        <p className="text-slate-500 text-sm mt-1">A plain-language view of the conversation.</p>
      </div>

      {/* Live transcript */}
      <Card header={
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Conversation Transcript</span>
        </div>
      }>
        <TranscriptDisplay segments={transcript} maxHeight="300px" />
      </Card>

      {/* Conversation signals */}
      <Card header={<span className="text-sm font-semibold text-slate-700">What we detected in this call</span>}>
        {signals.length === 0 ? (
          <div className="text-sm text-green-600 flex items-center gap-2 py-2">
            <Info size={15} />
            No suspicious activity detected in this conversation.
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map(sig => (
              <div key={sig.type} className="flex items-start gap-3">
                <div className="pt-0.5">
                  <ConversationSignalTag signal={sig} />
                </div>
                <p className="text-sm text-slate-600">
                  {SIGNAL_EXPLANATIONS[sig.type] ?? sig.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* General guidance */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">General Guidance</div>
        <ul className="text-sm text-slate-600 space-y-1.5">
          <li>• Never share OTPs, passwords, or PINs over a phone call.</li>
          <li>• Legitimate executives do not urgently demand financial transfers by phone.</li>
          <li>• When in doubt, hang up and call back using a known official number.</li>
        </ul>
      </div>

      <Button variant="outline" fullWidth onClick={() => navigate('/live')}>
        Return to Call
      </Button>
    </div>
  );
}
