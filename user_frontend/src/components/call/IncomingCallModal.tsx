import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, PhoneOff, Shield } from 'lucide-react';
import { userSocketService } from '../../services/calls/userSocketService';
import { useAuth } from '../../context/AppContext';
import { config } from '../../services/config';
import type { IncomingCallData } from '../../types';

export default function IncomingCallModal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);

  useEffect(() => {
    if (!user) return;

    // Connect user socket for real-time incoming call notifications
    userSocketService.connect(user.id);

    const unsubscribe = userSocketService.subscribe((event) => {
      if (event.type === 'INCOMING_CALL') {
        console.info('[IncomingCallModal] Displaying incoming call:', event.data);
        setIncomingCall(event.data);
      } else if (event.type === 'CALL_ENDED') {
        if (incomingCall && incomingCall.session_id === event.data.session_id) {
          console.info('[IncomingCallModal] Call ended by caller, dismissing modal.');
          setIncomingCall(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, incomingCall]);

  // The attacker / caller persona MUST NOT see incoming-call recipient UI
  if (!user || user.role === 'CALLER' || user.role === 'ATTACKER') return null;
  if (!incomingCall) return null;

  const handleAccept = async () => {
    const session = incomingCall;
    setIncomingCall(null);
    try {
      const token = localStorage.getItem('voiceshield_token');
      await fetch(`${config.apiBaseUrl}/api/calls/${session.session_id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch (err) {
      console.warn('[IncomingCallModal] Error accepting call:', err);
    }
    // Navigate recipient to Live Call page connected to this backend session
    navigate(`/live?session_id=${session.session_id}&caller_name=${encodeURIComponent(session.caller_name || 'Inbound Caller')}&claimed_speaker=${encodeURIComponent(session.claimed_speaker_id || '')}`);
  };

  const handleDecline = async () => {
    const sessionId = incomingCall.session_id;
    setIncomingCall(null);
    try {
      const token = localStorage.getItem('voiceshield_token');
      await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: 'CALL_DECLINED' }),
      });
    } catch (err) {
      console.warn('[IncomingCallModal] Error declining call:', err);
    }
  };

  const claimedName =
    incomingCall.claimed_speaker_id === 'LA_0069'
      ? 'Rajesh Malhotra (CFO, Apex Financial Corp)'
      : incomingCall.claimed_speaker_id || 'External Caller';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-center p-6 space-y-5">
        {/* Pulsing Shield & Ringing Indicator */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md">
            <Phone size={28} className="animate-bounce" />
          </div>
        </div>

        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-200 mb-2">
            <Shield size={12} />
            INCOMING PROTECTED CALL
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {incomingCall.caller_name || 'Inbound Call'}
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">Status: <span className="font-semibold text-blue-600 uppercase">RINGING</span></p>
        </div>

        {/* Call Attributes */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Caller:</span>
            <span className="font-medium text-slate-900">{incomingCall.caller_name || 'Unknown'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Claimed Identity:</span>
            <span className="font-medium text-slate-900">{claimedName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Claimed Organization:</span>
            <span className="font-medium text-slate-900">{incomingCall.claimed_org_name || 'Apex Financial Corp'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Protection:</span>
            <span className="font-medium text-green-700 flex items-center gap-1">
              <Shield size={13} /> Active Defense
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          VoiceShield AI pipeline will analyze audio for synthetic cloning and biometric authenticity.
        </p>

        {/* Accept / Decline Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleDecline}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-sm transition-colors border border-red-200 cursor-pointer"
          >
            <PhoneOff size={16} />
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors shadow-sm cursor-pointer"
          >
            <Phone size={16} />
            Accept Call
          </button>
        </div>
      </div>
    </div>
  );
}
