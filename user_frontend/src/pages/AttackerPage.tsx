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
  AlertTriangle,
  UserCheck,
  Zap,
} from 'lucide-react';
import { config } from '../services/config';
import { authService } from '../services/auth/authService';
import { useAuth } from '../context/AppContext';
import { WebSocketLiveCallStreamImpl } from '../services/calls/webSocketLiveCallStream';
import type { CallEvent } from '../types';
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
    full_name: 'Aarav Sharma (External Citizen)',
    email: 'aarav@external.net',
    role: 'USER',
  },
];

interface AttackScenario {
  id: string;
  name: string;
  description: string;
  type: 'file' | 'mic';
  sampleUrl?: string;
  callerName: string;
  claimedSpeakerId: string;
  claimedOrgId: string;
  claimedOrgName: string;
  badge: string;
  badgeColor: string;
}

const ATTACK_SCENARIOS: AttackScenario[] = [
  {
    id: 'ai_clone_cfo',
    name: 'AI-Cloned Executive (High Risk)',
    description: 'Synthesized deepfake clone of CFO Rajesh Malhotra demanding urgent wire transfer.',
    type: 'file',
    sampleUrl: '/samples/tts_cloned_ava.wav',
    callerName: 'Rajesh Malhotra (CFO, Apex Financial Corp)',
    claimedSpeakerId: 'LA_0069',
    claimedOrgId: 'org_demo_001',
    claimedOrgName: 'Apex Financial Corp',
    badge: 'DEEPFAKE SPOOF',
    badgeColor: 'bg-red-500 text-white',
  },
  {
    id: 'genuine_cfo',
    name: 'Genuine Executive (Authorized Match)',
    description: 'Authentic enrolled voice of CFO Rajesh Malhotra with matched biometric embeddings.',
    type: 'file',
    sampleUrl: '/samples/real_speech_tts.wav',
    callerName: 'Rajesh Malhotra (CFO, Apex Financial Corp)',
    claimedSpeakerId: 'LA_0069',
    claimedOrgId: 'org_demo_001',
    claimedOrgName: 'Apex Financial Corp',
    badge: 'GENUINE MATCH',
    badgeColor: 'bg-emerald-600 text-white',
  },
  {
    id: 'human_imposter',
    name: 'Human Imposter (Voice Mismatch)',
    description: 'Human social engineering attacker pretending to be Rajesh Malhotra.',
    type: 'file',
    sampleUrl: '/samples/speaker_b_test.wav',
    callerName: 'Rajesh Malhotra (CFO, Apex Financial Corp)',
    claimedSpeakerId: 'LA_0069',
    claimedOrgId: 'org_demo_001',
    claimedOrgName: 'Apex Financial Corp',
    badge: 'SPEAKER MISMATCH',
    badgeColor: 'bg-amber-500 text-white',
  },
  {
    id: 'live_mic_attacker',
    name: 'Live Microphone (Attacker Mic)',
    description: 'Speak into laptop microphone in real time while claiming enrolled executive status.',
    type: 'mic',
    callerName: 'Rajesh Malhotra (CFO, Apex Financial Corp)',
    claimedSpeakerId: 'LA_0069',
    claimedOrgId: 'org_demo_001',
    claimedOrgName: 'Apex Financial Corp',
    badge: 'LIVE INJECTION',
    badgeColor: 'bg-indigo-600 text-white',
  },
];

export default function AttackerPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Target Recipient state
  const [recipients, setRecipients] = useState<BackendUserSummary[]>(SEEDED_FALLBACK_RECIPIENTS);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('user_sreya_001');

  // Scenario state
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('ai_clone_cfo');
  const [customCallerName, setCustomCallerName] = useState('Rajesh Malhotra (CFO, Apex Financial Corp)');
  const [customClaimedSpeakerId, setCustomClaimedSpeakerId] = useState('LA_0069');

  // Call lifecycle: 'idle' | 'ringing' | 'active' | 'ended' | 'error'
  const [callState, setCallState] = useState<'idle' | 'ringing' | 'active' | 'ended' | 'error'>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(true);
  const [waveformActivity, setWaveformActivity] = useState(0.05);

  // Authoritative Backend ML Telemetry
  const [lastRiskScore, setLastRiskScore] = useState<number | null>(null);
  const [lastRiskLevel, setLastRiskLevel] = useState<string>('SAFE');
  const [lastVerdict, setLastVerdict] = useState<string>('inconclusive');
  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [statusNote, setStatusNote] = useState('Ready to launch simulated attack call');

  const streamRef = useRef<WebSocketLiveCallStreamImpl | null>(null);

  // Fetch real users from backend
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
          // Filter out caller/attacker and prioritize citizen users
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

  // Clean up on unmount without terminating server session inadvertently
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.stop(false);
        streamRef.current = null;
      }
    };
  }, []);

  const activeScenario = ATTACK_SCENARIOS.find((s) => s.id === selectedScenarioId) || ATTACK_SCENARIOS[0];

  const handleStartCall = async () => {
    if (callState === 'active' || callState === 'ringing') return;

    setCallState('ringing');
    setStatusNote('Calling Sreya... Waiting for recipient to accept on Laptop B');
    setLastRiskScore(null);
    setLastRiskLevel('SAFE');
    setLastVerdict('inconclusive');
    setLastTranscript('');

    const stream = new WebSocketLiveCallStreamImpl();
    streamRef.current = stream;

    // Listen to real backend events
    stream.subscribe((evt: CallEvent) => {
      if (evt.type === 'call_accepted') {
        setCallState('active');
        setStatusNote('Call accepted by recipient! Audio streaming is now active.');
      } else if (evt.type === 'call_started') {
        // Connected to backend
      } else if (evt.type === 'security_update') {
        const payload = evt.payload;
        if (payload.security) {
          setLastRiskScore(payload.security.score);
          setLastRiskLevel(payload.security.severity);
          if (payload.security.action) {
            setStatusNote(`Backend Policy Action: ${payload.security.action}`);
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
        setStatusNote('Call ended.');
      }
    });

    try {
      await stream.start({
        callId: `call-${Date.now()}`,
        recipientUserId: selectedRecipientId,
        callerName: customCallerName.trim() || activeScenario.callerName,
        claimedSpeakerId: customClaimedSpeakerId.trim() || undefined,
        claimedOrgId: activeScenario.claimedOrgId,
        claimedOrgName: activeScenario.claimedOrgName,
        testAudioUrl: activeScenario.type === 'file' ? activeScenario.sampleUrl : undefined,
        waitForAcceptance: true, // Only stream audio once recipient clicks Accept
      });

      setActiveSessionId(stream.getSessionId());
    } catch (err: any) {
      console.error('[AttackerPage] Call failed:', err);
      setCallState('error');
      setStatusNote(`Error: ${err.message || err}`);
    }
  };

  const handleEndCall = () => {
    if (streamRef.current) {
      streamRef.current.terminate('CALLER_HANGUP');
      streamRef.current = null;
    }
    setCallState('ended');
    setWaveformActivity(0.05);
    setStatusNote('Call terminated by Caller.');
  };

  const handleToggleMic = () => {
    const next = !micActive;
    setMicActive(next);
    if (streamRef.current) {
      streamRef.current.setMicEnabled(next);
    }
  };

  const handleSignOut = async () => {
    if (callState === 'active' || callState === 'ringing') {
      handleEndCall();
    }
    await authService.logout();
    logout();
    navigate('/login');
  };

  const selectedRecipient = recipients.find((r) => r.id === selectedRecipientId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-600/90 rounded-lg flex items-center justify-center border border-red-400/30">
            <Zap className="text-white" size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base tracking-wide">VoiceShield Caller Console</span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-800/60 font-semibold">
                Attack Terminal
              </span>
            </div>
            <p className="text-xs text-slate-400">Caller Simulation & Voice Clone Injection Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-300">{user?.name || 'Attacker Simulator'}</div>
            <div className="text-[11px] font-mono text-red-400">role: CALLER (Laptop A)</div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-red-900/60 hover:text-red-200 border border-slate-700 transition"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Info Banner */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="font-medium text-slate-200">
                Two-Laptop Demonstration Mode: <strong>Laptop A (Caller / Attacker)</strong>
              </p>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Place an outbound call to Sreya on Laptop B. Sreya will receive an incoming call prompt. Once accepted, audio streams live to the Member 1 AI pipeline.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadRecipients}
              disabled={loadingUsers}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center gap-1 text-[11px]"
              title="Refresh Recipients"
            >
              <RefreshCw size={12} className={loadingUsers ? 'animate-spin' : ''} />
              <span>Refresh Users</span>
            </button>
          </div>
        </div>

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Target & Impersonation Claim */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  1. Target Recipient (Citizen Under Protection)
                </span>
                <span className="text-[11px] text-slate-500">Laptop B User</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Protected Recipient
                </label>
                <select
                  value={selectedRecipientId}
                  onChange={(e) => setSelectedRecipientId(e.target.value)}
                  disabled={callState === 'active' || callState === 'ringing'}
                  className="w-full text-sm bg-slate-950 border border-slate-700 rounded-lg p-2.5 font-medium text-slate-100 focus:ring-2 focus:ring-red-500 focus:outline-none"
                >
                  {recipients.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.full_name} ({rec.username}) {rec.id === 'user_sreya_001' ? '★ Target Citizen' : ''}
                    </option>
                  ))}
                </select>
                {selectedRecipient && (
                  <div className="mt-2 text-xs text-slate-400 flex items-center gap-1.5">
                    <UserCheck size={14} className="text-emerald-400" />
                    <span>
                      Ringing will target <strong>{selectedRecipient.full_name}</strong> ({selectedRecipient.email})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Impersonated Identity */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  2. Impersonated Identity Claim
                </span>
                <span className="text-[11px] font-mono text-red-400 font-semibold">TARGET CLAIM</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Caller Display Name
                  </label>
                  <input
                    type="text"
                    value={customCallerName}
                    onChange={(e) => setCustomCallerName(e.target.value)}
                    disabled={callState === 'active' || callState === 'ringing'}
                    className="w-full text-sm bg-slate-950 border border-slate-700 rounded-lg p-2.5 font-medium text-slate-100 focus:ring-2 focus:ring-red-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Claimed Enrolled Speaker ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customClaimedSpeakerId}
                      onChange={(e) => setCustomClaimedSpeakerId(e.target.value)}
                      disabled={callState === 'active' || callState === 'ringing'}
                      className="flex-1 text-sm bg-slate-950 border border-slate-700 rounded-lg p-2.5 font-mono text-slate-100 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomClaimedSpeakerId(customClaimedSpeakerId ? '' : 'LA_0069')}
                      disabled={callState === 'active' || callState === 'ringing'}
                      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 font-medium"
                    >
                      {customClaimedSpeakerId ? 'Clear' : 'LA_0069 (Rajesh)'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {customClaimedSpeakerId
                      ? 'Claims enrolled profile LA_0069 (Rajesh Malhotra, CFO, Apex Financial Corp). Any spoof triggers Apex SOC alert.'
                      : 'Unclaimed caller: Analyzed purely for general synthetic/deepfake artifacts.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Scenario Selection */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  3. Select Attack / Verification Scenario
                </span>
                <span className="text-[11px] text-slate-500">Audio Payload</span>
              </div>

              <div className="space-y-2.5">
                {ATTACK_SCENARIOS.map((scen) => {
                  const isSelected = scen.id === selectedScenarioId;
                  return (
                    <div
                      key={scen.id}
                      onClick={() => {
                        if (callState !== 'active' && callState !== 'ringing') {
                          setSelectedScenarioId(scen.id);
                          setCustomCallerName(scen.callerName);
                          setCustomClaimedSpeakerId(scen.claimedSpeakerId);
                        }
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-850 border-red-500/80 shadow-md ring-1 ring-red-500/40'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      } ${callState === 'active' || callState === 'ringing' ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {scen.type === 'file' ? (
                            <FileAudio size={15} className={isSelected ? 'text-red-400' : 'text-slate-400'} />
                          ) : (
                            <Mic size={15} className={isSelected ? 'text-indigo-400' : 'text-slate-400'} />
                          )}
                          <span className="font-semibold text-sm text-slate-200">{scen.name}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${scen.badgeColor}`}>
                          {scen.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 pl-6">{scen.description}</p>
                      {scen.sampleUrl && (
                        <div className="mt-1.5 pl-6 text-[10px] font-mono text-slate-500 truncate">
                          Source: {scen.sampleUrl}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Transmission & Call Control Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-bold text-white">Call Dispatch & Transmission</span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                    callState === 'active'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : callState === 'ringing'
                      ? 'bg-amber-950 text-amber-300 border border-amber-700 animate-pulse'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {callState === 'ringing' ? 'RINGING (WAITING FOR SREYA)' : callState.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Target: <strong className="text-slate-200">{selectedRecipient?.full_name || 'None'}</strong> • Mode:{' '}
                <span className="text-slate-300">{activeScenario.name}</span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {callState === 'active' && activeScenario.type === 'mic' && (
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition ${
                    micActive
                      ? 'bg-slate-850 border-slate-700 text-slate-200 hover:bg-slate-800'
                      : 'bg-amber-900/60 border-amber-700 text-amber-200'
                  }`}
                >
                  {micActive ? <MicOff size={14} /> : <Mic size={14} />}
                  <span>{micActive ? 'Mute Mic' : 'Unmute Mic'}</span>
                </button>
              )}

              {callState === 'active' || callState === 'ringing' ? (
                <button
                  type="button"
                  onClick={handleEndCall}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-red-950/50 transition"
                >
                  <PhoneOff size={16} />
                  <span>END CALL</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCall}
                  disabled={!selectedRecipientId}
                  className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-red-950/40 transition"
                >
                  <PhoneOutgoing size={16} />
                  <span>START CALL (LAUNCH INJECTION)</span>
                </button>
              )}
            </div>
          </div>

          {/* Status Note Banner */}
          <div
            className={`p-3 rounded-lg border flex items-center gap-2.5 text-xs font-medium ${
              callState === 'ringing'
                ? 'bg-amber-950/50 border-amber-800/80 text-amber-200'
                : callState === 'active'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            <Activity size={15} className={callState === 'active' || callState === 'ringing' ? 'animate-spin' : ''} />
            <span>{statusNote}</span>
          </div>

          {/* Waveform Visualizer */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 text-white">
            <div className="flex justify-between items-center mb-2 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Radio size={14} className={callState === 'active' ? 'text-red-400 animate-pulse' : ''} />
                Stream Channel: 16 kHz Mono PCM
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {activeScenario.type === 'file' ? activeScenario.sampleUrl : 'Browser Microphone'}
              </span>
            </div>
            <LiveVoiceWaveform
              activityLevel={waveformActivity}
              state={waveformActivity > 0.1 ? 'speaking' : 'silence'}
              severity={lastRiskLevel as any}
            />
          </div>

          {/* Real Backend AI Telemetry Feedback */}
          {callState === 'active' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950 border border-slate-800 rounded-xl text-center">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Backend Risk Score</div>
                <div className="text-2xl font-bold text-white font-mono">
                  {lastRiskScore !== null ? `${Math.round(lastRiskScore)}/100` : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Threat Level</div>
                <div className="mt-1 flex justify-center">
                  <SeverityBadge level={lastRiskLevel as any} size="sm" />
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">AI Verdict</div>
                <div className="text-sm font-bold text-slate-200 capitalize">
                  {lastVerdict || 'Analyzing…'}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Active Session</div>
                <div className="text-xs font-mono text-slate-400 truncate" title={activeSessionId || ''}>
                  {activeSessionId ? activeSessionId.slice(0, 12) + '…' : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Real-time Whisper ASR Recognized Speech */}
          {lastTranscript && (
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Whisper ASR Speech Recognized:
              </span>
              <p className="text-sm text-slate-200 italic">&ldquo;{lastTranscript}&rdquo;</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
