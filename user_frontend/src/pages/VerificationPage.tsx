import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageSquare, Shield, CheckCircle, XCircle, Loader2, PhoneOff, ShieldAlert
} from 'lucide-react';
import { useActiveCall, useAppContext } from '../context/AppContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SecurityScoreDisplay from '../components/severity/SecurityScoreDisplay';
import type { VerificationMethod, CallerIdentity } from '../types';

type VStep = 'confirm' | 'choose' | 'verifying' | 'success' | 'failed';

const METHODS: { id: VerificationMethod; icon: React.ElementType; label: string; desc: string }[] = [
  { id: 'trusted_call', icon: Phone, label: 'Call trusted number', desc: 'Call them back on a known official number to confirm.' },
  { id: 'verification_request', icon: MessageSquare, label: 'Send verification request', desc: 'Send a digital verification ping to their registered device.' },
  { id: 'mfa', icon: Shield, label: 'Use MFA / authenticator', desc: 'Ask them to confirm a code from your authenticator app.' },
];

export default function VerificationPage() {
  const navigate = useNavigate();
  const { activeCall, updateActiveCall } = useActiveCall();
  const { dispatch } = useAppContext();
  const caller: CallerIdentity = activeCall?.caller ?? {
    name: 'Current Caller',
    claimedRole: 'Caller',
    organization: 'Protected Entity',
    status: 'unverified',
    statusMessage: 'Caller verification pending',
  };

  const [step, setStep] = useState<VStep>('confirm');
  const [selectedMethod, setSelectedMethod] = useState<VerificationMethod | null>(null);
  const [simulateFailure, setSimulateFailure] = useState(false);

  const priorScore = activeCall?.security.score ?? 92;
  const priorSeverity = activeCall?.security.severity ?? 'CRITICAL';
  const postScore = 21;
  const postSeverity = 'LOW' as const;

  const handleVerify = () => {
    if (!selectedMethod) return;
    setStep('verifying');
    setTimeout(() => {
      if (simulateFailure) {
        setStep('failed');
      } else {
        setStep('success');
        // Update the active call security status
        if (activeCall) {
          updateActiveCall({
            security: {
              ...activeCall.security,
              score: postScore,
              severity: postSeverity,
              message: 'Caller independently verified. Security concern reduced.',
              callerIdentity: 'verified',
            },
            caller: { ...activeCall.caller, status: 'verified', statusMessage: 'Caller identity verified' },
          });
        }
        // Add notification
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            id: `notif-verify-${Date.now()}`,
            type: 'verification_complete',
            title: 'Caller verified independently',
            message: `${caller.name} was successfully verified through independent verification.`,
            read: false,
            createdAt: new Date(),
          },
        });
      }
    }, 2200);
  };

  const stepIndex = { confirm: 0, choose: 1, verifying: 2, success: 2, failed: 2 }[step];

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Verify this caller</h1>
        <p className="text-slate-500 text-sm mt-1">For your safety, verify the caller using another trusted method.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {['Confirm identity', 'Choose method', 'Result'].map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0
              ${i < stepIndex ? 'bg-green-500 text-white' : i === stepIndex ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {i < stepIndex ? <CheckCircle size={13} /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === stepIndex ? 'text-blue-700' : 'text-slate-400'}`}>{label}</span>
            {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Confirm */}
      {step === 'confirm' && (
        <Card header={<span className="text-sm font-semibold text-slate-700">Step 1 — Confirm identity</span>}>
          <div className="flex items-center gap-4 py-2">
            <div className="w-14 h-14 rounded-full bg-slate-700 text-white text-xl font-semibold flex items-center justify-center flex-shrink-0">
              {caller.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">{caller.name}</div>
              <div className="text-slate-500 text-sm">{caller.claimedRole}</div>
              <div className="text-xs text-slate-400">{caller.organization}</div>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-3 mb-4">
            You are about to independently verify the identity of <strong>{caller.name}</strong>. 
            This will confirm whether the caller is who they claim to be, separate from VoiceShield's automatic analysis.
          </p>
          <Button variant="primary" fullWidth onClick={() => setStep('choose')}>Continue</Button>
        </Card>
      )}

      {/* Step 2: Choose method */}
      {step === 'choose' && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">Step 2 — Choose a verification method</div>
          {METHODS.map(({ id, icon: Icon, label, desc }) => (
            <button
              key={id}
              onClick={() => setSelectedMethod(id)}
              className={`w-full text-left p-4 rounded-xl border transition-all
                ${selectedMethod === id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedMethod === id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className="font-medium text-slate-900 text-sm">{label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </div>
                {selectedMethod === id && <CheckCircle size={16} className="text-blue-600 ml-auto flex-shrink-0 mt-1" />}
              </div>
            </button>
          ))}

          {/* Demo mode failure toggle */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setSimulateFailure(f => !f)}
              className={`w-8 h-4 rounded-full transition-colors ${simulateFailure ? 'bg-red-400' : 'bg-slate-300'}`}
              aria-label="Toggle failure simulation"
            >
              <div className={`w-3 h-3 bg-white rounded-full transition-transform mx-0.5 ${simulateFailure ? 'translate-x-4' : ''}`} />
            </button>
            <span className="text-xs text-slate-400">Demo: simulate failure</span>
          </div>

          <Button variant="primary" fullWidth disabled={!selectedMethod} onClick={handleVerify}>
            Begin Verification
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('confirm')}>Back</Button>
        </div>
      )}

      {/* Step 3: Verifying */}
      {step === 'verifying' && (
        <Card padding="lg">
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 size={36} className="text-blue-600 animate-spin" />
            <div className="text-center">
              <div className="font-semibold text-slate-900">Verifying…</div>
              <div className="text-sm text-slate-500 mt-1">Confirming the caller's identity using your selected method.</div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Success */}
      {step === 'success' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle size={36} className="text-green-600" />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-800">Caller verified</div>
                <div className="text-sm text-slate-600 mt-1">Independent verification was successful.</div>
              </div>
            </div>
          </Card>

          {/* Score change */}
          <Card header={<span className="text-sm font-semibold text-slate-700">Security status updated</span>}>
            <div className="flex items-center justify-around py-3">
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-2">Before verification</div>
                <SecurityScoreDisplay score={priorScore} severity={priorSeverity} />
              </div>
              <div className="text-slate-400 text-lg font-bold">→</div>
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-2">After verification</div>
                <SecurityScoreDisplay score={postScore} severity={postSeverity} />
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center border-t border-slate-100 pt-3 mt-2">
              Independent verification reduced the security concern. The original analysis was not wrong — additional confirmation simply provided more confidence.
            </p>
          </Card>

          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => navigate('/live')}>Return to Call</Button>
            <Button variant="outline" fullWidth onClick={() => navigate('/home')}>Go to Home</Button>
          </div>
        </div>
      )}

      {/* Step 3: Failed */}
      {step === 'failed' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle size={36} className="text-red-600" />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-800">Verification failed</div>
                <div className="text-sm text-slate-600 mt-1">We could not independently confirm this caller.</div>
              </div>
            </div>
          </Card>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <strong>Do not share</strong> any sensitive information, OTPs, passwords, or financial details with this caller.
          </div>

          <div className="flex gap-3">
            <Button variant="danger" fullWidth icon={<PhoneOff size={15} />} onClick={() => navigate('/home')}>
              End Call
            </Button>
            <Button variant="outline" fullWidth icon={<ShieldAlert size={15} />} onClick={() => navigate('/alert')}>
              Contact Security
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
