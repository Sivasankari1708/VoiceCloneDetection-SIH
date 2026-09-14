import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PhoneOutgoing,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  FileAudio,
  Activity,
  RefreshCw,
  LogOut,
  Volume2,
} from 'lucide-react';
import { config } from '../services/config';
import { authService } from '../services/auth/authService';
import { useAuth } from '../context/AppContext';
import { WebSocketLiveCallStreamImpl } from '../services/calls/webSocketLiveCallStream';
import { userSocketService } from '../services/calls/userSocketService';
import type { CallEvent } from '../types';
import LiveVoiceWaveform from '../components/waveform/LiveVoiceWaveform';

interface BackendUserSummary {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
}

const SEEDED_FALLBACK_RECIPIENTS: BackendUserSummary[] = [
  {
    id: 'user_sreya_001',
    username: 'sreya',
    full_name: 'Sreya Sengupta',
    email: 'sreya.sengupta@gmail.com',
    role: 'USER',
  },
  {
    id: 'user_caller_001',
    username: 'caller',
    full_name: 'Aarav Sharma (Citizen)',
    email: 'aarav@external.net',
    role: 'USER',
  },
];

interface TestAudioSource {
  id: string;
  name: string;
  description: string;
  sampleUrl: string;
}

const TEST_AUDIO_SOURCES: TestAudioSource[] = [
  {
    id: 'sample_wire_transfer',
    name: 'Sample 1: Audio Recording (Wire Transfer Inquiry)',
    description: 'Telephone conversation audio discussing urgent fund authorization and identity.',
    sampleUrl: '/samples/cfo_rajesh_urgent_wire.wav',
  },
  {
    id: 'sample_exec_statement',
    name: 'Sample 2: Audio Recording (Executive Statement)',
    description: 'Spoken dialogue audio recording discussing quarterly operations.',
    sampleUrl: '/samples/real_speech_tts.wav',
  },
  {
    id: 'sample_external_speech',
    name: 'Sample 3: Audio Recording (External Caller Statement)',
    description: 'Natural voice dialogue audio from external speaker.',
    sampleUrl: '/samples/speaker_b_test.wav',
  },
  {
    id: 'sample_synthetic_benchmark',
    name: 'Sample 4: Audio Recording (Acoustic Benchmark)',
    description: 'Standard acoustic benchmark audio sample.',
    sampleUrl: '/samples/tts_cloned_ava.wav',
  },
];

export default function AttackerPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // 1. Target Recipient
  const [recipients, setRecipients] = useState<BackendUserSummary[]>(SEEDED_FALLBACK_RECIPIENTS);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('user_sreya_001');

  // 2. Audio Source Selection (Input source only — never determines classification)
  const [audioSourceType, setAudioSourceType] = useState<'mic' | 'file'>('mic');
  const [selectedSampleId, setSelectedSampleId] = useState<string>('sample_wire_transfer');

  // 3. Call Lifecycle: 'idle' | 'ringing' | 'active' | 'ended' | 'error'
  const [callState, setCallState] = useState<'idle' | 'ringing' | 'active' | 'ended' | 'error'>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(true);
  const [waveformActivity, setWaveformActivity] = useState(0.05);

  // Live Transmission Status Feedback
  const [statusNote, setStatusNote] = useState('Ready to place call to recipient');
  const [lastTranscript, setLastTranscript] = useState<string>('');

  const streamRef = useRef<WebSocketLiveCallStreamImpl | null>(null);

  // Load real recipient users from backend
  const loadRecipients = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const token = authService.getToken();
      const res = await fetch(`${config.apiBaseUrl}/api/auth/users`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const users: BackendUserSummary[] = await res.json();
        if (users && users.length > 0) {
          const filtered = users.filter((u) => u.role !== 'CALLER' && u.username !== 'attacker');
          setRecipients(filtered.length > 0 ? filtered : users);
          setSelectedRecipientId((curr) => {
            if (curr && users.some((u) => u.id === curr)) return curr;
            const sreya = users.find((u) => u.username.toLowerCase() === 'sreya');
            return sreya ? sreya.id : users[0].id;
          });
        }
      }
    } catch (err) {
      console.warn('[AttackerPage] Failed to fetch users, using seeded fallback:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadRecipients();
  }, [loadRecipients]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.stop(false);
        streamRef.current = null;
      }
    };
  }, []);

  // Connect personal user WebSocket to receive CALL_ACCEPTED event directly
  useEffect(() => {
    if (!user) return;
    userSocketService.connect(user.id);
    const unsubscribe = userSocketService.subscribe((event) => {
      if (event.type === 'CALL_ACCEPTED') {
        const data = event.data;
        if (data && (!activeSessionId || data.session_id === activeSessionId)) {
          console.info('[AttackerPage] User socket received CALL_ACCEPTED:', data);
          setCallState('active');
          setStatusNote('Call accepted by recipient! Audio streaming is now active.');
          if (streamRef.current) {
            streamRef.current.notifyCallAccepted(data);
          }
        }
      } else if (event.type === 'CALL_ENDED') {
        setCallState('ended');
        setStatusNote('Call ended.');
      }
    });
    return () => {
      unsubscribe();
    };
  }, [user, activeSessionId]);

  // 1-second polling fallback while ringing to guarantee synchronization
  useEffect(() => {
    if (callState !== 'ringing' || !activeSessionId) return;

    const pollInterval = setInterval(async () => {
      try {
        const token = authService.getToken();
        const res = await fetch(`${config.apiBaseUrl}/api/calls/${activeSessionId}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (res.ok) {
          const callData = await res.json();
          if (callData.status === 'ACTIVE') {
            console.info('[AttackerPage] Poller detected call is ACTIVE — starting audio transmission');
            setCallState('active');
            setStatusNote('Call accepted by recipient! Live audio transmission active.');
            if (streamRef.current) {
              streamRef.current.notifyCallAccepted(callData);
            }
          } else if (callData.status === 'ENDED' || callData.status === 'TERMINATED') {
            setCallState('ended');
            setStatusNote('Call ended.');
          }
        }
      } catch (err) {
        console.warn('[AttackerPage] Polling call status failed:', err);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [callState, activeSessionId]);

  const activeAudioSample = TEST_AUDIO_SOURCES.find((s) => s.id === selectedSampleId) || TEST_AUDIO_SOURCES[0];

  const handleStartCall = async () => {
    if (callState === 'active' || callState === 'ringing') return;

    const targetUser = recipients.find((r) => r.id === selectedRecipientId);
    const targetName = targetUser ? targetUser.full_name : 'Recipient';

    setCallState('ringing');
    setStatusNote(`Calling ${targetName}... Waiting for recipient to accept`);
    setLastTranscript('');

    const stream = new WebSocketLiveCallStreamImpl();
    streamRef.current = stream;

    stream.subscribe((evt: CallEvent) => {
      if (evt.type === 'call_accepted') {
        setCallState('active');
        setStatusNote('Call accepted by recipient! Live audio transmission active.');
      } else if (evt.type === 'security_update') {
        const payload = evt.payload;
        if (payload.transcript && payload.transcript.length > 0) {
          const latest = payload.transcript[payload.transcript.length - 1];
          if (latest) {
            setLastTranscript(latest.text);
          }
        }
      } else if (evt.type === 'waveform_update') {
        if (evt.payload.waveformActivity !== undefined) {
          setWaveformActivity(evt.payload.waveformActivity);
        }
      } else if (evt.type === 'call_ended') {
        setCallState('ended');
        setStatusNote('Call ended.');
      }
    });

    try {
      // NOTE: Attacker specifies ONLY real recipient and audio input.
      // Zero claimed identity, zero speaker ID, zero scenario classification.
      await stream.start({
        callId: `call-${Date.now()}`,
        recipientUserId: selectedRecipientId,
        callerName: 'Incoming Call',
        claimedSpeakerId: undefined,
        claimedOrgId: undefined,
        claimedOrgName: undefined,
        testAudioUrl: audioSourceType === 'file' ? activeAudioSample.sampleUrl : undefined,
        waitForAcceptance: true,
      });

      const assignedSession = stream.getSessionId();
      setActiveSessionId(assignedSession);
      console.info(`[AttackerPage] Call placed successfully. Session: ${assignedSession}`);
    } catch (err: any) {
      console.error('[AttackerPage] Call initialization failed:', err);
      setCallState('error');
      setStatusNote(`Call connection failed: ${err?.message || 'Server error'}`);
    }
  };

  const handleEndCall = () => {
    if (streamRef.current) {
      streamRef.current.terminate('NORMAL_HANGUP');
      streamRef.current = null;
    }
    setCallState('ended');
    setStatusNote('Call ended.');
  };

  const handleToggleMic = () => {
    const next = !micActive;
    setMicActive(next);
    if (streamRef.current) {
      streamRef.current.setMicEnabled(next);
    }
  };

  const selectedTarget = recipients.find((r) => r.id === selectedRecipientId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ── Top Bar ── */}
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <Radio size={18} className="text-blue-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100">VoiceShield Attacker & Inbound Caller Console</h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Laptop A (Caller Side)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live telephone call generator targeting independent recipient
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-200">{user?.name || 'Attacker / External Caller'}</div>
            <div className="text-[11px] text-slate-400">{user?.email || 'attacker@demo.com'}</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main Content Grid ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* 1. Target Recipient & Call Control */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Step 1</span>
              <h2 className="text-lg font-bold text-slate-100 mt-0.5">Target Recipient</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select the genuine citizen or user to place the incoming telephone call to.
              </p>
            </div>
            <button
              onClick={loadRecipients}
              disabled={loadingUsers || callState === 'active' || callState === 'ringing'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition disabled:opacity-40"
              title="Refresh recipients"
            >
              <RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recipients.map((recip) => {
              const isSelected = selectedRecipientId === recip.id;
              const isLocked = callState === 'active' || callState === 'ringing';
              return (
                <button
                  key={recip.id}
                  disabled={isLocked}
                  onClick={() => setSelectedRecipientId(recip.id)}
                  className={`p-4 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/50'
                      : 'border-slate-800 bg-slate-800/40 hover:bg-slate-800/80 hover:border-slate-700'
                  } ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-100">{recip.full_name}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{recip.email}</div>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        Target
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Role: <span className="text-slate-300 font-semibold">{recip.role}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Call Status & Action Banner */}
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 w-full sm:w-auto text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-xs text-slate-400 font-semibold uppercase">Call Status:</span>
                {callState === 'idle' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    READY TO CALL
                  </span>
                )}
                {callState === 'ringing' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    RINGING RECIPIENT
                  </span>
                )}
                {callState === 'active' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    CONNECTED (LIVE TRANSMISSION)
                  </span>
                )}
                {callState === 'ended' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    CALL ENDED
                  </span>
                )}
                {callState === 'error' && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                    CONNECTION ERROR
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">{statusNote}</p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
              {callState === 'idle' || callState === 'ended' || callState === 'error' ? (
                <button
                  onClick={handleStartCall}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition active:scale-95"
                >
                  <PhoneOutgoing size={17} />
                  Call {selectedTarget?.full_name?.split(' ')[0] || 'Recipient'}
                </button>
              ) : callState === 'ringing' ? (
                <button
                  onClick={handleEndCall}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-red-300 border border-red-500/40 font-semibold text-sm transition"
                >
                  <PhoneOff size={16} />
                  Cancel Call
                </button>
              ) : (
                <button
                  onClick={handleEndCall}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition active:scale-95"
                >
                  <PhoneOff size={17} />
                  End Live Call
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. Audio Transmission Source */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Step 2</span>
            <h2 className="text-lg font-bold text-slate-100 mt-0.5">Audio Transmission Source</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose the acoustic audio input source streamed to the recipient and analyzed live by VoiceShield.
            </p>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700 max-w-md">
            <button
              onClick={() => setAudioSourceType('mic')}
              disabled={callState === 'active' || callState === 'ringing'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition ${
                audioSourceType === 'mic'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              } ${callState === 'active' || callState === 'ringing' ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <Mic size={14} />
              Live Microphone
            </button>
            <button
              onClick={() => setAudioSourceType('file')}
              disabled={callState === 'active' || callState === 'ringing'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition ${
                audioSourceType === 'file'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              } ${callState === 'active' || callState === 'ringing' ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <FileAudio size={14} />
              Test Audio Sample
            </button>
          </div>

          {audioSourceType === 'mic' ? (
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <Mic size={18} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200">Laptop Microphone (16 kHz Mono PCM)</div>
                  <div className="text-xs text-slate-400">
                    Live speech is captured and streamed over WebSocket.
                  </div>
                </div>
              </div>

              {callState === 'active' && (
                <button
                  onClick={handleToggleMic}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    micActive
                      ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                      : 'bg-red-500/20 text-red-300 border-red-500/30'
                  }`}
                >
                  {micActive ? <MicOff size={13} /> : <Mic size={13} />}
                  {micActive ? 'Mute' : 'Unmute'}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TEST_AUDIO_SOURCES.map((sample) => {
                  const isSelected = selectedSampleId === sample.id;
                  const isLocked = callState === 'active' || callState === 'ringing';
                  return (
                    <button
                      key={sample.id}
                      disabled={isLocked}
                      onClick={() => setSelectedSampleId(sample.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/40'
                          : 'border-slate-800 bg-slate-800/30 hover:bg-slate-800/70 hover:border-slate-700'
                      } ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">{sample.name}</span>
                        <Volume2 size={13} className={isSelected ? 'text-blue-400' : 'text-slate-500'} />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">{sample.description}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 italic pt-1">
                Audio sample provides raw audio frames. The backend AI models determine voice authenticity and conversational intent solely from the acoustic stream and dialogue.
              </p>
            </div>
          )}
        </div>

        {/* 3. Live Transmission Telemetry Monitor */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-blue-400 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
                Live Transmission Telemetry
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {callState === 'active' ? 'STREAMING ACTIVE' : 'TRANSMISSION IDLE'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Audio Waveform */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center justify-between">
                <span>Audio Waveform Activity</span>
                <span className="text-blue-400 font-mono text-[11px]">
                  {callState === 'active' ? (micActive ? 'TRANSMITTING' : 'MUTED') : 'STANDBY'}
                </span>
              </div>
              <LiveVoiceWaveform
                activityLevel={waveformActivity}
                state={callState === 'active' && micActive ? 'speaking' : 'silence'}
                height={64}
                barCount={32}
              />
            </div>

            {/* Recognized Dialogue Preview */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  Recognized Speech Stream
                </div>
                <div className="text-xs text-slate-300 font-mono min-h-[48px] bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                  {lastTranscript || (
                    <span className="text-slate-400 italic">
                      {callState === 'active'
                        ? 'Listening for speech in audio transmission...'
                        : 'Audio dialogue will display here during active call.'}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-2 flex items-center justify-between">
                <span>Session ID:</span>
                <span className="font-mono text-slate-300">{activeSessionId || 'None'}</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
