import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PhoneOff,
  ShieldAlert,
  MessageSquare,
  User,
  Mic,
  MicOff,
  ShieldCheck,
  Radio,
  UserCheck,
  PhoneForwarded,
  Volume2,
} from 'lucide-react';
import { scoreToSecurityMessage, mapRiskLevel, mapVerdict, mapIdentityStatus } from '../utils/dataMapper';
import { getWarningText } from '../utils/translations';
import { useAppContext, useActiveCall, useCallHistory, useSettings } from '../context/AppContext';
import { liveCallStream } from '../services/calls/liveCallStream';
import { WebSocketLiveCallStreamImpl, type StreamDiagnostics } from '../services/calls/webSocketLiveCallStream';
import LiveVoiceWaveform from '../components/waveform/LiveVoiceWaveform';
import CallerCard from '../components/call/CallerCard';
import CallTimer from '../components/call/CallTimer';
import TranscriptDisplay from '../components/call/TranscriptDisplay';
import ConversationSignalTag from '../components/call/ConversationSignalTag';
import LiveRiskMonitor from '../components/call/LiveRiskMonitor';
import RealTimeWarningModal from '../components/call/RealTimeWarningModal';
import CriticalInterventionBanner from '../components/call/CriticalInterventionBanner';
import RiskTimeline, { type RiskTimelineEntry } from '../components/severity/RiskTimeline';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { config } from '../services/config';
import type { CallEvent, CallHistoryItem, CallSession, CallTimelineEvent, InterventionStage } from '../types';

export default function LiveCallPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const querySessionId = searchParams.get('session_id');
  const queryCallerName = searchParams.get('caller_name');
  const queryClaimedSpeaker = searchParams.get('claimed_speaker');
  const isRecipientMode = !!querySessionId;

  const { dispatch } = useAppContext();
  const { settings } = useSettings();
  const { activeCall, setActiveCall, updateActiveCall, endActiveCall } = useActiveCall();
  const { addCallHistory } = useCallHistory();

  const [startTime, setStartTime] = useState<Date | null>(null);
  const [callId] = useState(() => querySessionId || `call-${Date.now()}`);
  const [micActive, setMicActive] = useState(!isRecipientMode);
  const [diagnostics, setDiagnostics] = useState<StreamDiagnostics | null>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const warningDismissedRef = useRef(false);
  const [riskHistory, setRiskHistory] = useState<RiskTimelineEntry[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);

  // Critical Request Intervention State
  const [interventionStage, setInterventionStage] = useState<InterventionStage>('none');
  const interventionTriggeredRef = useRef(false);

  // Batch 2B — Verification state machine (policy layer only — no backend risk changes)
  // Possible values: 'idle' | 'required' | 'in_progress' | 'completed' | 'dismissed'
  const verificationStateRef = useRef<'idle' | 'required' | 'in_progress' | 'completed' | 'dismissed'>('idle');

  const [livenessRequired, setLivenessRequired] = useState(false);


  const handleStageChange = useCallback((nextStage: InterventionStage) => {
    setInterventionStage(nextStage);
    if (nextStage === 'terminated_simulation') {
      liveCallStream.terminate('CRITICAL_INTERVENTION_PROTECTIVE_TERMINATION');
    }
  }, []);

  // Intent + Context + Risk: Automated Protective Response
  useEffect(() => {
    if (!activeCall) return;
    const { security } = activeCall;
    const isCritical = security.severity === 'CRITICAL';
    const hasSensitiveSignal = security.signals.some(
      (s) =>
        s.type === 'otp_request' ||
        s.type === 'credential_request' ||
        s.type === 'payment_request' ||
        s.type === 'sensitive_info_request'
    );
    const isVeryHighRisk = (security.score ?? 0) >= 85;

    if (
      isCritical &&
      (hasSensitiveSignal || isVeryHighRisk) &&
      interventionStage === 'none' &&
      !interventionTriggeredRef.current
    ) {
      interventionTriggeredRef.current = true;
      setInterventionStage('critical_detected');
    }
  }, [activeCall, interventionStage]);

  // Batch 2B: HIGH Risk Auto-Verification Trigger
  useEffect(() => {
    if (!activeCall) return;
    const { security } = activeCall;
    
    // Check if verification is explicitly requested by backend or risk is HIGH
    const shouldVerify = security.severity === 'HIGH' || 
                         security.recommendedAction === 'VERIFY_SPEAKER';
                         
    if (shouldVerify && verificationStateRef.current === 'idle') {
      console.log('[Batch 2B] Auto-triggering verification due to HIGH risk policy');
      verificationStateRef.current = 'required';
      
      // Auto-navigate to verification page
      setTimeout(() => {
        navigate('/verification', { state: { autoTriggered: true } });
      }, 500);
    }
  }, [activeCall, navigate]);

  // 1. Maintain persistent live call event subscription throughout page lifecycle
  useEffect(() => {
    const unsubscribe = liveCallStream.subscribe((event: CallEvent) => {
      if (event.type === 'call_started') {
        const initialSession = event.payload as CallSession;
        setActiveCall(initialSession);
        setStartTime(new Date());
        setMicActive(!isRecipientMode);
        if (initialSession.security) {
          const initTs = new Date().toLocaleTimeString('en-GB', { hour12: false });
          setRiskHistory([
            {
              timestamp: initTs,
              score: initialSession.security.score,
              level: initialSession.security.severity,
              note: 'Call initiated',
            },
          ]);
        }
      } else if (event.type === 'security_update') {
        const partial = event.payload as Partial<CallSession>;
        updateActiveCall(partial);
        if (partial.security) {
          const s = partial.security;
          const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
          setRiskHistory((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.score !== s.score || last.level !== s.severity) {
              return [
                ...prev,
                {
                  timestamp: ts,
                  score: s.score ?? 0,
                  level: s.severity ?? 'SAFE',
                  note: s.signals?.[0]?.label,
                },
              ];
            }
            return prev;
          });

          // Trigger non-blocking heads-up warning alert when risk escalates
          if (s.severity === 'CRITICAL' || s.severity === 'HIGH' || (s.score ?? 0) >= 70) {
            if (!warningDismissedRef.current) {
              setWarningModalOpen(true);
            }
          }
        }
      } else if (event.type === 'waveform_update') {
        updateActiveCall({ waveformActivity: event.payload.waveformActivity });
      } else if (event.type === 'verification_requested') {
        // Update security context from backend VERIFICATION_EVENT
        if (event.payload.security) {
           const vPayload = event.payload.security as any;
           updateActiveCall({
              security: {
                ...(activeCall?.security || {}),
                verificationType: vPayload.verification_type,
                verificationOutcome: vPayload.outcome,
                verificationMethod: vPayload.method
              } as any
           });
        }
      } else if (event.type === 'call_ended') {
        // Backend notified call ended
        handleEndCall();
      }
    });

    // Periodic diagnostics poll for the Dev Diagnostics Panel
    const diagInterval = setInterval(() => {
      if (liveCallStream instanceof WebSocketLiveCallStreamImpl) {
        setDiagnostics(liveCallStream.getDiagnostics());
      }
    }, 400);

    return () => {
      clearInterval(diagInterval);
      unsubscribe();
    };
  }, [setActiveCall, updateActiveCall, isRecipientMode]);

  // 2. Global user interaction listener to unlock Web Audio playback
  useEffect(() => {
    const unlockAudio = () => {
      if (liveCallStream instanceof WebSocketLiveCallStreamImpl) {
        liveCallStream.resumePlaybackAudio();
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // 3. Connect to call session on mount or whenever querySessionId changes
  useEffect(() => {
    if (!querySessionId) return;
    if (activeSessionIdRef.current === querySessionId) return;

    activeSessionIdRef.current = querySessionId;
    setStartTime(new Date());
    setRiskHistory([]);

    if (liveCallStream instanceof WebSocketLiveCallStreamImpl) {
      liveCallStream.resumePlaybackAudio();
    }

    // Join backend session in receive-only mode
    liveCallStream.start({
      sessionId: querySessionId,
      callerName: queryCallerName || 'Inbound Call',
      claimedSpeakerId: queryClaimedSpeaker || undefined,
      receiveOnly: true,
    });

    // Prefetch existing call state (for late joiners / reloads)
    const token = localStorage.getItem('voiceshield_token');
    fetch(`${config.apiBaseUrl}/api/calls/${querySessionId}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.accumulated_transcript || data.current_risk_score > 0) {
          updateActiveCall({
            security: {
              score: data.current_risk_score,
              severity: mapRiskLevel(data.current_risk_level),
              message: data.alert_reason || scoreToSecurityMessage(data.current_risk_score),
              voiceAuthenticity: mapVerdict(data.final_verdict),
              callerIdentity: mapIdentityStatus(data.claimed_speaker_id ? 'INCONCLUSIVE' : 'UNENROLLED'),
              signals: [],
              securityTeamNotified: data.alert_triggered,
            },
            transcript: data.accumulated_transcript
              ? [
                  {
                    id: 'seg-init',
                    speaker: 'caller',
                    text: data.accumulated_transcript,
                    timestamp: 0,
                    isPartial: false,
                  },
                ]
              : [],
          });
        }
      })
      .catch((err) => console.warn('[LiveCallPage] Failed to prefetch call state:', err));

    return () => {
      liveCallStream.stop(false);
      activeSessionIdRef.current = null;
    };
  }, [querySessionId, queryCallerName, queryClaimedSpeaker, updateActiveCall]);

  const handleToggleMic = useCallback(() => {
    const nextState = !micActive;
    setMicActive(nextState);
    liveCallStream.setMicEnabled(nextState);
  }, [micActive]);

  const handleEndCall = useCallback(() => {
    liveCallStream.terminate('NORMAL_HANGUP');

    if (activeCall && startTime) {
      const now = new Date();
      const duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      const realSessionId = liveCallStream.getSessionId() || querySessionId || callId;
      const historyItem: CallHistoryItem = {
        id: realSessionId,
        caller: activeCall.caller,
        source: activeCall.source,
        startTime,
        endTime: now,
        duration,
        finalSeverity: activeCall.security.severity,
        finalScore: activeCall.security.score,
        finalAction:
          activeCall.security.severity === 'CRITICAL' || activeCall.security.severity === 'HIGH'
            ? 'Call ended — security alert triggered'
            : 'Call completed normally',
        transcript: activeCall.transcript,
        timeline: buildTimeline(activeCall),
        summary: buildSummary(activeCall),
        recommendation:
          activeCall.security.severity === 'CRITICAL' || activeCall.security.severity === 'HIGH'
            ? 'Do not share sensitive information or transfer funds. Verify caller independently.'
            : 'Call verified and safe.',
        signals: activeCall.security.signals,
        scenarioId: activeCall.scenarioId,
      };

      addCallHistory(historyItem);
    }

    endActiveCall();
    navigate('/history');
  }, [activeCall, startTime, callId, querySessionId, addCallHistory, endActiveCall, navigate, dispatch]);

  if (!querySessionId && !activeCall) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-200 shadow-xs">
          <Radio size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-800">No Active Call Session</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">
          There is currently no ongoing call session. To test real-time AI voice clone protection, launch an attack call from the Attacker Console or wait for an incoming call on this device.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button variant="primary" onClick={() => navigate('/attacker')}>
            Open Attacker Console
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!querySessionId && !activeCall) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-4 shadow-sm">
          <PhoneOff size={28} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">No Active Call Session</h2>
        <p className="text-slate-500 text-sm mt-1.5 max-w-md">
          There is no active incoming call to analyze. When an incoming call is placed to your account, VoiceShield will prompt you to accept and monitor live.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Button variant="primary" size="md" onClick={() => navigate('/')}>
            Return to Dashboard
          </Button>
          <Button variant="outline" size="md" onClick={() => navigate('/attacker')}>
            Open Attacker Console
          </Button>
        </div>
      </div>
    );
  }

  if (!activeCall) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
        <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-semibold text-slate-800">Connecting to VoiceShield Protection...</h2>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">
          Attaching to live backend session telemetry...
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const { security, caller, source, transcript, waveformActivity } = activeCall;
  const isCritical = security.severity === 'CRITICAL';
  const isHigh = security.severity === 'HIGH';
  const isSpeaking = (waveformActivity ?? 0) > 0.12;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Real-Time User Warning Modal */}
      <RealTimeWarningModal
        isOpen={warningModalOpen && (isCritical || isHigh)}
        severity={security.severity}
        score={security.score}
        message={security.message}
        onVerify={() => {
          setWarningModalOpen(false);
          navigate('/verification');
        }}
        onHangUp={handleEndCall}
        onDismiss={() => {
          warningDismissedRef.current = true;
          setWarningModalOpen(false);
        }}
      />

      {/* Liveness Verification Required Modal — Batch 2C */}
      {/* NOTE: Replay/PAD detection is NOT implemented server-side. This modal is triggered via
           Prototype Simulation only. The UI is designed to consume a future backend liveness event. */}
      {livenessRequired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="bg-amber-50 p-5 flex flex-col items-center border-b border-amber-200">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center mb-3">
                <ShieldAlert size={28} className="text-amber-700" />
              </div>
              <h3 className="text-lg font-bold text-amber-950 text-center">{getWarningText('liveness', settings.warningLanguage)}</h3>
              <p className="text-xs text-amber-700 mt-1 text-center font-medium uppercase tracking-wide">Prototype Simulation</p>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed text-center">
                This interaction requires an additional check before you continue.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                <strong>Note:</strong> Voice replay indicators detected. Verify the caller independently before continuing.
              </div>
              <div className="flex gap-3">
                <Button variant="outline" fullWidth onClick={() => setLivenessRequired(false)}>
                  Dismiss
                </Button>
                <Button variant="primary" fullWidth onClick={() => { setLivenessRequired(false); navigate('/verification'); }}>
                  Verify Caller
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Call Status Header */}
      <div
        className={`px-4 py-3 border-b flex items-center justify-between gap-3 transition-colors ${
          isCritical
            ? 'bg-red-50 border-red-200'
            : isHigh
            ? 'bg-orange-50 border-orange-200'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${isCritical ? 'bg-red-500' : 'bg-green-500'}`} />
            <span className="text-sm font-semibold text-slate-800 truncate">Real-Time Call Protection Active</span>
            {startTime && <CallTimer startTime={startTime} active />}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
            {isRecipientMode ? (
              <span className="flex items-center gap-1 text-blue-700 font-medium">
                <Radio size={12} className="text-blue-600 animate-pulse" />
                Live Monitoring (Receive-Only)
              </span>
            ) : micActive ? (
              <span className="flex items-center gap-1 text-green-700 font-medium">
                <Mic size={12} className="text-green-600 animate-pulse" />
                Mic Live (16kHz PCM)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 font-medium">
                <MicOff size={12} />
                Mic Muted
              </span>
            )}
            <span className="text-slate-300">•</span>
            <span className="text-slate-600 font-medium truncate">
              {isRecipientMode ? 'Mode: Recipient Live Monitoring' : 'Mode: Audio Transmission Stream'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isRecipientMode && (
            <Button
              variant={micActive ? 'outline' : 'secondary'}
              size="sm"
              icon={micActive ? <MicOff size={14} /> : <Mic size={14} />}
              onClick={handleToggleMic}
              title={micActive ? 'Mute microphone' : 'Unmute microphone'}
            >
              <span className="hidden sm:inline">{micActive ? 'Mute' : 'Unmute'}</span>
            </Button>
          )}

          {/* End Call Button */}
          <Button variant="danger" size="sm" icon={<PhoneOff size={14} />} onClick={handleEndCall}>
            End Call
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        {/* 2. System Status / Mode Banner */}
        {isRecipientMode ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="p-1 bg-blue-100 rounded text-blue-700 mt-0.5">
                <Radio size={16} className="animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                    Recipient Live Call Protection Active
                  </span>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded border border-blue-300 font-mono">
                    {querySessionId ? `${querySessionId.slice(0, 16)}...` : 'Active'}
                  </span>
                </div>
                <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                  Connected to active call session. Voice clone detection, biometric authenticity scores, and real-time Whisper transcription telemetry are being received directly from the AI detection pipeline.
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-blue-700 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-time audio relay and AI security analysis active. Audio chunks stream dynamically.</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Radio size={14} className="text-emerald-600" />
                Live Audio Capture Active
              </span>
              <p className="text-xs text-slate-600 mt-0.5">
                Microphone audio (16kHz mono PCM) is streaming live to the VoiceShield pipeline. Want to test cloned audio files or place an outgoing call to a specific user?
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/sender')} icon={<PhoneForwarded size={14} />}>
              Open Call Sender
            </Button>
          </div>
        )}

        {/* Protective Intervention Sequence (Critical Request Flow) */}
        {interventionStage !== 'none' && (
          <CriticalInterventionBanner
            stage={interventionStage}
            onStageChange={handleStageChange}
            onVerify={() => navigate('/verification')}
            onEndCall={handleEndCall}
            incidentId={`INC-${Date.now().toString().slice(-6)}`}
            announcementLanguage={
              settings.warningLanguage === 'ta' ? 'Tamil' :
              settings.warningLanguage === 'hi' ? 'Hindi' : 'English'
            }
            announcementRegion="Configured by User"
          />
        )}

        {/* Live Risk Monitor (Continuous Dynamic Display) */}
        <LiveRiskMonitor
          security={security}
          caller={caller}
          onVerify={() => navigate('/verification')}
          onEndCall={handleEndCall}
          interventionActive={interventionStage !== 'none'}
        />

        {/* 4. Prominent Two-Column Real-Time Hub: Live Transcript & Voice Waveform / Signals */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Main Column: Live Speech-To-Text Transcript (Whisper & Caller Dialogue) */}
          <div className="lg:col-span-7">
            <Card
              className="h-full flex flex-col"
              header={
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <MessageSquare size={16} className="text-blue-600" />
                    Live Conversation Transcript
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">REAL-TIME</span>
                  </span>
                  <button
                    onClick={() => navigate('/conversation')}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
                  >
                    Full View
                  </button>
                </div>
              }
            >
              <div className="flex-1 flex flex-col justify-between">
                {transcript.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm italic">
                    Listening for conversation... Speech will appear here as Whisper AI transcribes incoming voice chunks.
                  </div>
                ) : (
                  <TranscriptDisplay segments={transcript} maxHeight="220px" />
                )}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Whisper AI transcribing live voice
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">{transcript.length} dialogue segments</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Side Column: Real Voice Waveform & Detected Conversational Signals */}
          <div className="lg:col-span-5 space-y-4">
            {/* Real-time Voice Waveform */}
            <Card padding="md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Radio size={13} className={isSpeaking ? 'text-green-500 animate-pulse' : 'text-slate-400'} />
                  Audio Stream & Energy Level
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {diagnostics ? `RMS: ${diagnostics.rms.toFixed(3)}` : isSpeaking ? 'Speaking' : 'Listening...'}
                </span>
              </div>
              <div className="text-center my-2">
                <LiveVoiceWaveform
                  activityLevel={waveformActivity ?? 0.05}
                  state={isSpeaking ? 'speaking' : 'silence'}
                  severity={security.severity}
                  height={68}
                  barCount={36}
                  className="justify-center"
                />
              </div>
              <div className="text-[11px] text-slate-500 text-center flex flex-col items-center justify-center gap-1.5 pt-1">
                <div className="flex items-center justify-center gap-2">
                  <span className={micActive ? 'text-emerald-700 font-medium' : 'text-slate-600 font-medium'}>
                    {isRecipientMode ? '● Recipient Monitor' : micActive ? '● Mic active (16kHz PCM)' : '○ Mic muted'}
                  </span>
                  <span>•</span>
                  <span className="text-slate-500">FastAPI ML Pipeline</span>
                </div>
                {isRecipientMode && (
                  <button
                    onClick={() => {
                      if (liveCallStream instanceof WebSocketLiveCallStreamImpl) {
                        liveCallStream.resumePlaybackAudio();
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 cursor-pointer"
                  >
                    <Volume2 size={12} />
                    Speaker Output (Click to Unmute / Test Sound)
                  </button>
                )}
              </div>
            </Card>

            {/* Detected Conversational Signals */}
            <Card
              padding="sm"
              header={<span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Detected Signals</span>}
            >
              {security.signals.length === 0 ? (
                <div className="py-2 text-xs text-slate-400 italic">No suspicious intent signals detected yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {security.signals.map((sig) => (
                    <ConversationSignalTag key={sig.type} signal={sig} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Simulation Demo Trigger */}
        {interventionStage === 'none' && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Protective Interventions Armed (Automatic on Critical Sensitive Request)</span>
              <button type="button" onClick={() => { interventionTriggeredRef.current = true; setInterventionStage('critical_detected'); }} className="text-blue-800 hover:text-blue-950 font-semibold underline flex items-center gap-1 cursor-pointer">
                <ShieldAlert size={13} /> <span>Simulate Critical Request Protective Flow</span>
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-1">
              <span className="text-slate-600 font-medium">Replay/PAD Liveness (Prototype Simulation)</span>
              <button type="button" onClick={() => setLivenessRequired(true)} className="text-blue-800 hover:text-blue-950 font-semibold underline flex items-center gap-1 cursor-pointer">
                <Radio size={13} /> <span>Trigger Liveness Event</span>
              </button>
            </div>
          </div>
        )}

        {/* Caller Identity Card */}
        <Card>
          <CallerCard caller={caller} source={source} />
        </Card>

        {/* Navigation Actions */}
        <div className="flex gap-2 flex-wrap pt-1">
          <Button variant="outline" size="sm" onClick={() => navigate('/verification')} icon={<UserCheck size={14} />}>
            Step-Up Verification
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/identity')} icon={<User size={14} />}>
            Identity Details
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/conversation')} icon={<MessageSquare size={14} />}>
            Transcript & Signals
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/history')} icon={<ShieldCheck size={14} />}>
            Call History
          </Button>
        </div>

        {/* 7. Risk Timeline */}
        <Card header={<span className="text-sm font-semibold text-slate-700">Risk Timeline Progression</span>}>
          <RiskTimeline
            currentSeverity={security.severity}
            currentScore={security.score}
            history={riskHistory}
          />
        </Card>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildTimeline(call: CallSession): CallTimelineEvent[] {
  const start = call.startTime;
  const fmt = (ms: number) => {
    const d = new Date(start.getTime() + ms);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };
  const items: CallTimelineEvent[] = [{ time: fmt(0), description: 'Live audio stream initialized', type: 'info' }];
  call.security.signals.forEach((sig, i) => {
    items.push({
      time: fmt(5000 + i * 8000),
      description: `${sig.label} detected by NLP engine`,
      type: sig.severity === 'CRITICAL' || sig.severity === 'HIGH' ? 'critical' : 'warning',
    });
  });
  if (call.security.severity === 'CRITICAL' || call.security.severity === 'HIGH') {
    items.push({ time: fmt(12000), description: 'High risk alert dispatched to user & SOC', type: 'critical' });
  }
  items.push({ time: fmt(Math.max(1000, Date.now() - start.getTime())), description: 'Call ended', type: 'info' });
  return items;
}

function buildSummary(call: CallSession): string {
  if (call.security.severity === 'CRITICAL') {
    return `Live call flagged for elevated communication risk based on voice and conversation signals: ${
      call.security.signals.map((s) => s.label).join(', ') || 'High risk indicators detected'
    }.`;
  }
  if (call.security.severity === 'HIGH') {
    return `Live call analyzed with elevated risk. Independent verification is recommended before proceeding.`;
  }
  return `Live voice communication was analyzed. The voice and conversation patterns were determined to be normal.`;
}