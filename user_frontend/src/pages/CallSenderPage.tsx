import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PhoneOutgoing,
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  FileAudio,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { config } from '../services/config';
import { WebSocketLiveCallStreamImpl } from '../services/calls/webSocketLiveCallStream';
import type { CallEvent } from '../types';
import Card from '../components/ui/Card';
import SeverityBadge from '../components/severity/SeverityBadge';
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
    full_name: 'Aarav Sharma (External Caller)',
    email: 'aarav@external.net',
    role: 'USER',
  },
  {
    id: 'user_operator_001',
    username: 'operator',
    full_name: 'Priya Nair (SOC Operator)',
    email: 'priya.nair@apexfin.com',
    role: 'SECURITY_OPERATOR',
  },
  {
    id: 'user_operator_b',
    username: 'operator_b',
    full_name: 'Arjun Verma (Kavach SOC)',
    email: 'arjun.verma@kavach.in',
    role: 'SECURITY_OPERATOR',
  },
  {
    id: 'user_admin_001',
    username: 'admin',
    full_name: 'Apex System Admin',
    email: 'admin@apexfin.com',
    role: 'ADMIN',
  },
];

export default function CallSenderPage() {
  // Configuration - preloaded with seeded recipients so it is never empty
  const [recipients, setRecipients] = useState<BackendUserSummary[]>(SEEDED_FALLBACK_RECIPIENTS);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('user_sreya_001');
  const [callMode, setCallMode] = useState<'mic' | 'test_audio'>('mic');
  const [callerName, setCallerName] = useState('Rajesh Malhotra (CFO, Apex Financial Corp)');
  const [claimedSpeakerId, setClaimedSpeakerId] = useState('LA_0069'); // VIP CFO biometric enrolled profile
  const [testAudioUrl, setTestAudioUrl] = useState('/samples/tts_cloned_ava.wav');

  // Active call state
  const [callState, setCallState] = useState<'idle' | 'calling' | 'active' | 'ended' | 'error'>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(true);
  const [waveformActivity, setWaveformActivity] = useState(0.05);

  // Backend real-time telemetry (pure authoritative backend feedback)
  const [lastRiskScore, setLastRiskScore] = useState<number | null>(null);
  const [lastRiskLevel, setLastRiskLevel] = useState<string>('SAFE');
  const [lastVerdict, setLastVerdict] = useState<string>('inconclusive');
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [statusNote, setStatusNote] = useState('Ready to initiate secure communication');

  const streamRef = useRef<WebSocketLiveCallStreamImpl | null>(null);

  // 1. Fetch real potential recipients
  const loadRecipients = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('voiceshield_token');
      const res = await fetch(`${config.apiBaseUrl}/api/auth/users`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const users: BackendUserSummary[] = await res.json();
        if (users && users.length > 0) {
          setRecipients(users);
          // Preserve current selection if valid, or default to Sreya
          setSelectedRecipientId((current) => {
            if (current && users.some((u) => u.id === current)) return current;
            const sreya = users.find((u) => u.username.toLowerCase() === 'sreya');
            return sreya ? sreya.id : users[0].id;
          });
        }
      } else {
        // Fallback to /api/organizations/users if available
        const orgRes = await fetch(`${config.apiBaseUrl}/api/organizations/users`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (orgRes.ok) {
          const users: BackendUserSummary[] = await orgRes.json();
          if (users && users.length > 0) {
            setRecipients(users);
          }
        }
      }
    } catch (err) {
      console.warn('[CallSender] Failed to fetch live users, using seeded fallbacks:', err);
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
        streamRef.current.stop();
        streamRef.current = null;
      }
    };
  }, []);

  // Handle call initiation
  const handleStartCall = async () => {
    if (callState === 'active' || callState === 'calling') return;

    setCallState('calling');
    setStatusNote('Creating call session and routing to recipient…');
    setLastRiskScore(null);
    setLastRiskLevel('SAFE');
    setLastVerdict('inconclusive');
    setLastTranscript('');

    const stream = new WebSocketLiveCallStreamImpl();
    streamRef.current = stream;

    // Subscribe to authoritative backend events
    stream.subscribe((evt: CallEvent) => {
      if (evt.type === 'call_started') {
        setCallState('active');
        setStatusNote('Connected. Audio stream active to backend ML pipeline.');
      } else if (evt.type === 'security_update') {
        const payload = evt.payload;
        if (payload.security) {
          setLastRiskScore(payload.security.score);
          setLastRiskLevel(payload.security.severity);
          if (payload.security.action) {
            setStatusNote(`Policy action: ${payload.security.action}`);
          }
        }
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
        setStatusNote('Call session terminated.');
      }
    });

    // Start streaming real audio
    try {
      await stream.start({
        callId: `call-${Date.now()}`,
        recipientUserId: selectedRecipientId,
        callerName: callerName.trim() || 'Rajesh Malhotra (CFO, Apex Financial Corp)',
        claimedSpeakerId: claimedSpeakerId.trim() || undefined,
        claimedOrgId: 'org_demo_001',
        claimedOrgName: 'Apex Financial Corp',
        testAudioUrl: callMode === 'test_audio' ? testAudioUrl : undefined,
      });

      setActiveSessionId(stream.getSessionId());
      setCallState('active');
    } catch (err: any) {
      console.error('[CallSender] Failed to start call:', err);
      setCallState('error');
      setStatusNote(`Error starting call: ${err.message || err}`);
    }
  };

  const handleEndCall = () => {
    if (streamRef.current) {
      streamRef.current.stop();
      streamRef.current = null;
    }
    setCallState('ended');
    setWaveformActivity(0.05);
    setStatusNote('Call ended.');
  };

  const handleToggleMic = () => {
    const next = !micActive;
    setMicActive(next);
    if (streamRef.current) {
      streamRef.current.setMicEnabled(next);
    }
  };

  const selectedRecipient = recipients.find((r) => r.id === selectedRecipientId);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <PhoneOutgoing className="text-blue-600" />
              Call Sender & Audio Injection Terminal
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Interface A: Initiate real outgoing calls to organization members with live microphone or authentic cloned audio samples.
            </p>
          </div>
          <button
            onClick={loadRecipients}
            disabled={loadingUsers}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
            title="Refresh Users"
          >
            <RefreshCw size={16} className={loadingUsers ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Call Configuration */}
        <div className="lg:col-span-6 space-y-4">
          <Card header={<span className="text-sm font-semibold text-slate-800">1. Target Recipient (Citizen Under Protection)</span>}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Recipient User (Target Individual)
                </label>
                {loadingUsers ? (
                  <div className="text-xs text-slate-400 py-2">Loading available users…</div>
                ) : recipients.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    No active recipients found. Make sure Sreya Sengupta or other users are seeded.
                  </div>
                ) : (
                  <select
                    value={selectedRecipientId}
                    onChange={(e) => setSelectedRecipientId(e.target.value)}
                    disabled={callState === 'active' || callState === 'calling'}
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {recipients.map((rec) => (
                      <option key={rec.id} value={rec.id}>
                        {rec.full_name} ({rec.username}) {rec.role === 'USER' ? '— Citizen User' : `— ${rec.role}`}
                      </option>
                    ))}
                  </select>
                )}
                {selectedRecipient && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Will ring <strong className="text-slate-700">{selectedRecipient.full_name}</strong>'s device and show an incoming call prompt.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card header={<span className="text-sm font-semibold text-slate-800">2. Caller Identity Claims (Impersonation Target)</span>}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Display Caller Name
                </label>
                <input
                  type="text"
                  value={callerName}
                  onChange={(e) => setCallerName(e.target.value)}
                  disabled={callState === 'active' || callState === 'calling'}
                  placeholder="e.g. Rajesh Malhotra (CFO, Apex Financial Corp)"
                  className="w-full text-sm border border-slate-300 rounded-lg p-2.5 font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Claimed Executive Speaker ID (Biometric Enrollment)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={claimedSpeakerId}
                    onChange={(e) => setClaimedSpeakerId(e.target.value)}
                    disabled={callState === 'active' || callState === 'calling'}
                    placeholder="e.g. LA_0069 (Enrolled CFO: Rajesh Malhotra) or empty for stranger"
                    className="flex-1 text-sm border border-slate-300 rounded-lg p-2.5 font-mono text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setClaimedSpeakerId(claimedSpeakerId ? '' : 'LA_0069')}
                    disabled={callState === 'active' || callState === 'calling'}
                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 font-medium whitespace-nowrap"
                  >
                    {claimedSpeakerId ? 'Clear' : 'Use LA_0069 (Rajesh Malhotra)'}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {claimedSpeakerId
                    ? 'Claims enrolled speaker profile LA_0069 (Rajesh Malhotra, CFO, Apex Financial Corp). Any detected spoofing will alert Apex Financial Corp SOC.'
                    : 'Unclaimed caller: Analyzed for general synthetic/deepfake anomalies.'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Audio Source & Mode */}
        <div className="lg:col-span-6 space-y-4">
          <Card header={<span className="text-sm font-semibold text-slate-800">3. Audio Source & Stream Type</span>}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCallMode('mic')}
                  disabled={callState === 'active' || callState === 'calling'}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    callMode === 'mic'
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-2 rounded-lg ${callMode === 'mic' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Mic size={18} />
                    </div>
                    <span className="font-semibold text-sm text-slate-800">Live Microphone</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Capture user's real browser mic, resample to 16kHz mono PCM, and stream chunks live.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCallMode('test_audio')}
                  disabled={callState === 'active' || callState === 'calling'}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    callMode === 'test_audio'
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-2 rounded-lg ${callMode === 'test_audio' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <FileAudio size={18} />
                    </div>
                    <span className="font-semibold text-sm text-slate-800">Cloned Audio Sample</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Stream authentic cloned TTS audio sample (<code className="font-mono">tts_cloned_ava.wav</code>) to backend at 1s intervals.
                  </p>
                </button>
              </div>

              {callMode === 'test_audio' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Audio Sample File
                  </label>
                  <select
                    value={testAudioUrl}
                    onChange={(e) => setTestAudioUrl(e.target.value)}
                    disabled={callState === 'active' || callState === 'calling'}
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg p-2 text-slate-700"
                  >
                    <option value="/samples/tts_cloned_ava.wav">
                      samples/cloned/tts_cloned_ava.wav (Synthetic Voice Attack)
                    </option>
                  </select>
                  <p className="text-[11px] text-slate-500">
                    High-veracity test file containing synthesized speech. Triggers Member 1 ML synthetic artifacts detection and Whisper ASR.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Main Call Transmission Console */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-900">Transmission Control</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    callState === 'active'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : callState === 'calling'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {callState.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Target: <span className="font-semibold text-slate-700">{selectedRecipient?.full_name || 'No recipient selected'}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {callState === 'active' && callMode === 'mic' && (
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition ${
                    micActive
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      : 'bg-amber-50 border-amber-300 text-amber-800'
                  }`}
                >
                  {micActive ? <MicOff size={14} /> : <Mic size={14} />}
                  <span>{micActive ? 'Mute Mic' : 'Unmute Mic'}</span>
                </button>
              )}

              {callState === 'active' || callState === 'calling' ? (
                <button
                  type="button"
                  onClick={handleEndCall}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <PhoneOff size={16} />
                  <span>End Outgoing Call</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCall}
                  disabled={!selectedRecipientId}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition"
                >
                  <PhoneOutgoing size={16} />
                  <span>Place Call & Transmit Audio</span>
                </button>
              )}
            </div>
          </div>

          {/* Status note */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-blue-500" />
              <span>{statusNote}</span>
            </div>
          </div>

          {/* Waveform Visualization */}
          <div className="bg-slate-900 rounded-xl p-4 text-white">
            <div className="flex justify-between items-center mb-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Radio size={14} className={callState === 'active' ? 'text-emerald-400 animate-pulse' : ''} />
                Live Audio Stream Channel (16 kHz Mono 16-bit PCM)
              </span>
              <span>{callMode === 'mic' ? 'Browser Microphone' : 'Sample Audio File'}</span>
            </div>
            <LiveVoiceWaveform
              activityLevel={waveformActivity}
              state={waveformActivity > 0.12 ? 'speaking' : 'silence'}
              severity={lastRiskLevel as any}
            />
          </div>

          {/* Real Backend ML Feedback */}
          {callState === 'active' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">Authoritative Risk</div>
                <div className="text-xl font-bold text-slate-800">
                  {lastRiskScore !== null ? `${Math.round(lastRiskScore)}/100` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">Threat Level</div>
                <div className="mt-1">
                  <SeverityBadge level={lastRiskLevel as any} size="sm" />
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">AI Verdict</div>
                <div className="text-sm font-semibold text-slate-700 capitalize">
                  {lastVerdict || 'Analyzing…'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">Session ID</div>
                <div className="text-xs font-mono text-slate-500 truncate" title={activeSessionId || ''}>
                  {activeSessionId ? activeSessionId.slice(0, 10) + '…' : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Live Transcript Snippet */}
          {lastTranscript && (
            <div className="p-3 bg-white border border-slate-200 rounded-xl">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Latest Speech Recognized:
              </span>
              <p className="text-sm text-slate-800 italic">&ldquo;{lastTranscript}&rdquo;</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
