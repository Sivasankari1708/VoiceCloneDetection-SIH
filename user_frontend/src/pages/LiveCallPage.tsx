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
  Terminal,
  ChevronDown,
  ChevronUp,
  Radio,
  UserCheck,
  PhoneForwarded,
} from 'lucide-react';
import { useAppContext, useActiveCall, useCallHistory } from '../context/AppContext';
import { liveCallStream } from '../services/calls/liveCallStream';
import { WebSocketLiveCallStreamImpl, type StreamDiagnostics } from '../services/calls/webSocketLiveCallStream';
import type { CallEvent, CallHistoryItem, CallSession, CallTimelineEvent } from '../types';
import LiveVoiceWaveform from '../components/waveform/LiveVoiceWaveform';
import CallerCard from '../components/call/CallerCard';
import CallTimer from '../components/call/CallTimer';
import TranscriptDisplay from '../components/call/TranscriptDisplay';
import ConversationSignalTag from '../components/call/ConversationSignalTag';
import LiveRiskMonitor from '../components/call/LiveRiskMonitor';
import RealTimeWarningModal from '../components/call/RealTimeWarningModal';
import RiskTimeline, { type RiskTimelineEntry } from '../components/severity/RiskTimeline';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function LiveCallPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const querySessionId = searchParams.get('session_id');
  const queryCallerName = searchParams.get('caller_name');
  const queryClaimedSpeaker = searchParams.get('claimed_speaker');
  const isRecipientMode = !!querySessionId;

  const { dispatch } = useAppContext();
  const { activeCall, setActiveCall, updateActiveCall, endActiveCall } = useActiveCall();
  const { addCallHistory } = useCallHistory();

  const [startTime, setStartTime] = useState<Date | null>(null);
  const [callId] = useState(() => querySessionId || `call-${Date.now()}`);
  const [micActive, setMicActive] = useState(!isRecipientMode);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<StreamDiagnostics | null>(null);
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const warningDismissedRef = useRef(false);
  const [riskHistory, setRiskHistory] = useState<RiskTimelineEntry[]>([]);
  const streamStarted = useRef(false);

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

  // 2. Start initial call session once on component mount
  useEffect(() => {
    if (streamStarted.current) return;
    streamStarted.current = true;

    if (querySessionId) {
      // Recipient Mode (Interface B): join backend session in receive-only mode
      liveCallStream.start({
        sessionId: querySessionId,
        callerName: queryCallerName || 'Inbound Call',
        claimedSpeakerId: queryClaimedSpeaker || undefined,
        receiveOnly: true,
      });
    } else {
      // Caller Live Mic Mode: start direct live session with microphone capture
      liveCallStream.start({
        callerName: 'Direct Call Stream',
        receiveOnly: false,
      });
    }
  }, [querySessionId, queryCallerName, queryClaimedSpeaker]);

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
      const historyItem: CallHistoryItem = {
        id: querySessionId || callId,
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

      if (activeCall.security.severity === 'CRITICAL' || activeCall.security.severity === 'HIGH') {
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            id: `notif-${Date.now()}`,
            type: 'security_alert',
            title: 'Suspicious call detected',
            message: `A ${activeCall.security.severity.toLowerCase()} risk call was analyzed and ended.`,
            read: false,
            createdAt: new Date(),
            callId: querySessionId || callId,
            actionLabel: 'View details',
            actionRoute: `/history/${querySessionId || callId}`,
          },
        });
      }
    }

    endActiveCall();
    navigate('/history');
  }, [activeCall, startTime, callId, querySessionId, addCallHistory, endActiveCall, navigate, dispatch]);

  if (!activeCall) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center">
        <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-semibold text-slate-800">Connecting to VoiceShield Protection...</h2>
        <p className="text-slate-500 text-sm mt-1 max-w-sm">
          {isRecipientMode ? 'Attaching to live backend session telemetry...' : 'Initializing microphone audio stream and AI detection engine.'}
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/home')}>
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
              {isRecipientMode ? 'Mode: Recipient Live Monitoring' : 'Mode: Direct Live Stream'}
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
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  <span>Direct analysis streaming is active. (Peer-to-peer audio relay is not enabled by backend; AI telemetry is mirrored live.)</span>
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

        {/* 3. Live Risk Monitor (Continuous Dynamic Display) */}
        <LiveRiskMonitor
          security={security}
          caller={caller}
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
              <div className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-2">
                <span className={micActive ? 'text-emerald-700 font-medium' : 'text-slate-600 font-medium'}>
                  {isRecipientMode ? '● Recipient Monitor' : micActive ? '● Mic active (16kHz PCM)' : '○ Mic muted'}
                </span>
                <span>•</span>
                <span className="text-slate-500">FastAPI ML Pipeline</span>
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

        {/* 5. Prominent In-Page Warning Banner if Critical or High */}
        {(isCritical || isHigh) && (
          <div className="bg-red-50 border-2 border-red-500 rounded-xl p-4 shadow-sm animate-fade-in-up">
            <div className="flex items-start gap-3 mb-3">
              <ShieldAlert size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-900 text-base">
                  ⚠ {isCritical ? 'CRITICAL RISK: Possible impersonation detected' : 'HIGH RISK: Suspicious call patterns'}
                </div>
                <div className="text-sm text-red-700 mt-1 font-medium">
                  Do not share OTP, passwords, or approve payments. Verification recommended.
                </div>
                {security.securityTeamNotified && (
                  <div className="text-xs text-red-600 mt-1.5 font-semibold flex items-center gap-1">
                    <ShieldCheck size={13} />
                    Security operations center (SOC) has been notified automatically.
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-1 flex-wrap">
              <Button variant="primary" onClick={() => navigate('/verification')} icon={<UserCheck size={14} />}>
                Verify Caller Independently
              </Button>
              <Button variant="danger" onClick={handleEndCall} icon={<PhoneOff size={14} />}>
                Hang Up Immediately
              </Button>
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

        {/* Development Diagnostics Panel */}
        {diagnostics && (
          <div className="bg-slate-900 text-slate-200 rounded-xl p-4 border border-slate-800 text-xs font-mono shadow-md">
            <div
              className="flex items-center justify-between cursor-pointer pb-1"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
            >
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Terminal size={14} />
                <span>VOICE SHIELD DIAGNOSTICS</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-amber-300">REAL-TIME PIPELINE</span>
                {showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </div>

            {showDiagnostics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
                <div>
                  <div className="text-slate-500">Mic Status</div>
                  <div className="mt-0.5 font-bold text-green-400">{diagnostics.micStatus}</div>
                </div>
                <div>
                  <div className="text-slate-500">WebSocket</div>
                  <div className="mt-0.5 font-bold text-cyan-400">{diagnostics.wsStatus}</div>
                </div>
                <div>
                  <div className="text-slate-500">Audio Rate</div>
                  <div className="mt-0.5 font-bold text-slate-300">{diagnostics.audioContextSampleRate} Hz</div>
                </div>
                <div>
                  <div className="text-slate-500">16kHz Frames Sent</div>
                  <div className="mt-0.5 font-bold text-amber-400">{diagnostics.pcmFramesSent}</div>
                </div>
                <div>
                  <div className="text-slate-500">ML Risk Score</div>
                  <div className="mt-0.5 font-bold text-green-400">
                    {diagnostics.lastRiskScore.toFixed(1)}{' '}
                    <span className="text-[10px] text-slate-400">({diagnostics.lastRiskLevel})</span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">ML Verdict</div>
                  <div className="mt-0.5 font-bold text-amber-300">{diagnostics.lastVerdict.toUpperCase()}</div>
                </div>
                {diagnostics.lastTranscript && (
                  <div className="col-span-2 md:col-span-4 mt-1 bg-slate-950 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-500 text-[10px]">Latest Whisper Transcript: </span>
                    <span className="text-slate-100 font-semibold">"{diagnostics.lastTranscript}"</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
    return `Live call analyzed with high risk score (${call.security.score}/100). The ML model identified synthetic voice anomalies and intent flags: ${
      call.security.signals.map((s) => s.label).join(', ') || 'AI voice clone detected'
    }.`;
  }
  if (call.security.severity === 'HIGH') {
    return `Live call analyzed with elevated risk. Biometric voice verification was inconclusive.`;
  }
  return `Live voice communication was analyzed by VoiceShield ML models. The voice patterns were determined to be authentic with normal conversation patterns.`;
}