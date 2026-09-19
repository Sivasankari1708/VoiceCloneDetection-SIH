import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Phone, PhoneOff, Shield } from 'lucide-react';
import { userSocketService } from '../../services/calls/userSocketService';
import { callBridge } from '../../services/calls/callBridge';
import { useAuth } from '../../context/AppContext';
import { liveCallStream } from '../../services/calls/liveCallStream';
import { WebSocketLiveCallStreamImpl } from '../../services/calls/webSocketLiveCallStream';
import { warningAudioService } from '../../services/warningAudioService';
import type { IncomingCallData } from '../../types';

let activeRingCtx: AudioContext | null = null;
let activeRingOsc1: OscillatorNode | null = null;
let activeRingOsc2: OscillatorNode | null = null;
let activeRingGain: GainNode | null = null;
let activeRingInterval: number | null = null;

export function stopIncomingCallChime() {
  if (activeRingInterval !== null) {
    clearInterval(activeRingInterval);
    activeRingInterval = null;
  }
  if (activeRingOsc1) {
    try {
      activeRingOsc1.stop();
    } catch {}
    try {
      activeRingOsc1.disconnect();
    } catch {}
    activeRingOsc1 = null;
  }
  if (activeRingOsc2) {
    try {
      activeRingOsc2.stop();
    } catch {}
    try {
      activeRingOsc2.disconnect();
    } catch {}
    activeRingOsc2 = null;
  }
  if (activeRingGain) {
    try {
      activeRingGain.disconnect();
    } catch {}
    activeRingGain = null;
  }
  if (activeRingCtx) {
    try {
      if (activeRingCtx.state !== 'closed') {
        activeRingCtx.close().catch(() => {});
      }
    } catch {}
    activeRingCtx = null;
  }
}

function playIncomingCallChime() {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  // NEVER play ringtone if user is already on the call page (/live) or on caller/sender consoles
  if (path.startsWith('/attacker') || path.startsWith('/sender') || path.startsWith('/live')) {
    stopIncomingCallChime();
    return;
  }

  stopIncomingCallChime();
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    activeRingCtx = ctx;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    activeRingOsc1 = osc1;
    activeRingOsc2 = osc2;

    const gain = ctx.createGain();
    activeRingGain = gain;

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.setValueAtTime(480, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 1.5);
    osc2.stop(ctx.currentTime + 1.5);
  } catch (err) {
    // Audio autoplay restrictions or unsupported
  }
}

export default function IncomingCallModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [declinedNotice, setDeclinedNotice] = useState<string | null>(null);

  const isExcludedPage =
    location.pathname.startsWith('/attacker') ||
    location.pathname.startsWith('/sender') ||
    location.pathname.startsWith('/live');

  // 1. Cross-Tab Call Bridge Listener (Authoritative attacker -> user event)
  useEffect(() => {
    const unsubBridge = callBridge.subscribe((event) => {
      // Unconditionally stop chime and clear incoming call state on accept/end/decline
      if (
        event.type === 'CALL_ENDED' ||
        event.type === 'CALL_DECLINED' ||
        event.type === 'CALL_ACCEPTED'
      ) {
        setIncomingCall(null);
        stopIncomingCallChime();
        return;
      }

      // Never ring or display incoming modal on caller console or live call page
      if (
        window.location.pathname.startsWith('/attacker') ||
        window.location.pathname.startsWith('/sender') ||
        window.location.pathname.startsWith('/live')
      ) {
        return;
      }

      if (event.type === 'INCOMING_CALL' && event.payload) {
        console.info('[IncomingCallModal] Authoritative INCOMING_CALL received:', event.payload);
        setDeclinedNotice(null);
        setIncomingCall(event.payload);
      }
    });

    return () => {
      unsubBridge();
      stopIncomingCallChime();
    };
  }, []);

  // 2. Personal WebSocket Listener (Push-only from backend /ws/user/{user_id})
  useEffect(() => {
    if (!user) return;
    userSocketService.connect(user.id);

    const unsubscribe = userSocketService.subscribe((event) => {
      // Unconditionally stop chime and clear incoming call state on accept/end/reject
      if (
        event.type === 'CALL_ENDED' ||
        event.type === 'CALL_REJECTED' ||
        event.type === 'CALL_ACCEPTED'
      ) {
        setIncomingCall(null);
        stopIncomingCallChime();
        return;
      }

      if (
        window.location.pathname.startsWith('/attacker') ||
        window.location.pathname.startsWith('/sender') ||
        window.location.pathname.startsWith('/live')
      ) {
        return;
      }

      if (event.type === 'INCOMING_CALL' && event.data) {
        console.info('[IncomingCallModal] Backend personal WebSocket INCOMING_CALL received:', event.data);
        setDeclinedNotice(null);
        setIncomingCall(event.data);
      }
    });

    return () => {
      unsubscribe();
      stopIncomingCallChime();
    };
  }, [user]);

  // Ringtone Chime Loop while ringing (strictly on valid recipient pages)
  useEffect(() => {
    if (incomingCall && !isExcludedPage) {
      playIncomingCallChime();
      activeRingInterval = window.setInterval(playIncomingCallChime, 3000);
    } else {
      stopIncomingCallChime();
    }
    return () => {
      stopIncomingCallChime();
    };
  }, [incomingCall, isExcludedPage]);

  // Suppress incoming call modal on attacker console, sender, or active live page
  if (isExcludedPage) {
    return null;
  }

  if (!incomingCall) return null;

  const isLiveCall =
    incomingCall?.claimed_org_id === 'org_direct' ||
    (incomingCall as any)?.scenario?.attackType === 'Live Voice Call' ||
    (incomingCall as any)?.scenario?.attackType === 'Benign / Genuine Conversation';

  const callerDisplayName = incomingCall?.caller_name || (isLiveCall ? 'Aarav Sharma' : 'Rajesh Kumar');
  const claimedOrgName = incomingCall?.claimed_org_name || 'Indian Overseas Bank';
  const designation = (incomingCall as any)?.caller_designation || (isLiveCall ? 'Direct Caller' : 'Bank Manager');
  const attackType = (incomingCall as any)?.scenario?.attackType || 'AI Voice Clone / Impersonation';

  const handleAccept = async () => {
    const session = incomingCall;
    // Immediately stop ringtone audio and timer
    stopIncomingCallChime();
    setIncomingCall(null);

    // 1. Notify callBridge
    await callBridge.acceptCall(session.session_id);

    // 2. Initialize & unlock warning audio playback on user acceptance gesture
    warningAudioService.initAudioPlayback();

    // 3. Unmute playback audio if audio stream is active
    if (liveCallStream instanceof WebSocketLiveCallStreamImpl) {
      liveCallStream.resumePlaybackAudio();
    }

    // 4. Navigate recipient to Live Call page connected to this session with call_mode
    const modeParam = isLiveCall ? 'live' : 'simulation';
    navigate(
      `/live?session_id=${session.session_id}&caller_name=${encodeURIComponent(
        session.caller_name || 'Inbound Caller'
      )}&claimed_speaker=${encodeURIComponent(session.claimed_speaker_id || '')}&call_mode=${modeParam}`
    );
  };

  const handleDecline = async () => {
    const sessionId = incomingCall?.session_id;
    // Immediately stop ringtone audio and timer
    stopIncomingCallChime();
    setIncomingCall(null);
    setDeclinedNotice("Call declined. You remain protected and idle.");
    setTimeout(() => setDeclinedNotice(null), 3000);
    if (sessionId) {
      await callBridge.declineCall(sessionId);
    }
  };

  if (!incomingCall && declinedNotice) {
    return (
      <div className="fixed top-6 right-6 z-50 animate-fade-in">
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs border border-slate-700 font-medium">
          <PhoneOff size={14} className="text-red-400" />
          <span>{declinedNotice}</span>
        </div>
      </div>
    );
  }

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden text-center p-6 space-y-4">
        {/* Ringing Indicator */}
        <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full animate-ping ${
              isLiveCall ? 'bg-blue-500/20' : 'bg-red-500/20'
            }`}
          />
          <div
            className={`w-14 h-14 rounded-full text-white flex items-center justify-center shadow-md ${
              isLiveCall ? 'bg-blue-600' : 'bg-red-600'
            }`}
          >
            <Phone size={24} className="animate-bounce" />
          </div>
        </div>

        <div>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold border mb-2 ${
              isLiveCall
                ? 'bg-blue-50 text-blue-800 border-blue-200/80'
                : 'bg-red-50 text-red-800 border-red-200/80'
            }`}
          >
            <Shield size={12} />
            {isLiveCall ? 'DIRECT LIVE CALL' : 'SIMULATED IMPERSONATION ATTACK'}
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {callerDisplayName}
          </h2>
          {isLiveCall ? (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200/70 rounded-lg px-3 py-1.5 mt-2 font-medium">
              Direct Inbound Voice Call • Live Speech Verification Active
            </p>
          ) : (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-1.5 mt-2 font-medium">
              Caller claims to represent <strong>{claimedOrgName}</strong>
            </p>
          )}
        </div>

        {/* Identity & Org Details */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500 font-normal">Caller:</span>
            <span className="font-semibold text-slate-900">{callerDisplayName}</span>
          </div>
          {isLiveCall ? (
            <>
              <div className="flex justify-between">
                <span className="text-slate-500 font-normal">Call Type:</span>
                <span className="font-semibold text-blue-700">Direct Inbound (Live Mic)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-normal">Target:</span>
                <span className="font-semibold text-slate-900">Sreya Sengupta</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200">
                <span className="text-slate-500 font-normal">Protection Engine:</span>
                <span className="font-medium text-emerald-700">
                  Real-time Clone Detection Enabled
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-slate-500 font-normal">Claimed Organization:</span>
                <span className="font-semibold text-slate-900">{claimedOrgName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-normal">Designation:</span>
                <span className="font-semibold text-slate-900">{designation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-normal">Attack Profile:</span>
                <span className="font-bold text-red-700">{attackType}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200">
                <span className="text-slate-500 font-normal">Security Notice:</span>
                <span className="font-medium text-amber-700 italic">
                  Impersonation verification pending answer
                </span>
              </div>
            </>
          )}
        </div>

        <p className="text-[11px] text-slate-400">
          This call will NOT automatically connect. Press Accept to start live voice verification or Decline to reject.
        </p>

        {/* Accept / Decline Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleDecline}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 font-semibold text-xs transition-colors border border-slate-200 hover:border-red-200 cursor-pointer"
          >
            <PhoneOff size={15} />
            DECLINE
          </button>
          <button
            onClick={handleAccept}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer ${
              isLiveCall
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <Phone size={15} />
            ACCEPT CALL
          </button>
        </div>
      </div>
    </div>
  );
}
