import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PhoneOff,
  Mic,
  MicOff,
  Shield,
  Clock,
  AlertTriangle,
  Building2,
  Landmark,
  ShieldAlert,
  ExternalLink,
  Flame,
  CheckCircle2,
  PhoneCall,
  ShieldCheck,
  Lock,
  Sparkles,
  Bot,
  RotateCcw,
  Volume2,
} from 'lucide-react';
import { useDemoScenario } from '../context/DemoScenarioContext';
import { callBridge } from '../services/calls/callBridge';
import { googleSpeechService } from '../services/calls/googleSpeechService';
import { userSocketService } from '../services/calls/userSocketService';
import { warningAudioService } from '../services/warningAudioService';
import TranscriptDisplay from '../components/call/TranscriptDisplay';
import CriticalInterventionModal from '../components/protection/CriticalInterventionModal';
import DemoControlBar from '../components/protection/DemoControlBar';
import CallTimer from '../components/call/CallTimer';
import { stopIncomingCallChime } from '../components/call/IncomingCallModal';
import { ensureAttackerCredentials } from '../services/auth/authStorage';
import { useCallHistory } from '../context/AppContext';
import { saveLocalCallHistory } from '../services/calls/callHistoryService';
import { analyzeSensitiveSolicitation } from '../utils/sensitiveDataDetector';
import type { CallHistoryItem, SeverityLevel } from '../types';

export default function LiveCallPage() {
  const navigate = useNavigate();
  const { addCallHistory } = useCallHistory();
  const [searchParams] = useSearchParams();
  const queryCaller = searchParams.get('caller_name');

  const {
    claimedCaller,
    setClaimedCaller,
    currentRisk,
    intervention,
    startCriticalIntervention,
    cancelIntervention,
    resetCallToInitial,
    transcript,
    interimTranscript,
    hasActiveCall,
    setHasActiveCall,
    callMode,
    setCallMode,
    sihStep,
    resetSihScenario,
    selectedLanguage,
  } = useDemoScenario();

  // If URL has session_id, ensure correct call mode and active call state are set
  useEffect(() => {
    stopIncomingCallChime();
    const session = searchParams.get('session_id') || callBridge.getActiveSessionId();
    const modeParam = searchParams.get('call_mode');
    if (session) {
      if (modeParam === 'simulation') {
        setCallMode('simulation');
      } else if (modeParam === 'live') {
        setCallMode('live');
      }
      setHasActiveCall(true);
      warningAudioService.initAudioPlayback();
    }
  }, [searchParams, setCallMode, setHasActiveCall]);

  useEffect(() => {
    if (queryCaller && queryCaller !== claimedCaller.name) {
      setClaimedCaller({
        name: queryCaller,
        roleAndDept: queryCaller.includes('Manager') ? 'Bank Manager' : 'Senior Officer',
        organization: 'Indian Overseas Bank',
      });
    }
  }, [queryCaller, claimedCaller.name, setClaimedCaller]);

  const [startTime] = useState(() => new Date());
  const [micActive, setMicActive] = useState(true);
  const [showTrustedGuide, setShowTrustedGuide] = useState(false);

  // Check for caller soliciting OTP or sensitive data
  const callerSensitiveMatch = transcript
    .filter((t) => t.speaker === 'caller')
    .map((t) => analyzeSensitiveSolicitation(t.text, 'caller'))
    .find((r) => r.isSensitive) ||
    (interimTranscript?.speaker === 'caller' ? analyzeSensitiveSolicitation(interimTranscript.text, 'caller') : null);

  const hasCallerSensitiveRequest = Boolean(callerSensitiveMatch?.isSensitive);

  // Check for Credential Exposure in dialogue: employee spoke 4-8 digits after OTP request
  const hasCredentialExposure = transcript.some(
    (t) =>
      t.speaker === 'employee' &&
      (/\b\d{4,8}\b/.test(t.text) || /otp is|code is|pin is/i.test(t.text))
  );

  // Effective risk level: If caller asks for OTP or sensitive data, system ALWAYS treats call as CRITICAL RISK
  const rawLevel = (currentRisk?.level || 'Safe').toUpperCase();
  const effectiveLevel = (hasCredentialExposure || hasCallerSensitiveRequest) ? 'CRITICAL' : rawLevel;
  const isCritical = effectiveLevel === 'CRITICAL';
  const isHigh = effectiveLevel === 'HIGH';
  const isCaution = effectiveLevel === 'CAUTION' || effectiveLevel === 'MEDIUM';

  // Auto trigger critical intervention if risk reaches Critical, credential exposed, or caller asks for OTP/sensitive info
  useEffect(() => {
    if ((isCritical || hasCredentialExposure || hasCallerSensitiveRequest) && !intervention.active) {
      const timer = setTimeout(() => {
        startCriticalIntervention();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isCritical, hasCredentialExposure, hasCallerSensitiveRequest, intervention.active, startCriticalIntervention]);

  // Dynamically play spoken warning in user's selected language when threat occurs during active call
  useEffect(() => {
    if (!hasActiveCall) return;
    if (hasCredentialExposure || hasCallerSensitiveRequest) {
      warningAudioService.playSecurityWarning('CREDENTIAL_EXPOSURE', selectedLanguage.code || selectedLanguage.language);
    } else if (isCritical) {
      warningAudioService.playSecurityWarning('CRITICAL', selectedLanguage.code || selectedLanguage.language);
    } else if (isHigh) {
      warningAudioService.playSecurityWarning('HIGH', selectedLanguage.code || selectedLanguage.language);
    }
  }, [hasActiveCall, isCritical, isHigh, hasCredentialExposure, hasCallerSensitiveRequest, selectedLanguage]);

  // Live microphone capture & continuous Google Cloud STT recognition for Employee/User (Only when Live Call active)
  useEffect(() => {
    if (callMode === 'live' && hasActiveCall) {
      const activeSessionId = searchParams.get('session_id') || callBridge.getActiveSessionId() || undefined;
      googleSpeechService.start('employee', 'Sreya (Citizen / Employee)', activeSessionId);
    } else {
      googleSpeechService.stop();
    }

    return () => {
      googleSpeechService.stop();
    };
  }, [callMode, hasActiveCall, searchParams]);

  // Sync mic mute state
  useEffect(() => {
    googleSpeechService.setMuted(!micActive);
  }, [micActive]);

  const handleSendMessage = (text: string) => {
    callBridge.sendDialogue('employee', 'Sreya (Citizen / Employee)', text, 'Safe', false);
  };

  const hasEndedRef = useRef(false);

  const terminateCall = useCallback(
    (initiatedLocally = true) => {
      if (hasEndedRef.current) return;
      // If triggered remotely, only proceed if there is actually an active session or transcript on this page
      if (!initiatedLocally && !hasActiveCall && !searchParams.get('session_id') && transcript.length === 0) {
        return;
      }
      hasEndedRef.current = true;

      stopIncomingCallChime();
      googleSpeechService.stop();
      warningAudioService.stopWarning();

      const currentSessionId =
        searchParams.get('session_id') || callBridge.getActiveSessionId() || `call-${Date.now()}`;
      const riskLevel = (currentRisk?.level || 'Safe').toUpperCase();
      const riskScore = riskLevel === 'CRITICAL' ? 92 : riskLevel === 'HIGH' ? 78 : riskLevel === 'CAUTION' ? 45 : 12;
      const severity: SeverityLevel =
        riskLevel === 'CRITICAL' ? 'CRITICAL' : riskLevel === 'HIGH' ? 'HIGH' : riskLevel === 'CAUTION' ? 'MEDIUM' : 'SAFE';
      const isThreat = severity === 'CRITICAL' || severity === 'HIGH';

      const finishedCall: CallHistoryItem = {
        id: currentSessionId,
        caller: {
          name: claimedCaller.name || 'External Caller',
          claimedRole: claimedCaller.roleAndDept || 'Executive / Official',
          organization: claimedCaller.organization || 'Indian Overseas Bank',
          status: isThreat ? 'failed' : 'verified',
          statusMessage: isThreat
            ? 'Deepfake voice synthesis & unauthorized credential solicitation'
            : 'Identity verified through biometric baseline',
        },
        source: 'browser',
        startTime,
        endTime: new Date(),
        duration: Math.max(12, Math.floor((Date.now() - startTime.getTime()) / 1000)),
        finalSeverity: severity,
        finalScore: riskScore,
        finalAction: isThreat
          ? 'Autonomous Intervention — Call Terminated and Security Log Created'
          : 'Call completed normally',
        transcript: transcript.map((t, idx) => ({
          id: t.id,
          speaker: t.speaker,
          text: t.text,
          timestamp: idx * 5000,
        })),
        timeline: [
          {
            time: startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            description: `Call session established with ${claimedCaller.name || 'External Caller'} (${claimedCaller.organization || 'Organization'})`,
            type: 'info',
          },
          ...(isThreat
            ? [
                {
                  time: new Date(startTime.getTime() + 15000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  description: 'Vocal clone artifacts and high conversational urgency identified',
                  type: 'warning' as const,
                },
                {
                  time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  description: 'Autonomous protection hold executed; telecom line terminated',
                  type: 'critical' as const,
                },
              ]
            : [
                {
                  time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  description: 'Call finished cleanly without security anomalies',
                  type: 'success' as const,
                },
              ]),
        ],
        summary: `Call with ${claimedCaller.name || 'Caller'} (${claimedCaller.organization || 'Organization'}) — Final Score: ${riskScore}/100 (${severity})`,
        recommendation: isThreat
          ? 'Reported to Security Operations Center (SOC). Verify party out-of-band.'
          : 'Normal conversational pattern observed.',
        signals: [],
      };

      try {
        addCallHistory(finishedCall);
        saveLocalCallHistory(finishedCall);
      } catch {}

      if (initiatedLocally) {
        callBridge.endCall(currentSessionId);
      }

      resetCallToInitial();
      setHasActiveCall(false);
      navigate('/history');
    },
    [
      hasActiveCall,
      searchParams,
      transcript,
      currentRisk,
      claimedCaller,
      startTime,
      addCallHistory,
      resetCallToInitial,
      setHasActiveCall,
      navigate,
    ]
  );

  // Subscribe to callBridge and user personal WebSocket for remote call termination
  useEffect(() => {
    const unsubBridge = callBridge.subscribe((evt) => {
      if (evt.type === 'CALL_ENDED' || evt.type === 'CALL_DECLINED') {
        terminateCall(false);
      }
    });

    const unsubSocket = userSocketService.subscribe((evt) => {
      if (evt.type === 'CALL_ENDED') {
        terminateCall(false);
      }
    });

    return () => {
      unsubBridge();
      unsubSocket();
    };
  }, [terminateCall]);

  const handleEndCall = () => {
    terminateCall(true);
  };

  // Determine organization type to show appropriate contact
  const orgNameLower = (claimedCaller.organization || '').toLowerCase();
  const isBankAttack =
    orgNameLower.includes('bank') ||
    orgNameLower.includes('sbi') ||
    orgNameLower.includes('iob') ||
    transcript.some((t) => /bank|account|transfer|otp|kyc/i.test(t.text));
  const isPoliceAttack = orgNameLower.includes('police') || orgNameLower.includes('crime');
  const isUidaiAttack = orgNameLower.includes('uidai') || orgNameLower.includes('aadhaar');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Simulation Control Bar (when in demo mode) */}
      <DemoControlBar />

      {/* 2. Critical Intervention Modal */}
      <CriticalInterventionModal
        intervention={intervention}
        onDismiss={cancelIntervention}
        onEndCall={handleEndCall}
      />

      {!(callMode === 'simulation' || hasActiveCall) ? (
        /* ─── STANDING-BY / IDLE STATE (Zero Phantom Calls) ─── */
        <div className="flex-1 max-w-5xl mx-auto w-full p-6 sm:p-10 flex flex-col justify-center">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-8 text-center max-w-2xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto shadow-2xs">
              <ShieldCheck size={36} />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>VOICESHIELD LIVE MONITOR ACTIVE & STANDING BY</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                No Live Call In Session
              </h2>
              <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                VoiceShield real-time speech verification is armed and listening for incoming attacker calls. You can wait for an inbound call or run the guided attack simulation demo.
              </p>
            </div>

            {/* Quick Navigation / Mode Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <button
                onClick={() => {
                  setCallMode('simulation');
                  resetSihScenario();
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <Sparkles size={14} />
                <span>Run Attack Simulation Demo</span>
              </button>

              <button
                onClick={async () => {
                  try {
                    await ensureAttackerCredentials();
                  } catch {}
                  window.open('/attacker', '_blank');
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={14} />
                <span>Open Attacker Console</span>
              </button>
            </div>

            {/* Feature Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Shield size={14} className="text-blue-600" />
                  <span>Deepfake Shield</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  192-D voiceprint ECAPA-TDNN active
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Building2 size={14} className="text-indigo-600" />
                  <span>5 Protected Orgs</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  SBI, IOB, UIDAI, Police, DRDO
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Lock size={14} className="text-emerald-600" />
                  <span>Cybercrime 1930</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  National fraud hotline integrated
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={() => navigate('/home')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                Go to Security Home
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ─── ACTIVE CALL STATE ─── */
        <>
          {/* Header Bar */}
          <header
            className={`px-4 sm:px-6 py-3.5 border-b transition-colors ${
              isCritical || hasCredentialExposure
                ? 'bg-red-50/80 border-red-200'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs ${
                    isCritical || hasCredentialExposure
                      ? 'bg-red-600 text-white'
                      : callMode === 'simulation'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {isCritical || hasCredentialExposure ? (
                    <ShieldAlert size={22} />
                  ) : callMode === 'simulation' ? (
                    <Bot size={22} />
                  ) : (
                    <PhoneCall size={20} />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900 text-base tracking-tight">
                      {claimedCaller.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-900 border border-blue-200">
                      {claimedCaller.roleAndDept}
                    </span>
                    {callMode === 'simulation' ? (
                      <span className="text-xs text-slate-500 font-medium">
                        claims to represent{' '}
                        <strong className="text-slate-800">{claimedCaller.organization}</strong>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">
                        • Direct Voice Line
                      </span>
                    )}
                    {callMode === 'simulation' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-950 border border-amber-300">
                        SIMULATED ATTACK (STEP {sihStep}/4)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                        LIVE CALL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      <CallTimer startTime={startTime} active />
                    </span>
                    <span>•</span>
                    {callMode === 'simulation' ? (
                      <span className="text-amber-700 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        SIH Attack Scenario Stream
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live Microphone & Telecom Stream
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 self-end md:self-auto">
                {callMode === 'simulation' ? (
                  <button
                    onClick={resetSihScenario}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>Reset Scenario</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setMicActive(!micActive)}
                    className={`p-2 rounded-xl text-xs font-semibold border transition shadow-2xs flex items-center gap-1.5 cursor-pointer ${
                      micActive
                        ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}
                  >
                    {micActive ? <Mic size={14} className="text-emerald-600" /> : <MicOff size={14} className="text-amber-600" />}
                    <span className="hidden sm:inline">{micActive ? 'Mic Active' : 'Muted'}</span>
                  </button>
                )}

                <button
                  onClick={handleEndCall}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                >
                  <PhoneOff size={14} />
                  <span>{callMode === 'simulation' ? 'Exit Simulation' : 'End Call'}</span>
                </button>
              </div>
            </div>
          </header>

          {/* Main 2-Column Layout */}
          <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Column 1: Live Conversation Transcript */}
              <div className="lg:col-span-7 space-y-3">
                <TranscriptDisplay
                  items={transcript}
                  interimTranscript={interimTranscript}
                  maxHeight="420px"
                  isListening={micActive}
                  perspective="employee"
                  onSendMessage={handleSendMessage}
                  inputPlaceholder="Speak into mic or type as Sreya (Employee)..."
                />

                {/* Employee Quick Voice/Response Chips */}
                <div className="p-3 bg-white rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Quick Citizen / Employee Responses</span>
                    <span className="text-[10px] text-blue-600 font-semibold">1-Click Live Reply</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSendMessage('Hello, I can hear you clearly. Who is speaking?')}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-medium transition cursor-pointer"
                    >
                      "I can hear you clearly"
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendMessage('What is this call regarding?')}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-[11px] font-medium transition cursor-pointer"
                    >
                      "What is this regarding?"
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendMessage('I cannot share any OTP or account credentials over the phone.')}
                      className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-medium transition cursor-pointer"
                    >
                      "I will not share my OTP"
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendMessage('The OTP is 482913.')}
                      className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-900 text-[11px] font-medium transition cursor-pointer"
                    >
                      Disclose OTP ("482913")
                    </button>
                  </div>
                </div>
              </div>

              {/* Column 2: Actionable Security Insights ONLY */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* Caller Soliciting Sensitive Data / OTP Alert Banner */}
                {hasCallerSensitiveRequest && (
                  <div className="p-4 rounded-xl border border-red-500 bg-red-50 text-red-950 shadow-sm space-y-2 border-l-4 border-l-red-600 animate-pulse">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-red-900">
                      <ShieldAlert size={18} className="text-red-600 flex-shrink-0" />
                      <span>CRITICAL RISK: {callerSensitiveMatch?.warningLabel || 'Unauthorized Sensitive Data / OTP Solicitation'}</span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-red-900">
                      The caller is asking for <strong>{callerSensitiveMatch?.category || 'OTP / sensitive credentials'}</strong>. Legitimate organizations and banks will <strong>NEVER</strong> ask for your OTP, PIN, password, or security codes over phone calls.
                    </p>
                    {/* Matching Spoken Warning & Manual Play Trigger */}
                    <div className="p-2.5 rounded-lg bg-red-100/90 border border-red-200 text-xs text-red-900 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-red-800 uppercase">
                        <span>Spoken Audio Warning ({selectedLanguage.language})</span>
                        <button
                          type="button"
                          onClick={() => warningAudioService.playSecurityWarning('CREDENTIAL_EXPOSURE', selectedLanguage.code || selectedLanguage.language, true)}
                          className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                        >
                          <Volume2 size={11} />
                          <span>Play Warning</span>
                        </button>
                      </div>
                      <p className="italic text-[11px] text-red-950">
                        “{warningAudioService.getWarningScript('CREDENTIAL_EXPOSURE', selectedLanguage.code || selectedLanguage.language)}”
                      </p>
                    </div>
                    <div className="text-[11px] font-bold text-red-800 bg-white/80 p-2 rounded-lg border border-red-200 flex items-center gap-1.5">
                      <AlertTriangle size={13} className="text-red-600 flex-shrink-0" />
                      <span>{callerSensitiveMatch?.recommendedAction}</span>
                    </div>
                  </div>
                )}

                {/* Possible Credential Exposure Banner (if OTP spoken by employee) */}
                {hasCredentialExposure && (
                  <div className="p-4 rounded-xl border border-red-300 bg-red-100 text-red-950 shadow-sm space-y-2 animate-bounce-short">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-red-900">
                      <Flame size={18} className="text-red-600 flex-shrink-0 animate-pulse" />
                      <span>CRITICAL: Possible Credential Exposure Detected</span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed">
                      Verification code or one-time password digits were spoken aloud. Immediate counter-measures required under the 60-minute Golden-Hour window.
                    </p>
                    {/* Matching Spoken Warning & Manual Play Trigger */}
                    <div className="p-2.5 rounded-lg bg-red-200/80 border border-red-300 text-xs text-red-950 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-red-900 uppercase">
                        <span>Spoken Audio Warning ({selectedLanguage.language})</span>
                        <button
                          type="button"
                          onClick={() => warningAudioService.playSecurityWarning('CREDENTIAL_EXPOSURE', selectedLanguage.code || selectedLanguage.language, true)}
                          className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-800 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                        >
                          <Volume2 size={11} />
                          <span>Play Warning</span>
                        </button>
                      </div>
                      <p className="italic text-[11px] text-red-950">
                        “{warningAudioService.getWarningScript('CREDENTIAL_EXPOSURE', selectedLanguage.code || selectedLanguage.language)}”
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Voice Clone Impersonation Critical Banner (Acoustic Match) */}
                {isCritical && !hasCallerSensitiveRequest && !hasCredentialExposure && (
                  <div className="p-4 rounded-xl border border-rose-400 bg-rose-50 text-rose-950 shadow-sm space-y-2 border-l-4 border-l-rose-600 animate-pulse">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-rose-900">
                      <ShieldAlert size={18} className="text-rose-600 flex-shrink-0" />
                      <span>CRITICAL RISK: AI Voice Clone / Impersonation Detected</span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-rose-900">
                      Biometric and spectral analysis detected synthetic speech artifacts. Voice signature does not match claimed speaker {claimedCaller.name}.
                    </p>
                    {/* Matching Spoken Warning & Manual Play Trigger */}
                    <div className="p-2.5 rounded-lg bg-rose-100/90 border border-rose-200 text-xs text-rose-900 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-rose-800 uppercase">
                        <span>Spoken Audio Warning ({selectedLanguage.language})</span>
                        <button
                          type="button"
                          onClick={() => warningAudioService.playSecurityWarning('CRITICAL', selectedLanguage.code || selectedLanguage.language, true)}
                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                        >
                          <Volume2 size={11} />
                          <span>Play Warning</span>
                        </button>
                      </div>
                      <p className="italic text-[11px] text-rose-950">
                        “{warningAudioService.getWarningScript('CRITICAL', selectedLanguage.code || selectedLanguage.language)}”
                      </p>
                    </div>
                  </div>
                )}

                {/* High Risk Acoustic/Pattern Divergence Banner */}
                {isHigh && !isCritical && !hasCallerSensitiveRequest && !hasCredentialExposure && (
                  <div className="p-4 rounded-xl border border-orange-400 bg-orange-50 text-orange-950 shadow-sm space-y-2 border-l-4 border-l-orange-500">
                    <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-orange-900">
                      <AlertTriangle size={18} className="text-orange-600 flex-shrink-0" />
                      <span>HIGH RISK: Elevated Impersonation Risk / Unverified Acoustics</span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed text-orange-900">
                      Elevated acoustic divergence detected. Verify caller through official independent channels before sharing information.
                    </p>
                    {/* Matching Spoken Warning & Manual Play Trigger */}
                    <div className="p-2.5 rounded-lg bg-orange-100/90 border border-orange-200 text-xs text-orange-900 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-orange-800 uppercase">
                        <span>Spoken Audio Warning ({selectedLanguage.language})</span>
                        <button
                          type="button"
                          onClick={() => warningAudioService.playSecurityWarning('HIGH', selectedLanguage.code || selectedLanguage.language, true)}
                          className="px-2 py-0.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition"
                        >
                          <Volume2 size={11} />
                          <span>Play Warning</span>
                        </button>
                      </div>
                      <p className="italic text-[11px] text-orange-950">
                        “{warningAudioService.getWarningScript('HIGH', selectedLanguage.code || selectedLanguage.language)}”
                      </p>
                    </div>
                  </div>
                )}

                {/* Primary Actionable Security Insight Card */}
                <div
                  className={`card-enterprise p-5 transition-all border ${
                    isCritical || hasCredentialExposure || hasCallerSensitiveRequest
                      ? 'border-red-300/90 bg-red-50/50 shadow-sm'
                      : isHigh
                      ? 'border-orange-300 bg-orange-50/50 shadow-xs'
                      : isCaution
                      ? 'border-amber-200 bg-amber-50/30 shadow-xs'
                      : 'border-emerald-200 bg-emerald-50/20'
                  }`}
                >
                  {/* Status Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
                    <div className="flex items-center gap-2">
                      {isCritical || hasCredentialExposure || hasCallerSensitiveRequest ? (
                        <ShieldAlert size={20} className="text-red-600 flex-shrink-0" />
                      ) : isHigh ? (
                        <AlertTriangle size={20} className="text-orange-600 flex-shrink-0" />
                      ) : isCaution ? (
                        <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          Actionable Security Insight
                        </div>
                        <div className="text-base font-extrabold text-slate-900">
                          {hasCallerSensitiveRequest
                            ? `Immediate Danger: Unauthorized ${callerSensitiveMatch?.category || 'OTP'} Request`
                            : isCritical || hasCredentialExposure
                            ? 'Immediate Danger: Credential Solicitation'
                            : isHigh
                            ? 'High Impersonation Risk: Voice & Intent Mismatch'
                            : isCaution
                            ? 'Caution: Suspicious Pacing & Urgency'
                            : 'Call Appears Normal'}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        isCritical || hasCredentialExposure || hasCallerSensitiveRequest
                          ? 'bg-red-100 text-red-900 border-red-300'
                          : isHigh
                          ? 'bg-orange-100 text-orange-900 border-orange-300'
                          : isCaution
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      {hasCredentialExposure
                        ? 'CRITICAL (EXPOSURE)'
                        : hasCallerSensitiveRequest
                        ? 'CRITICAL (OTP REQUEST)'
                        : (currentRisk?.level || 'SAFE').toUpperCase()}
                    </span>
                  </div>

                  {/* What was detected */}
                  <div className="mt-4 bg-white/90 rounded-xl p-3.5 border border-slate-200/70 shadow-2xs text-xs">
                    <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                      What was detected
                    </div>
                    <div className="text-slate-800 font-semibold leading-relaxed">
                      {hasCallerSensitiveRequest
                        ? `The caller claimed identity as ${claimedCaller.name} (${claimedCaller.organization}) and requested sensitive ${callerSensitiveMatch?.category || 'OTP credentials'}. Official institutions will NEVER ask for one-time verification codes.`
                        : hasCredentialExposure
                        ? `The caller claimed identity as ${claimedCaller.name} (${claimedCaller.organization}) and induced the user to disclose one-time authorization credentials.`
                        : isCritical
                        ? 'The caller is urgently requesting a one-time password (OTP) or banking credential during an unverified caller session.'
                        : isHigh
                        ? `Acoustic voice mismatch or elevated impersonation intent detected for claimed caller ${claimedCaller.name || 'Caller'}. The voice does not match official enrolled profile.`
                        : isCaution
                        ? 'Caller is expressing abnormal urgency and asking to bypass standard verification channels.'
                        : 'Standard conversation pace. No sensitive credentials or payment requests detected.'}
                    </div>
                  </div>

                  {/* What the employee should do */}
                  <div
                    className={`mt-3 rounded-xl p-3.5 border shadow-2xs text-xs ${
                      isCritical || hasCredentialExposure || hasCallerSensitiveRequest
                        ? 'bg-red-600 text-white border-red-700'
                        : isHigh
                        ? 'bg-orange-600 text-white border-orange-700'
                        : isCaution
                        ? 'bg-amber-100 text-amber-950 border-amber-300'
                        : 'bg-blue-50 text-blue-950 border-blue-200'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-85 mb-1">
                      What you should do right now
                    </div>
                    <div className="font-extrabold text-sm leading-snug">
                      {isCritical || hasCredentialExposure || hasCallerSensitiveRequest
                        ? 'DO NOT share OTP, passwords, or approve payments. Disconnect line immediately.'
                        : isHigh
                        ? 'Do NOT disclose passwords, OTPs, or financial information. Call back on official verified directory number.'
                        : isCaution
                        ? 'Avoid disclosing credentials or transferring funds. Exercise caution.'
                        : 'Continue your call normally. Security shield is actively listening for anomalies.'}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setShowTrustedGuide(!showTrustedGuide)}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Verify caller through trusted channel</span>
                      <ExternalLink size={12} />
                    </button>

                    {(isCritical || hasCredentialExposure) && (
                      <button
                        onClick={handleEndCall}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 shadow-xs cursor-pointer"
                      >
                        Protect & Disconnect
                      </button>
                    )}
                  </div>

                  {/* Trusted channel guide dropdown */}
                  {showTrustedGuide && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-900 animate-slow-fade">
                      <div className="font-bold text-blue-950">Trusted Channel Verification Rule:</div>
                      <p className="mt-1 text-slate-700">
                        Never trust contact numbers provided during this call. Look up the organization's official published directory or call the branch directly.
                      </p>
                    </div>
                  )}
                </div>

                {/* Golden-Hour Guidance (when credentials may have been exposed) */}
                {(isCritical || isHigh || hasCredentialExposure) && (
                  <div className="card-enterprise p-4 border border-red-200 bg-red-50/50 text-xs space-y-2 animate-slow-fade">
                    <div className="flex items-center gap-2 text-red-900 font-extrabold text-xs">
                      <Flame size={16} className="text-red-600" />
                      <span>Golden-Hour Immediate Response Protocol</span>
                    </div>
                    <p className="text-red-800 leading-relaxed text-[11px]">
                      If credentials or OTP were shared, rapid intervention in the first 60 minutes prevents account compromise:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 text-[11px] font-medium">
                      <li>Immediately lock bank accounts / freeze credit & debit cards.</li>
                      <li>Dial national cybercrime hotline 1930 to freeze fraudulent fund routing.</li>
                      <li>Report the incident to the National Cyber Crime Reporting Portal.</li>
                    </ol>
                  </div>
                )}

                {/* Appropriate Immediate Contact (Dynamic by Organization) */}
                <div className="card-enterprise p-4 border border-slate-200/90 bg-white text-xs space-y-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Appropriate Immediate Contact
                  </div>

                  {isBankAttack ? (
                    <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200/80 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Landmark size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-blue-600 font-bold uppercase">Financial / Banking Fraud</div>
                        <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                          National Cybercrime Helpline & Portal
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          Toll-Free Helpline: <strong className="font-mono text-slate-900">1930</strong>
                        </div>
                        <div className="text-slate-600 text-[11px]">
                          Official Portal: <strong className="font-mono text-blue-700">cybercrime.gov.in</strong>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Request an immediate financial freeze on beneficiary accounts.
                        </p>
                      </div>
                    </div>
                  ) : isPoliceAttack ? (
                    <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-200/80 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ShieldAlert size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-indigo-600 font-bold uppercase">Police Impersonation</div>
                        <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                          Police Emergency & Cybercrime Cell
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          Emergency Response: <strong className="font-mono text-slate-900">112</strong>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Indian Police officers never demand money or OTPs over phone calls.
                        </p>
                      </div>
                    </div>
                  ) : isUidaiAttack ? (
                    <div className="p-3 bg-sky-50/80 rounded-xl border border-sky-200/80 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Building2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-sky-600 font-bold uppercase">UIDAI / Aadhaar Authority</div>
                        <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                          UIDAI Helpdesk & Biometric Lock
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          UIDAI Helpline: <strong className="font-mono text-slate-900">1947</strong>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Lock your Aadhaar biometrics immediately via the mAadhaar app.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Building2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Organizational Security</div>
                        <div className="font-extrabold text-slate-900 text-xs mt-0.5">
                          Corporate Security Operations (SOC)
                        </div>
                        <div className="text-slate-600 text-[11px] mt-0.5">
                          SOC Helpline: <strong className="font-mono text-slate-900">security@fincorp.internal</strong>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                          Report caller impersonation attempt to prevent collateral team attacks.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </>
      )}
    </div>
  );
}