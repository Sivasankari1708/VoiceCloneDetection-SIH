import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Shield, CheckCircle, XCircle, Loader2, PhoneOff, ShieldAlert, HelpCircle, Mic, Users, Activity
} from 'lucide-react';
import { useActiveCall, useAppContext, useSettings } from '../context/AppContext';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import SecurityScoreDisplay from '../components/severity/SecurityScoreDisplay';
import type { VerificationMethod, CallerIdentity } from '../types';
import { getWarningText } from '../utils/translations';

export const submitEmployeeAction = (sessionId: string | undefined, action: string, details?: string) => {
  if (sessionId) {
    fetch(`http://localhost:8002/api/calls/${sessionId}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('voiceshield_token')}`
      },
      body: JSON.stringify({ action, details })
    }).catch(e => console.error("Failed to submit employee action", e));
  }
};

type ExtendedVerificationMethod = VerificationMethod | 'active_challenge' | 'directory';

type VStep = 'confirm' | 'choose' | 'challenge_presented' | 'listening' | 'analyzing' | 'verifying' | 'success' | 'failed' | 'degraded' | 'suspicious' | 'service_unavailable';

const METHODS: { id: ExtendedVerificationMethod; icon: React.ElementType; label: string; desc: string }[] = [
  { id: 'active_challenge', icon: Mic, label: 'VoiceShield Challenge', desc: 'Ask the caller to read a random phrase to verify liveness and identity.' },
  { id: 'trusted_call', icon: Phone, label: 'Call trusted number', desc: 'Call the person back on their known official number.' },
  { id: 'mfa', icon: Shield, label: 'MFA / Authenticator', desc: 'Verify the caller using a shared authenticator app.' },
  { id: 'directory', icon: Users, label: 'Directory lookup', desc: 'Verify internal employee ID and department details.' },
];

export default function VerificationPage() {
  const navigate = useNavigate();
  const { activeCall, updateActiveCall } = useActiveCall();
  const { dispatch } = useAppContext();
  const { settings } = useSettings();
  const lang = settings.warningLanguage;

  const caller: CallerIdentity = activeCall?.caller ?? {
    name: 'Current Caller',
    claimedRole: 'Caller',
    organization: 'Protected Entity',
    status: 'unverified',
    statusMessage: 'Caller verification pending',
  };

  const [step, setStep] = useState<VStep>('confirm');
  const [selectedMethod, setSelectedMethod] = useState<ExtendedVerificationMethod | null>(null);
  const [simulatedOutcome, setSimulatedOutcome] = useState<'success' | 'degraded' | 'failed' | 'suspicious'>('success');
  const [challengePhrase, setChallengePhrase] = useState('');

  const priorScore = activeCall?.security.score ?? 92;
  const priorSeverity = activeCall?.security.severity ?? 'CRITICAL';
  const postScore = 21;
  const postSeverity = 'LOW' as const;

  // Generate random phrase
  useEffect(() => {
    const adjectives = ['Blue', 'Silent', 'Golden', 'Swift', 'Crimson', 'Silver'];
    const nouns = ['River', 'Eagle', 'Shield', 'Mountain', 'Forest', 'Horizon'];
    const number = Math.floor(Math.random() * 90) + 10; // 10-99
    
    const randomA = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomN = nouns[Math.floor(Math.random() * nouns.length)];
    
    setChallengePhrase(`${randomA} ${randomN} ${number}`);
  }, []);

    const handleApplyResult = (outcome: 'success' | 'degraded' | 'failed' | 'suspicious') => {
      if (activeCall?.id) {
        fetch(`http://localhost:8002/api/calls/${activeCall.id}/verification/result`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('voiceshield_token')}`
          },
          body: JSON.stringify({
            outcome: outcome === 'success' ? 'VERIFIED' : outcome.toUpperCase(),
            method: selectedMethod || 'unknown'
          })
        }).catch(e => console.error("Failed to submit verification result", e));
      }

    if (outcome === 'failed' || outcome === 'suspicious') {
      setStep(outcome);
    } else if (outcome === 'degraded') {
      setStep('degraded');
      if (activeCall) {
        updateActiveCall({
          security: {
            ...activeCall.security,
            score: 55,
            severity: 'CAUTION',
            message: "We couldn't confidently verify the caller. Voice or call conditions may be affecting verification.",
            callerIdentity: 'degraded',
          },
          caller: {
            ...activeCall.caller,
            status: 'degraded',
            statusMessage: "We couldn't confidently verify the caller. Voice or call conditions may be affecting verification.",
            degradedReason: 'Acoustic variance or channel background noise.',
          },
        });
      }
      dispatch({
        type: 'ADD_NOTIFICATION',
        payload: {
          id: `notif-verify-${Date.now()}`,
          type: 'verification_complete',
          title: 'Verification Degraded',
          message: `Verification for ${caller.name} was inconclusive due to voice or channel conditions. Additional verification recommended.`,
          read: false,
          createdAt: new Date(),
        },
      });
    } else {
      setStep('success');
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
  };

  const handleVerify = async () => {
    if (!selectedMethod) return;

    if (selectedMethod === 'active_challenge') {
      if (activeCall?.id) {
        setStep('verifying'); // temporary loading state
        try {
          const res = await fetch(`http://localhost:8002/api/calls/${activeCall.id}/verification/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('voiceshield_token')}`
            }
          });
          if (res.ok) {
            const data = await res.json();
            setChallengePhrase(data.challenge_phrase || challengePhrase);
            setStep('challenge_presented');
          } else {
            setStep('service_unavailable');
          }
        } catch (e) {
          console.error("Failed to start backend verification:", e);
          setStep('service_unavailable');
        }
      } else {
        setStep('service_unavailable');
      }
    } else {
      // Independent verification methods (trusted_call, mfa, directory)
      submitEmployeeAction(activeCall?.id, 'INDEPENDENT_VERIFICATION', `Method: ${selectedMethod}`);
      setStep('verifying');
      setTimeout(() => {
        handleApplyResult(simulatedOutcome);
      }, 2200);
    }
  };

  const handleStartListening = () => {
    setStep('listening');
    // Simulate listening for 3 seconds
    setTimeout(() => {
      setStep('analyzing');
      // Simulate analysis for 2 seconds
      setTimeout(() => {
        handleApplyResult(simulatedOutcome);
      }, 2000);
    }, 3000);
  };

  const stepIndex = { 
    confirm: 0, 
    choose: 1, 
    challenge_presented: 2, 
    listening: 2, 
    analyzing: 2, 
    verifying: 2, 
    success: 2, 
    degraded: 2, 
    failed: 2,
    suspicious: 2,
    service_unavailable: 2
  }[step];

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Verify this caller</h1>
        <p className="text-slate-500 text-sm mt-1">{getWarningText('verification', lang)}</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {['Confirm identity', 'Choose method', 'Result'].map((label, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0
              ${i < stepIndex ? 'bg-blue-600 text-white' : i === stepIndex ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {i < stepIndex ? <CheckCircle size={13} /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === stepIndex ? 'text-blue-900 font-bold' : 'text-slate-400'}`}>{label}</span>
            {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Confirm */}
      {step === 'confirm' && (
        <Card header={<span className="text-sm font-semibold text-slate-700">Step 1 — Confirm identity</span>}>
          <div className="flex items-center gap-4 py-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-900 text-white text-xl font-semibold flex items-center justify-center flex-shrink-0">
              {caller.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">{caller.name}</div>
              <div className="text-slate-500 text-sm">{caller.claimedRole}</div>
              <div className="text-xs text-slate-400">{caller.organization}</div>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-3 mb-4 leading-relaxed">
            You are about to verify the identity of <strong>{caller.name}</strong>. 
            This will confirm whether the caller is who they claim to be, and help VoiceShield assess communication risk.
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
              className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer
                ${selectedMethod === id ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-300' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedMethod === id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <div className="font-medium text-slate-900 text-sm">{label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </div>
                {selectedMethod === id && <CheckCircle size={16} className="text-blue-700 ml-auto flex-shrink-0 mt-1" />}
              </div>
            </button>
          ))}

          {/* Prototype outcome simulation selector */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Simulation Mode Outcome (Prototype)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSimulatedOutcome('success')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  simulatedOutcome === 'success'
                    ? 'bg-white border-blue-600 text-blue-800 shadow-xs'
                    : 'bg-transparent border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                Verified
              </button>
              <button
                type="button"
                onClick={() => setSimulatedOutcome('degraded')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  simulatedOutcome === 'degraded'
                    ? 'bg-white border-amber-500 text-amber-800 shadow-xs'
                    : 'bg-transparent border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                Degraded
              </button>
              <button
                type="button"
                onClick={() => setSimulatedOutcome('failed')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  simulatedOutcome === 'failed'
                    ? 'bg-white border-red-500 text-red-800 shadow-xs'
                    : 'bg-transparent border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                Failed
              </button>
              <button
                type="button"
                onClick={() => setSimulatedOutcome('suspicious')}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  simulatedOutcome === 'suspicious'
                    ? 'bg-white border-red-700 text-red-900 shadow-xs'
                    : 'bg-transparent border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                Suspicious
              </button>
            </div>
          </div>

          <Button variant="primary" fullWidth disabled={!selectedMethod} onClick={handleVerify}>
            Begin Verification
          </Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('confirm')}>Back</Button>
        </div>
      )}

      {/* Step 3: Active Challenge Presented */}
      {step === 'challenge_presented' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card header={<span className="text-sm font-semibold text-slate-700">VoiceShield Challenge</span>}>
            <div className="py-4 space-y-4">
              <p className="text-sm text-slate-600">
                Please ask the caller to repeat the following phrase naturally. This will help us verify their identity and ensure liveness.
              </p>
              
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Challenge Phrase</span>
                <div className="text-2xl font-mono font-bold text-slate-900 tracking-tight">
                  "{challengePhrase}"
                </div>
              </div>
            </div>
            
            <Button variant="primary" fullWidth onClick={handleStartListening} icon={<Mic size={16} />}>
              Start Listening
            </Button>
            <div className="mt-2 text-center text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              Prototype Simulation
            </div>
          </Card>
        </div>
      )}

      {/* Step 3: Listening (Challenge) */}
      {step === 'listening' && (
        <Card padding="lg">
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20"></div>
              <div className="w-16 h-16 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center relative z-10">
                <Activity size={32} className="text-blue-600" />
              </div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-slate-900">Listening to caller...</div>
              <div className="text-sm text-slate-500 mt-1">Analyzing voice response for liveness and identity match.</div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Analyzing (Challenge) */}
      {step === 'analyzing' && (
        <Card padding="lg">
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 size={40} className="text-blue-700 animate-spin" />
            <div className="text-center">
              <div className="font-semibold text-slate-900">Analyzing Response</div>
              <div className="text-sm text-slate-500 mt-1">Verifying challenge completion...</div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Verifying (Independent) */}
      {step === 'verifying' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 size={36} className="text-blue-700 animate-spin" />
              <div className="text-center">
                <div className="font-semibold text-slate-900">Awaiting Independent Verification</div>
                <div className="text-sm text-slate-500 mt-1">
                  {selectedMethod === 'trusted_call' && 'Call the registered contact number to confirm.'}
                  {selectedMethod === 'mfa' && 'Confirm this request using your organization\'s authentication method.'}
                  {selectedMethod === 'directory' && 'Check the caller through your organization\'s trusted directory.'}
                </div>
              </div>
            </div>
          </Card>
          
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 leading-relaxed font-medium flex gap-3 items-start">
            <ShieldAlert size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>Security Warning:</strong> Do not verify the caller through this current phone call. You must use a separate, trusted channel.
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 'success' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <CheckCircle size={36} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-slate-900">Caller Verified</div>
                <div className="text-sm text-slate-600 mt-1">
                  {selectedMethod === 'active_challenge' 
                    ? 'The caller completed the verification successfully.' 
                    : 'Independent verification was successful.'}
                </div>
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
              Verification provided confidence. Communication risk reduced to safe levels.
            </p>
          </Card>

          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => navigate('/live')}>Return to Call</Button>
            <Button variant="outline" fullWidth onClick={() => { submitEmployeeAction(activeCall?.id, 'END_CALL'); navigate('/home'); }}>Go to Home</Button>
          </div>
        </div>
      )}

      {/* Step 3: Verification Degraded State */}
      {step === 'degraded' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700">
                <HelpCircle size={36} />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-slate-900">VERIFICATION DEGRADED</div>
                <div className="text-sm text-slate-600 mt-1 max-w-md">
                  {selectedMethod === 'active_challenge'
                    ? 'We could not confidently complete verification. Voice conditions may be affecting the result. Try another verification method.'
                    : 'We couldn\'t confidently verify the caller. Voice or call conditions may be affecting verification.'}
                </div>
              </div>
            </div>
          </Card>

          <Card header={<span className="text-sm font-semibold text-slate-700">Diagnostic Factors</span>}>
            <div className="space-y-2.5 text-xs text-slate-600 py-1">
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1 flex-shrink-0" />
                <span>Possible causes: Call quality, background noise, or voice condition changed.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-700 mt-1 flex-shrink-0" />
                <span className="font-semibold text-blue-900">
                  Recommended action: Use an additional independent verification step before continuing with sensitive requests.
                </span>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="primary" fullWidth onClick={() => setStep('choose')}>Try Another Method</Button>
            <Button variant="outline" fullWidth onClick={() => navigate('/live')}>Return to Call</Button>
          </div>
        </div>
      )}

      {/* Step 3: Failed */}
      {step === 'failed' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
                <XCircle size={36} className="text-red-600" />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-900">Verification Failed</div>
                <div className="text-sm text-slate-600 mt-1">
                  The caller could not complete verification.
                </div>
              </div>
            </div>
          </Card>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-950 leading-relaxed font-medium">
            <strong>Security Warning:</strong> {getWarningText('verification_failed', lang)}
          </div>

          <div className="flex gap-3">
            <Button variant="danger" fullWidth icon={<PhoneOff size={15} />} onClick={() => { submitEmployeeAction(activeCall?.id, 'END_CALL'); navigate('/home'); }}>
              End Call
            </Button>
            <Button variant="outline" fullWidth icon={<ShieldAlert size={15} />} onClick={() => { submitEmployeeAction(activeCall?.id, 'ESCALATE_TO_SOC'); navigate('/alert'); }}>
              Contact Security
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Suspicious */}
      {step === 'suspicious' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-red-100 border border-red-300 flex items-center justify-center">
                <ShieldAlert size={36} className="text-red-700" />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-900">Suspicious Activity</div>
                <div className="text-sm text-slate-600 mt-1">
                  The verification attempt showed signs that require additional protection. Liveness or identity match failed.
                </div>
              </div>
            </div>
          </Card>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-950 leading-relaxed font-medium">
            <strong>Security Warning:</strong> High risk of impersonation or replay attack detected during verification. Terminate the call.
          </div>

          <div className="flex gap-3">
            <Button variant="danger" fullWidth icon={<PhoneOff size={15} />} onClick={() => { submitEmployeeAction(activeCall?.id, 'END_CALL'); navigate('/home'); }}>
              End Call
            </Button>
            <Button variant="outline" fullWidth icon={<ShieldAlert size={15} />} onClick={() => { submitEmployeeAction(activeCall?.id, 'ESCALATE_TO_SOC'); navigate('/alert'); }}>
              Escalate to SOC
            </Button>
          </div>
        </div>
      )}
      {/* Step 3: Service Unavailable (Fail-Safe) */}
      {step === 'service_unavailable' && (
        <div className="space-y-4 animate-fade-in-up">
          <Card padding="lg">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center">
                <ShieldAlert size={36} className="text-amber-700" />
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-amber-900">Verification service unavailable</div>
                <div className="text-sm text-slate-600 mt-1">
                  We could not connect to the real-time verification backend.
                </div>
              </div>
            </div>
          </Card>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 leading-relaxed font-medium">
            <strong>Action Required:</strong> Verification could not be completed. For your safety, do not proceed with sensitive actions.
          </div>

          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setStep('choose')}>
              Retry
            </Button>
            <Button variant="outline" fullWidth onClick={() => { submitEmployeeAction(activeCall?.id, 'INDEPENDENT_VERIFICATION'); navigate('/live'); }}>
              Independent Verification
            </Button>
            <Button variant="danger" fullWidth icon={<PhoneOff size={15} />} onClick={() => { submitEmployeeAction(activeCall?.id, 'END_CALL'); navigate('/home'); }}>
              End Call
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
