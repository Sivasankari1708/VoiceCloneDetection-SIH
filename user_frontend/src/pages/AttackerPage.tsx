import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PhoneCall,
  PhoneOff,
  User,
  Radio,
  Send,
  Zap,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Mic,
  MicOff,
} from 'lucide-react';
import { useDemoScenario, type DemoTranscriptItem } from '../context/DemoScenarioContext';
import { callBridge } from '../services/calls/callBridge';
import { googleSpeechService } from '../services/calls/googleSpeechService';
import { analyzeSensitiveSolicitation } from '../utils/sensitiveDataDetector';
import TranscriptDisplay from '../components/call/TranscriptDisplay';

interface OrganizationOption {
  id: string;
  name: string;
  code: string;
  identities: Array<{
    id: string;
    name: string;
    title: string;
    speaker_id: string;
  }>;
}

const DEMO_ORGANIZATIONS: OrganizationOption[] = [
  {
    id: 'org_iob',
    name: 'Indian Overseas Bank',
    code: 'IOB',
    identities: [
      { id: 'vip_iob_001', name: 'Rajesh Kumar', title: 'Bank Manager', speaker_id: 'SPK_IOB_01' },
      { id: 'vip_iob_002', name: 'Priya Nair', title: 'Senior Officer', speaker_id: 'SPK_IOB_02' },
    ],
  },
  {
    id: 'org_sbi',
    name: 'State Bank of India',
    code: 'SBI',
    identities: [
      { id: 'vip_sbi_001', name: 'Vikram Singh', title: 'Senior Bank Officer', speaker_id: 'SPK_SBI_01' },
      { id: 'vip_sbi_002', name: 'Ananya Sharma', title: 'Branch Manager', speaker_id: 'SPK_SBI_02' },
    ],
  },
  {
    id: 'org_uidai',
    name: 'UIDAI',
    code: 'UIDAI',
    identities: [
      { id: 'vip_uidai_001', name: 'Arjun Mehta', title: 'Senior Administrative Officer', speaker_id: 'SPK_UIDAI_01' },
      { id: 'vip_uidai_002', name: 'Neha Rao', title: 'IT/Operations Officer', speaker_id: 'SPK_UIDAI_02' },
    ],
  },
  {
    id: 'org_police',
    name: 'Police Department',
    code: 'POLICE',
    identities: [
      { id: 'vip_pol_001', name: 'Vikram Reddy', title: 'Senior Police Officer', speaker_id: 'SPK_POL_01' },
      { id: 'vip_pol_002', name: 'Kavya Menon', title: 'Cyber Crime Officer', speaker_id: 'SPK_POL_02' },
    ],
  },
  {
    id: 'org_drdo',
    name: 'DRDO',
    code: 'DRDO',
    identities: [
      { id: 'vip_drdo_001', name: 'Rohan Verma', title: 'Research/IT Officer', speaker_id: 'SPK_DRDO_01' },
      { id: 'vip_drdo_002', name: 'Meera Iyer', title: 'Senior Research Officer', speaker_id: 'SPK_DRDO_02' },
    ],
  },
];

const ATTACK_TYPES = [
  'AI Voice Clone / Impersonation',
  'Replay Attack',
  'Human Impersonation',
  'Voice Conversion',
  'Benign / Genuine Conversation',
  'Stress / Noisy Voice',
  'Sensitive-Intent Attack',
];

const AUDIO_SOURCES = [
  'AI Cloned Recording',
  'Replay Recording',
  'Real Human Recording',
  'Voice Conversion Recording',
  'Live Microphone',
];

export default function AttackerPage() {
  const navigate = useNavigate();
  const { resetCallToInitial } = useDemoScenario();

  // Mode segregation: Direct Live Call vs Simulation Attack
  const [consoleMode, setConsoleMode] = useState<'live_call' | 'simulation_attack'>('live_call');
  const [liveCallerName, setLiveCallerName] = useState('Aarav Sharma');
  const [liveCallerPhone, setLiveCallerPhone] = useState('+91 98201 44102');

  // Attacker selections (for simulation attacks)
  const [targetUser] = useState<{ id: string; name: string }>({ id: 'user_sreya_001', name: 'Sreya (Citizen / Employee)' });
  const [selectedOrgId, setSelectedOrgId] = useState<string>('org_iob');
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>('vip_iob_001');
  const [selectedAttackType, setSelectedAttackType] = useState<string>('AI Voice Clone / Impersonation');
  const [selectedAudioSource, setSelectedAudioSource] = useState<string>('Live Microphone');

  // Call state machine: IDLE -> CALLING -> CONNECTED -> LIVE_CALL (or DECLINED / ENDED)
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'declined' | 'ended'>('idle');
  const [activeDialogue, setActiveDialogue] = useState<DemoTranscriptItem[]>([]);
  const [interimSpeaking, setInterimSpeaking] = useState<{ speaker: 'caller' | 'employee'; text: string } | null>(null);
  const [micActive, setMicActive] = useState<boolean>(true);

  // Active organization & identity (for simulation attacks)
  const currentOrg = DEMO_ORGANIZATIONS.find((o) => o.id === selectedOrgId) || DEMO_ORGANIZATIONS[0];
  const currentIdentity = currentOrg.identities.find((i) => i.id === selectedIdentityId) || currentOrg.identities[0];

  // Update selected identity when organization changes
  useEffect(() => {
    if (currentOrg && !currentOrg.identities.some((i) => i.id === selectedIdentityId)) {
      setSelectedIdentityId(currentOrg.identities[0].id);
    }
  }, [selectedOrgId, currentOrg, selectedIdentityId]);

  // Pre-load active dialogues if call was already connected
  useEffect(() => {
    try {
      const activeSessionId = callBridge.getActiveSessionId();
      if (activeSessionId) {
        setCallStatus('connected');
        const existing = callBridge.getActiveDialogues();
        if (existing && existing.length > 0) {
          setActiveDialogue(
            existing.map((d) => ({
              id: d.id,
              speaker: d.speaker,
              text: d.text,
              time: d.time,
              hasSensitiveKeyword: /otp|kyc|payment|password|pin|credential|transfer/i.test(d.text),
              hasUrgentKeyword: /urgent|immediately|quick|now|hurry|asap/i.test(d.text),
            }))
          );
        }
      }
    } catch {}
  }, []);

  // Subscribe to authoritative callBridge events
  useEffect(() => {
    const unsub = callBridge.subscribe((evt) => {
      if (evt.type === 'CALL_ACCEPTED') {
        setCallStatus('connected');
        setActiveDialogue([]);
        setInterimSpeaking(null);
      } else if (evt.type === 'INTERIM_DIALOGUE') {
        if (evt.payload?.text) {
          setInterimSpeaking({
            speaker: evt.payload.speaker === 'employee' ? 'employee' : 'caller',
            text: evt.payload.text,
          });
        }
      } else if (evt.type === 'NEW_DIALOGUE') {
        setInterimSpeaking(null);
        const d = evt.payload?.dialogue;
        if (d && d.text) {
          setActiveDialogue((prev) => {
            if (d.id && prev.some((item) => item.id === d.id)) return prev;
            return [
              ...prev,
              {
                id: d.id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                speaker: (d.speaker === 'employee' ? 'employee' : 'caller') as 'caller' | 'employee',
                text: d.text,
                time: d.time || new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                hasSensitiveKeyword: /otp|kyc|payment|password|pin|credential|transfer/i.test(d.text),
                hasUrgentKeyword: /urgent|immediately|quick|now|hurry|asap/i.test(d.text),
              },
            ];
          });
        }
      } else if (evt.type === 'CALL_DECLINED') {
        googleSpeechService.stop();
        setCallStatus('declined');
        setInterimSpeaking(null);
        setTimeout(() => setCallStatus('idle'), 4000);
      } else if (evt.type === 'CALL_ENDED') {
        googleSpeechService.stop();
        setCallStatus('ended');
        setInterimSpeaking(null);
        callBridge.clearActiveDialogues();
        resetCallToInitial();
        setTimeout(() => setCallStatus('idle'), 3500);
      }
    });

    return () => unsub();
  }, [consoleMode, liveCallerName, currentIdentity, currentOrg]);

  // Continuous Google Cloud Speech Recognition when call is connected
  useEffect(() => {
    if (callStatus === 'connected') {
      const activeSessionId = callBridge.getActiveSessionId() || undefined;
      const isLive = consoleMode === 'live_call';
      const speakerName = isLive ? (liveCallerName || 'Aarav Sharma') : currentIdentity.name;
      googleSpeechService.start('caller', speakerName, activeSessionId);

      const unsubSpeech = googleSpeechService.subscribe({
        onInterim: (text) => {
          setInterimSpeaking({
            speaker: 'caller',
            text,
          });
        },
        onFinal: () => {
          setInterimSpeaking(null);
        },
      });

      return () => {
        unsubSpeech();
        googleSpeechService.stop();
      };
    } else {
      googleSpeechService.stop();
      setInterimSpeaking(null);
    }
  }, [callStatus, consoleMode, liveCallerName, currentIdentity.name]);

  // Sync mic mute
  useEffect(() => {
    googleSpeechService.setMuted(!micActive);
  }, [micActive]);

  // START CALL / ATTACK
  const handleStartCall = async () => {
    setCallStatus('calling');
    setActiveDialogue([]);
    resetCallToInitial();

    const isLive = consoleMode === 'live_call';
    const callerDisplayName = isLive ? (liveCallerName.trim() || 'Aarav Sharma') : currentIdentity.name;
    const orgName = isLive ? 'Direct Inbound Call' : currentOrg.name;
    const orgId = isLive ? 'org_direct' : currentOrg.id;
    const speakerId = isLive ? undefined : currentIdentity.speaker_id;
    const designation = isLive ? 'External Caller' : currentIdentity.title;
    const attackType = isLive ? 'Live Voice Call' : selectedAttackType;
    const audioSource = isLive ? 'Live Microphone' : selectedAudioSource;

    const openingLine = isLive
      ? `Hi Sreya, this is ${callerDisplayName}. Can you hear me clearly?`
      : `Hi, this is ${currentIdentity.name} calling from ${currentOrg.name}. I need to verify your account.`;
    const escalationLine = isLive
      ? `Can you confirm your current project file status?`
      : `Please provide the OTP you just received.`;

    await callBridge.startCall(
      {
        id: isLive ? `live_${Date.now()}` : `attack_${selectedOrgId}_${Date.now()}`,
        title: isLive ? `Live Call — ${callerDisplayName}` : `${selectedAttackType} — ${currentOrg.name}`,
        claimedCaller: callerDisplayName,
        claimedOrgName: orgName,
        claimedOrgId: orgId,
        claimedSpeakerId: speakerId,
        callerDesignation: designation,
        attackType: attackType,
        audioSource: audioSource,
        openingLine,
        escalationLine,
      },
      targetUser.id
    );
  };

  // Caller sends message (typed or quick phrase)
  const handleCallerSendMessage = (text: string) => {
    if (callStatus !== 'connected') return;
    const isLive = consoleMode === 'live_call';
    const callerName = isLive ? (liveCallerName || 'Aarav Sharma') : currentIdentity.name;
    const analysis = analyzeSensitiveSolicitation(text, 'caller');
    const isAttack = analysis.isSensitive || (!isLive && /otp|transfer|password|pin|urgent|immediately/i.test(text));
    const riskLevel = analysis.isSensitive ? analysis.severity : (isAttack ? 'Critical' : 'Safe');
    callBridge.sendDialogue('caller', callerName, text, riskLevel, isAttack);
  };

  // Quick conversation tester for Live Call Mode
  const handleSendLivePhrase = (phrase: string) => {
    handleCallerSendMessage(phrase);
  };

  // Caller asks for OTP (for simulation attack)
  const handleAskForOtp = () => {
    handleCallerSendMessage('Please provide the OTP you just received on your phone immediately.');
  };

  // Target User reveals OTP ("482913") -> Triggers Possible Credential Exposure!
  const handleSimulateUserRevealOtp = () => {
    if (callStatus !== 'connected') return;
    const userLine = 'Okay, the OTP is 482913.';
    callBridge.sendDialogue('employee', 'Sreya Sengupta', userLine, 'Critical', true);
  };

  // Clean Termination
  const handleEndCall = () => {
    googleSpeechService.stop();
    callBridge.endCall();
    setCallStatus('idle');
    setActiveDialogue([]);
    setInterimSpeaking(null);
    resetCallToInitial();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg text-white flex items-center justify-center font-bold text-sm shadow-xs ${
                consoleMode === 'live_call' ? 'bg-blue-600' : 'bg-red-600'
              }`}
            >
              {consoleMode === 'live_call' ? <PhoneCall size={17} /> : <Zap size={17} />}
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                {consoleMode === 'live_call'
                  ? 'VOICE SHIELD — CALLER CONSOLE'
                  : 'VOICE SHIELD — ATTACK SIMULATOR'}
              </h1>
              <p className="text-[11px] text-slate-500">
                {consoleMode === 'live_call'
                  ? 'Direct Inbound Voice Calling & Real-Time Speech Verification'
                  : 'Authorized Multi-Organization Voice-Impersonation Attack Testing Environment'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                consoleMode === 'live_call'
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {consoleMode === 'live_call' ? 'DIRECT CALLER (LIVE)' : 'SIMULATED CALLER ONLY'}
            </span>
            <button
              onClick={() => navigate('/live')}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Target Screen</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Simulator Body */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-6">
        {/* Mode Segregation Switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-2 hidden sm:inline">
              Mode:
            </span>
            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 shadow-2xs w-full sm:w-auto">
              <button
                onClick={() => {
                  if (callStatus === 'idle') setConsoleMode('live_call');
                }}
                disabled={callStatus !== 'idle'}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  consoleMode === 'live_call'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-50'
                }`}
              >
                <PhoneCall size={14} />
                <span>Direct Live Call</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500 text-white font-bold">
                  REAL SPEECH
                </span>
              </button>

              <button
                onClick={() => {
                  if (callStatus === 'idle') setConsoleMode('simulation_attack');
                }}
                disabled={callStatus !== 'idle'}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  consoleMode === 'simulation_attack'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-50'
                }`}
              >
                <Zap size={14} />
                <span>Simulation Attacks</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-400 text-slate-950 font-black">
                  IMPERSONATION
                </span>
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 pr-2 font-medium hidden md:block">
            {consoleMode === 'live_call'
              ? 'Initiate a genuine direct inbound call to test real two-way microphone speech'
              : 'Simulate synthetic voice clones, replay attacks & credential harvesting'}
          </div>
        </div>

        {/* Status Alert Banner */}
        {callStatus === 'calling' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between text-amber-900 text-xs font-semibold animate-pulse">
            <div className="flex items-center gap-2.5">
              <PhoneCall size={16} className="animate-bounce" />
              <span>
                {consoleMode === 'live_call'
                  ? 'CALLING TARGET (Sreya)... Waiting for target to Answer or Decline.'
                  : 'LAUNCHING ATTACK AGAINST Sreya... Waiting for target user to Accept or Decline.'}
              </span>
            </div>
            <button
              onClick={handleEndCall}
              className="px-3 py-1 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-bold transition cursor-pointer"
            >
              Cancel Call
            </button>
          </div>
        )}

        {callStatus === 'declined' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2.5 text-red-800 text-xs font-semibold">
            <PhoneOff size={16} />
            <span>CALL DECLINED: Target user rejected the incoming call. Line disconnected.</span>
          </div>
        )}

        {callStatus === 'ended' && (
          <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 flex items-center justify-between text-slate-800 text-xs font-semibold">
            <div className="flex items-center gap-2.5">
              <PhoneOff size={16} className="text-red-500" />
              <span>CALL DISCONNECTED: The call was terminated by the other party. Session closed.</span>
            </div>
            <button
              onClick={() => setCallStatus('idle')}
              className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {callStatus === 'connected' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between text-emerald-900 text-xs font-semibold">
            <div className="flex items-center gap-2.5">
              <Radio size={16} className="text-emerald-600 animate-pulse" />
              <span>
                {consoleMode === 'live_call'
                  ? 'LIVE CALL ACTIVE with Sreya. Speak into your microphone; audio is verified in real time.'
                  : `ATTACK SESSION ACTIVE: Impersonating ${currentIdentity.name} (${currentOrg.name}).`}
              </span>
            </div>
            <button
              onClick={handleEndCall}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <PhoneOff size={13} />
              <span>{consoleMode === 'live_call' ? 'End Call' : 'End Attack'}</span>
            </button>
          </div>
        )}

        {/* Main 2-Column Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: When connected -> Full Live Transcript; When idle -> Parameter Form */}
          {callStatus === 'connected' ? (
            <div className="lg:col-span-7 space-y-4">
              <TranscriptDisplay
                items={activeDialogue}
                interimTranscript={interimSpeaking}
                maxHeight="460px"
                isListening={micActive}
                perspective="caller"
                title={
                  consoleMode === 'live_call'
                    ? 'Live Conversation Transcript (Caller Console)'
                    : 'Attack Conversation Transcript (Caller Console)'
                }
                onSendMessage={handleCallerSendMessage}
                inputPlaceholder={
                  consoleMode === 'live_call'
                    ? 'Speak into mic or type response as Caller...'
                    : 'Speak into mic or type attack prompt...'
                }
              />
            </div>
          ) : (
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {consoleMode === 'live_call' ? 'Direct Live Call Parameters' : 'Attack Parameters'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {consoleMode === 'live_call'
                      ? 'Configure your live caller profile and live microphone stream.'
                      : 'Configure target, claimed persona, and audio attack profile.'}
                  </p>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">
                  {consoleMode === 'live_call' ? 'Live Telephony' : 'Step 1 of 2'}
                </span>
              </div>

              {/* Target User */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  TARGET USER
                </label>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 font-semibold">
                  <User size={15} className="text-blue-600" />
                  <span>{targetUser.name}</span>
                  <span className="ml-auto text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                    Target Individual
                  </span>
                </div>
              </div>

              {consoleMode === 'live_call' ? (
                /* ─── LIVE CALL FORM ─── */
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        YOUR CALLER NAME
                      </label>
                      <input
                        type="text"
                        value={liveCallerName}
                        onChange={(e) => setLiveCallerName(e.target.value)}
                        disabled={callStatus === 'calling'}
                        placeholder="e.g. Aarav Sharma"
                        className="w-full text-xs font-semibold rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        CALLER NUMBER / LINE
                      </label>
                      <input
                        type="text"
                        value={liveCallerPhone}
                        onChange={(e) => setLiveCallerPhone(e.target.value)}
                        disabled={callStatus === 'calling'}
                        placeholder="e.g. +91 98201 44102"
                        className="w-full text-xs font-semibold rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      AUDIO TRANSMISSION
                    </label>
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <Mic size={14} className="text-emerald-600" />
                        <span>Live Microphone Armed (Web Speech API Recognition)</span>
                      </div>
                      <p className="text-emerald-800 text-[11px] leading-relaxed">
                        Continuous real-time speech-to-text will stream directly to Sreya when the call connects.
                      </p>
                    </div>
                  </div>

                  {/* Start Live Call Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleStartCall}
                      disabled={callStatus === 'calling'}
                      className={`w-full py-3.5 px-4 rounded-xl text-xs font-extrabold text-white transition flex items-center justify-center gap-2 shadow-sm ${
                        callStatus === 'calling'
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                      }`}
                    >
                      <PhoneCall size={16} />
                      <span>START DIRECT LIVE CALL TO SREYA</span>
                    </button>
                  </div>
                </>
              ) : (
                /* ─── SIMULATION ATTACKS FORM ─── */
                <>
                  {/* Claimed Organization */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      CLAIMED ORGANIZATION
                    </label>
                    <select
                      value={selectedOrgId}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      disabled={callStatus === 'calling'}
                      className="w-full text-xs font-semibold rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {DEMO_ORGANIZATIONS.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name} ({org.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Claimed Identity */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      CLAIMED IDENTITY
                    </label>
                    <select
                      value={selectedIdentityId}
                      onChange={(e) => setSelectedIdentityId(e.target.value)}
                      disabled={callStatus === 'calling'}
                      className="w-full text-xs font-semibold rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {currentOrg.identities.map((id) => (
                        <option key={id.id} value={id.id}>
                          {id.name} — {id.title}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1 italic">
                      Simulates caller verbally claiming: “I am {currentIdentity.name} from {currentOrg.name}.”
                    </p>
                  </div>

                  {/* Attack Type & Audio Source */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        ATTACK TYPE
                      </label>
                      <select
                        value={selectedAttackType}
                        onChange={(e) => setSelectedAttackType(e.target.value)}
                        disabled={callStatus === 'calling'}
                        className="w-full text-xs font-semibold rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ATTACK_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        AUDIO SOURCE
                      </label>
                      <select
                        value={selectedAudioSource}
                        onChange={(e) => setSelectedAudioSource(e.target.value)}
                        disabled={callStatus === 'calling'}
                        className="w-full text-xs font-semibold rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {AUDIO_SOURCES.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Launch Attack Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleStartCall}
                      disabled={callStatus === 'calling'}
                      className={`w-full py-3.5 px-4 rounded-xl text-xs font-extrabold text-white transition flex items-center justify-center gap-2 shadow-sm ${
                        callStatus === 'calling'
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 cursor-pointer'
                      }`}
                    >
                      <Zap size={16} />
                      <span>LAUNCH IMPERSONATION ATTACK</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Right Column: Pre-Flight Summary & In-Call Dialogue Controller */}
          <div className="lg:col-span-5 space-y-5">
            {/* Pre-Call Review Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {consoleMode === 'live_call' ? 'Live Call Summary' : 'Pre-Flight Attack Summary'}
              </h3>
              <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target:</span>
                  <span className="font-semibold text-slate-900">Sreya (Citizen)</span>
                </div>
                {consoleMode === 'live_call' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Caller Name:</span>
                      <span className="font-semibold text-slate-900">{liveCallerName || 'Aarav Sharma'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Caller Line:</span>
                      <span className="font-semibold text-slate-900">{liveCallerPhone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Call Type:</span>
                      <span className="font-semibold text-emerald-700">Genuine Live Call</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Audio Source:</span>
                      <span className="font-semibold text-slate-700">Live Microphone</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Claimed Organization:</span>
                      <span className="font-semibold text-slate-900">{currentOrg.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Claimed Identity:</span>
                      <span className="font-semibold text-slate-900">{currentIdentity.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Designation:</span>
                      <span className="font-semibold text-slate-700">{currentIdentity.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Attack Type:</span>
                      <span className="font-semibold text-red-700">{selectedAttackType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Audio Source:</span>
                      <span className="font-semibold text-slate-700">{selectedAudioSource}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 bg-blue-50/70 p-2.5 rounded-lg border border-blue-100">
                <CheckCircle2 size={14} className="text-blue-600 flex-shrink-0" />
                <span>One authoritative backend session ID created. User must manually accept.</span>
              </div>
            </div>

            {/* In-Call Microphone & Phrase Controls (when connected) */}
            {callStatus === 'connected' && (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-3.5 animate-fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Radio size={14} className="text-emerald-600 animate-pulse" />
                    <span>In-Call Audio Controls</span>
                  </h3>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    TWO-WAY ACTIVE
                  </span>
                </div>

                {/* Live Microphone Status & Two-Way Audio Indicator */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/80 border border-blue-200/80 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${micActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span className="font-semibold text-slate-800">
                      {micActive ? 'Microphone Active: Speak naturally' : 'Microphone Paused (Muted)'}
                    </span>
                  </div>
                  <button
                    onClick={() => setMicActive(!micActive)}
                    className="px-2.5 py-1 rounded-lg border bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    {micActive ? <Mic size={13} className="text-emerald-600" /> : <MicOff size={13} className="text-amber-600" />}
                    <span>{micActive ? 'Mute' : 'Unmute'}</span>
                  </button>
                </div>

                {/* Mode-Specific In-Call Action Triggers */}
                {consoleMode === 'live_call' ? (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Quick Test Phrases</div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => handleSendLivePhrase('Hello Sreya, can you hear me clearly?')}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-medium transition cursor-pointer"
                      >
                        "Can you hear me clearly?"
                      </button>
                      <button
                        onClick={() => handleSendLivePhrase('This is a live genuine voice call test.')}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-medium transition cursor-pointer"
                      >
                        "Live voice call test"
                      </button>
                      <button
                        onClick={() => handleSendLivePhrase('Everything sounds crisp and normal.')}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-medium transition cursor-pointer"
                      >
                        "Audio is clear"
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      onClick={handleAskForOtp}
                      className="w-full text-left p-3 rounded-xl border border-amber-200 bg-amber-50/80 hover:bg-amber-100/90 text-amber-900 text-xs font-semibold transition cursor-pointer flex items-center justify-between"
                    >
                      <span>1. Speak: "Please provide the OTP you received."</span>
                      <Send size={13} className="text-amber-700" />
                    </button>

                    <button
                      onClick={handleSimulateUserRevealOtp}
                      className="w-full text-left p-3 rounded-xl border border-red-200 bg-red-50/80 hover:bg-red-100/90 text-red-900 text-xs font-semibold transition cursor-pointer flex items-center justify-between"
                    >
                      <span>2. User speaks: "The OTP is 482913" (Disclose Credential)</span>
                      <ShieldAlert size={14} className="text-red-600" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
