import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { callBridge } from '../services/calls/callBridge';
import { userSocketService } from '../services/calls/userSocketService';
import { stopIncomingCallChime } from '../components/call/IncomingCallModal';
import { saveLocalCallHistory } from '../services/calls/callHistoryService';
import { analyzeSensitiveSolicitation } from '../utils/sensitiveDataDetector';
import { SUPPORTED_LANGUAGES, warningAudioService } from '../services/warningAudioService';
import type {
  ProgressiveRiskLevel,
  ProgressiveRiskInfo,
  VerificationState,
  VerificationInfo,
  ActiveLivenessState,
  ReplayProtectionInfo,
  SensitiveRequestSignal,
  CriticalInterventionState,
  MultilingualOption,
  DeviceNetworkContext,
  SocIncident,
} from '../types/protection';

export function normalizeRiskLevel(level: string | undefined | null): ProgressiveRiskLevel {
  const l = (level || '').toUpperCase();
  if (l === 'CRITICAL') return 'Critical';
  if (l === 'HIGH') return 'High';
  if (l === 'CAUTION' || l === 'MEDIUM' || l === 'MODERATE') return 'Caution';
  if (l === 'LOW') return 'Low';
  return 'Safe';
}

export const MULTILINGUAL_PRESETS: MultilingualOption[] = SUPPORTED_LANGUAGES.map((l) => ({
  language: l.name,
  code: l.code,
  region: l.region,
  label: l.label,
  scriptText: l.criticalWarning,
}));

export const PROGRESSIVE_RISK_STATES: Record<ProgressiveRiskLevel, ProgressiveRiskInfo> = {
  Safe: {
    level: 'Safe',
    headline: 'Call appears safe',
    detected: 'No significant security concerns detected.',
    whyItMatters: 'Vocal timbre matches normal acoustic baseline and conversational patterns are standard.',
    recommendedAction: 'Continue normally.',
  },
  Low: {
    level: 'Low',
    headline: 'Minor concern detected',
    detected: 'Some unusual conversation or voice characteristics were detected.',
    whyItMatters: 'Minor variation in speech pacing or acoustic quality observed.',
    recommendedAction: 'Continue with caution.',
  },
  Caution: {
    level: 'Caution',
    headline: 'Suspicious activity detected',
    detected: 'The conversation contains signals that require additional attention.',
    whyItMatters: 'Unusual urgency detected alongside vocal quality degradation.',
    recommendedAction: 'Avoid sharing sensitive information.',
  },
  High: {
    level: 'High',
    headline: 'Caller verification required',
    detected: 'Voice or conversation signals indicate elevated impersonation risk.',
    whyItMatters: 'Significant acoustic variation from claimed identity profile.',
    recommendedAction: 'Verify the caller through an independent trusted channel.',
  },
  Critical: {
    level: 'Critical',
    headline: 'Critical security risk',
    detected: 'The caller is requesting sensitive information while multiple suspicious signals are present.',
    whyItMatters: 'Sensitive credential solicitation detected during an unverified caller session.',
    recommendedAction: 'VoiceShield protection is being activated.',
  },
};

export const INITIAL_VERIFICATION: VerificationInfo = {
  state: 'Verification Degraded',
  headline: 'Verification in progress',
  description: 'Voice verification may be affected by call quality or speaking conditions.',
  degradedFactors: ['Background noise', 'Audio quality'],
  independentVerificationRecommended: false,
};

export const INITIAL_DEVICE_CONTEXT: DeviceNetworkContext = {
  device: 'Registered Enterprise Device',
  network: 'Corporate VPN',
  callQuality: 'Optimal',
  locationContext: 'Chennai, IN',
};

export interface DemoTranscriptItem {
  id: string;
  speaker: 'caller' | 'employee';
  text: string;
  time: string;
  hasSensitiveKeyword?: boolean;
  hasUrgentKeyword?: boolean;
}

interface DemoScenarioContextType {
  // Mode segregation
  isDemoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  callMode: 'live' | 'simulation';
  setCallMode: (mode: 'live' | 'simulation') => void;

  // Caller identity display
  claimedCaller: {
    name: string;
    roleAndDept: string;
    organization: string;
  };
  setClaimedCaller: (c: { name: string; roleAndDept: string; organization: string }) => void;

  // Progressive risk state
  currentRisk: ProgressiveRiskInfo;
  setCurrentRiskLevel: (level: string | ProgressiveRiskLevel) => void;

  // Verification panel
  verification: VerificationInfo;
  setVerificationState: (state: VerificationState, degradedFactors?: VerificationInfo['degradedFactors']) => void;

  // Active Liveness
  liveness: ActiveLivenessState;
  startLivenessChallenge: () => void;
  advanceLivenessStep: (step: ActiveLivenessState['step'], outcome?: ActiveLivenessState['outcome']) => void;
  resetLiveness: () => void;

  // Replay Protection
  replay: ReplayProtectionInfo;
  setReplayState: (state: ReplayProtectionInfo['state']) => void;

  // Sensitive request
  sensitiveSignals: SensitiveRequestSignal[];
  addSensitiveSignal: (category: SensitiveRequestSignal['category'], snippet: string) => void;

  // Critical Intervention Flow
  intervention: CriticalInterventionState;
  startCriticalIntervention: () => void;
  cancelIntervention: () => void;
  resetCallToInitial: () => void;

  // Multilingual warning preferences
  selectedLanguage: MultilingualOption;
  setSelectedLanguage: (opt: MultilingualOption) => void;

  // Device & network context
  deviceContext: DeviceNetworkContext;

  // Transcript
  transcript: DemoTranscriptItem[];
  interimTranscript: { speaker: 'caller' | 'employee'; text: string } | null;
  addTranscriptLine: (speaker: 'caller' | 'employee', text: string) => void;

  // SOC Incidents & History
  socIncidents: SocIncident[];
  latestIncidentId: string;
  updateSocIncidentStatus: (id: string, status: SocIncident['status']) => void;
  escalateToCybercrimePortal: (id: string) => void;

  // Call state
  hasActiveCall: boolean;
  setHasActiveCall: (val: boolean) => void;

  // SIH Continuous Story Controller
  sihStep: number; // 0 = not started, 1 = safe, 2 = caution, 3 = critical request, 4 = intervention, 5 = completed
  runFullSihScenario: () => void;
  runNextSihStep: () => void;
  resetSihScenario: () => void;
  isAutoAdvancing: boolean;
}

export const INITIAL_SIMULATION_DIALOGUE: DemoTranscriptItem[] = [
  {
    id: 'sim-dialogue-1',
    speaker: 'caller',
    text: 'Hello Sreya, this is Arun Kumar from the Finance Department. Could you please check the status of the quarterly reconciliation report?',
    time: '09:41:12',
    hasSensitiveKeyword: false,
    hasUrgentKeyword: false,
  },
  {
    id: 'sim-dialogue-2',
    speaker: 'employee',
    text: 'Hello Arun sir, yes, I have the sheets open. Let me review the invoice numbers for you.',
    time: '09:41:25',
    hasSensitiveKeyword: false,
    hasUrgentKeyword: false,
  },
];

const DemoScenarioContext = createContext<DemoScenarioContextType | undefined>(undefined);

export function DemoScenarioProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setDemoMode] = useState<boolean>(true);
  const [callMode, setCallMode] = useState<'live' | 'simulation'>('live');

  // Claimed caller state (explicit separation of claimed vs verified!)
  const [claimedCaller, setClaimedCaller] = useState({
    name: 'Arun Kumar',
    roleAndDept: 'Senior Executive — Finance Department',
    organization: 'FinCorp India Pvt Ltd',
  });

  const [currentRisk, setCurrentRisk] = useState<ProgressiveRiskInfo>(PROGRESSIVE_RISK_STATES.Safe);

  const [verification, setVerification] = useState<VerificationInfo>({
    state: 'Verification Degraded',
    headline: 'Verification in progress',
    description: 'Voice verification may be affected by call quality or speaking conditions.',
    degradedFactors: ['Background noise'],
    independentVerificationRecommended: false,
  });

  const [liveness, setLiveness] = useState<ActiveLivenessState>({
    step: 'idle',
    challengePhrase: 'Blue River 47',
  });

  const [replay, setReplay] = useState<ReplayProtectionInfo>({
    state: 'No replay indication',
    description: 'Acoustic continuity matches live microphone capture.',
  });

  const [sensitiveSignals, setSensitiveSignals] = useState<SensitiveRequestSignal[]>([]);

  const [selectedLanguage, setSelectedLanguageState] = useState<MultilingualOption>(() => {
    try {
      const savedCode = localStorage.getItem('voiceshield_user_language');
      if (savedCode) {
        const found = MULTILINGUAL_PRESETS.find(
          (p) =>
            p.code?.toLowerCase() === savedCode.toLowerCase() ||
            p.language.toLowerCase() === savedCode.toLowerCase()
        );
        if (found) {
          warningAudioService.setLanguage(found.code || found.language);
          return found;
        }
      }
    } catch {}
    const defaultLang = MULTILINGUAL_PRESETS[0]; // Tamil default
    warningAudioService.setLanguage(defaultLang.code || defaultLang.language);
    return defaultLang;
  });

  const setSelectedLanguage = useCallback((opt: MultilingualOption) => {
    setSelectedLanguageState(opt);
    warningAudioService.setLanguage(opt.code || opt.language);
  }, []);

  const [deviceContext] = useState<DeviceNetworkContext>(INITIAL_DEVICE_CONTEXT);

  const [intervention, setIntervention] = useState<CriticalInterventionState>({
    active: false,
    step: 'idle',
    countdownValue: 3,
    announcementLanguage: MULTILINGUAL_PRESETS[0].language,
    announcementRegion: MULTILINGUAL_PRESETS[0].region,
    announcementPlayed: false,
    incidentRef: 'INC-2026-0142',
    simulated: true,
  });

  const [hasActiveCall, setHasActiveCall] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<DemoTranscriptItem[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<{
    speaker: 'caller' | 'employee';
    text: string;
  } | null>(null);

  const [socIncidents, setSocIncidents] = useState<SocIncident[]>([
    {
      id: 'INC-2026-0142',
      timestamp: 'Today, 09:42:25',
      employee: 'Sreya Sengupta',
      employeeRole: 'Accounts & Operations Officer',
      claimedCaller: 'Arun Kumar',
      claimedDepartment: 'Finance Department',
      requestType: 'OTP & KYC Credential Request',
      protectionAction: 'Call placed on hold and terminated — SIMULATION',
      status: 'Open',
      warningLanguage: 'Tamil',
      warningRegion: 'India',
      escalatedToCybercrimePortal: false,
      evidence: {
        conversationSignal: 'Urgent OTP & credential transfer request detected',
        verificationState: 'Identity Cannot Be Verified',
        replayProtection: 'Replay suspected',
        livenessResult: 'Liveness Inconclusive',
        callCondition: 'Verification degraded due to speaking pattern variation',
        employeeAction: 'Did not disclose requested credential; call protected by VoiceShield',
      },
      timeline: [
        { id: '1', time: '09:41:12', title: 'Call started', detail: 'Inbound session established with Arun Kumar (Claimed).', type: 'info' },
        { id: '2', time: '09:41:48', title: 'Suspicious activity detected', detail: 'Acoustic mismatch and conversational urgency flagged.', type: 'warning' },
        { id: '3', time: '09:42:03', title: 'Sensitive request identified', detail: 'Caller requested immediate OTP and payment clearance.', type: 'critical' },
        { id: '4', time: '09:42:05', title: 'Warning presented', detail: 'Employee cautioned against sharing sensitive information.', type: 'warning' },
        { id: '5', time: '09:42:12', title: 'Independent verification requested', detail: 'Out-of-band verification recommended.', type: 'action' },
        { id: '6', time: '09:42:20', title: 'Call placed on hold', detail: 'Intervention policy activated.', type: 'critical' },
        { id: '7', time: '09:42:21', title: 'Security announcement played', detail: 'Tamil language security warning broadcast.', type: 'info' },
        { id: '8', time: '09:42:24', title: 'Call terminated — Simulation', detail: 'Protective telecom disconnect simulated.', type: 'critical' },
        { id: '9', time: '09:42:25', title: 'SOC incident created', detail: 'Incident INC-2026-0142 logged for audit.', type: 'action' },
      ],
      auditChain: [
        'DETECT: Speech synthesis anomaly flagged in frame chunks 14-22',
        'ASSESS: Combined risk elevated to CRITICAL based on OTP keyword + voice mismatch',
        'VERIFY: Baseline verification degraded; replay signature suspected',
        'WARN: In-call security announcement played (Tamil / India)',
        'INTERVENE: Automated call hold and termination executed (Simulation)',
        'ESCALATE: Available for National Cybercrime Portal workflow',
        'AUDIT: Complete immutable log preserved with hash verification',
      ],
    },
  ]);

  const latestIncidentId = 'INC-2026-0142';

  const [sihStep, setSihStep] = useState<number>(1);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  const setCurrentRiskLevel = useCallback((level: string | ProgressiveRiskLevel) => {
    const normalized = normalizeRiskLevel(level);
    setCurrentRisk(PROGRESSIVE_RISK_STATES[normalized] || PROGRESSIVE_RISK_STATES.Safe);
  }, []);

  const setVerificationState = useCallback(
    (state: VerificationState, degradedFactors?: VerificationInfo['degradedFactors']) => {
      let headline = 'Verified';
      let description = 'The available verification evidence supports the claimed identity.';
      let rec = false;

      if (state === 'Verification Degraded') {
        headline = 'Verification Degraded';
        description =
          'Verification confidence is affected by factors such as audio quality, background noise or speaking conditions.';
        rec = false;
      } else if (state === 'Identity Cannot Be Verified') {
        headline = 'Identity Cannot Be Verified';
        description = 'Available evidence is insufficient to verify the claimed identity.';
        rec = true;
      } else if (state === 'Suspicious') {
        headline = 'Suspicious';
        description = 'The available evidence indicates that the caller may not be the claimed person.';
        rec = true;
      }

      setVerification({
        state,
        headline,
        description,
        degradedFactors: degradedFactors || (state === 'Verification Degraded' ? ['Background noise', 'Audio quality'] : undefined),
        independentVerificationRecommended: rec,
      });
    },
    []
  );

  const startLivenessChallenge = useCallback(() => {
    const phrases = ['Blue River 47', 'Silver Falcon 91', 'Golden Horizon 23', 'Echo Delta 58'];
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
    setLiveness({
      step: 'challenge',
      challengePhrase: randomPhrase,
    });

    // Auto simulate progression if in demo mode
    setTimeout(() => {
      setLiveness((prev) => ({ ...prev, step: 'listening' }));
      setTimeout(() => {
        setLiveness((prev) => ({ ...prev, step: 'analysing' }));
        setTimeout(() => {
          setLiveness((prev) => ({
            ...prev,
            step: 'result',
            outcome: 'Liveness Inconclusive',
            timestamp: new Date().toLocaleTimeString('en-GB'),
          }));
        }, 1200);
      }, 1500);
    }, 1200);
  }, []);

  const advanceLivenessStep = useCallback(
    (step: ActiveLivenessState['step'], outcome?: ActiveLivenessState['outcome']) => {
      setLiveness((prev) => ({
        ...prev,
        step,
        outcome: outcome || prev.outcome,
      }));
    },
    []
  );

  const resetLiveness = useCallback(() => {
    setLiveness({
      step: 'idle',
      challengePhrase: 'Blue River 47',
    });
  }, []);

  const setReplayState = useCallback((state: ReplayProtectionInfo['state']) => {
    let desc = 'Acoustic continuity matches live microphone capture.';
    if (state === 'Replay suspected') {
      desc = 'Audio characteristics suggest that previously recorded speech may be present.';
    } else if (state === 'Analysis inconclusive') {
      desc = 'Insufficient acoustic frames to determine replay signature.';
    }
    setReplay({ state, description: desc });
  }, []);

  const addSensitiveSignal = useCallback((category: SensitiveRequestSignal['category'], snippet: string) => {
    const newSig: SensitiveRequestSignal = {
      category,
      detectedTextSnippet: snippet,
      timestamp: new Date().toLocaleTimeString('en-GB'),
    };
    setSensitiveSignals((prev) => [...prev, newSig]);
  }, []);

  // ─── Critical Intervention Multi-Step Execution (Requirement #11) ───────────
  const startCriticalIntervention = useCallback(() => {
    setIntervention({
      active: true,
      step: 'critical_detected',
      countdownValue: 3,
      announcementLanguage: selectedLanguage.language,
      announcementRegion: selectedLanguage.region,
      announcementPlayed: false,
      incidentRef: 'INC-2026-0142',
      simulated: true,
    });

    // Step 1 -> Step 2 (Call placed on hold) after 1.2s
    setTimeout(() => {
      setIntervention((prev) => ({ ...prev, step: 'call_held' }));

      // Step 2 -> Step 3 (Security announcement) after 1.5s
      setTimeout(() => {
        setIntervention((prev) => ({ ...prev, step: 'security_announcement', announcementPlayed: true }));
        warningAudioService.playSecurityWarning('CRITICAL', selectedLanguage.code || selectedLanguage.language);

        // Step 3 -> Step 4 (Countdown 3 -> 2 -> 1) after 2.5s
        setTimeout(() => {
          setIntervention((prev) => ({ ...prev, step: 'countdown', countdownValue: 3 }));

          setTimeout(() => {
            setIntervention((prev) => ({ ...prev, countdownValue: 2 }));

            setTimeout(() => {
              setIntervention((prev) => ({ ...prev, countdownValue: 1 }));

              // Step 4 -> Step 5 (Call terminated - SIMULATION) after 1s
              setTimeout(() => {
                setIntervention((prev) => ({ ...prev, step: 'terminated' }));

                // Step 5 -> Step 6 (SOC Incident Created) after 1.2s
                setTimeout(() => {
                  setIntervention((prev) => ({ ...prev, step: 'incident_created' }));
                }, 1200);
              }, 1000);
            }, 1000);
          }, 1000);
        }, 2500);
      }, 1500);
    }, 1200);
  }, [selectedLanguage]);

  const addTranscriptLine = useCallback((speaker: 'caller' | 'employee', text: string) => {
    const analysis = analyzeSensitiveSolicitation(text, speaker);
    const hasSensitive = analysis.isSensitive || /otp|kyc|payment|password|pin|credential|transfer/i.test(text);
    const hasUrgent = /urgent|immediately|quick|now|hurry|asap/i.test(text);
    const newItem: DemoTranscriptItem = {
      id: `t-${Date.now()}-${Math.random()}`,
      speaker,
      text,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      hasSensitiveKeyword: hasSensitive,
      hasUrgentKeyword: hasUrgent,
    };
    setTranscript((prev) => [...prev, newItem]);

    if (analysis.isSensitive) {
      const cat: SensitiveRequestSignal['category'] =
        analysis.category === 'Bank Credentials'
          ? 'Banking credentials'
          : analysis.category === 'Account Password'
          ? 'Password'
          : analysis.category === 'Identity Document'
          ? 'KYC information'
          : analysis.category === 'Payment Transfer'
          ? 'Payment'
          : 'OTP';
      addSensitiveSignal(cat, text);
      setCurrentRiskLevel(analysis.severity);
      if (analysis.severity === 'Critical') {
        startCriticalIntervention();
      }
    }
  }, [addSensitiveSignal, setCurrentRiskLevel, startCriticalIntervention]);

  const cancelIntervention = useCallback(() => {
    warningAudioService.stopWarning();
    setIntervention({
      active: false,
      step: 'idle',
      countdownValue: 3,
      announcementLanguage: selectedLanguage.language,
      announcementRegion: selectedLanguage.region,
      announcementPlayed: false,
      incidentRef: 'INC-2026-0142',
      simulated: true,
    });
  }, [selectedLanguage]);

  const resetCallToInitial = useCallback(() => {
    setCurrentRisk(PROGRESSIVE_RISK_STATES.Safe);
    setVerification({
      state: 'Verification Degraded',
      headline: 'Verification in progress',
      description: 'Voice verification may be affected by call quality or speaking conditions.',
      degradedFactors: ['Background noise'],
      independentVerificationRecommended: false,
    });
    setReplay({
      state: 'No replay indication',
      description: 'Acoustic continuity matches live microphone capture.',
    });
    setLiveness({
      step: 'idle',
      challengePhrase: 'Blue River 47',
    });
    setSensitiveSignals([]);
    setTranscript([]);
    stopIncomingCallChime();
    callBridge.clearActiveDialogues();
    setInterimTranscript(null);
    cancelIntervention();
    setSihStep(1);
    setIsAutoAdvancing(false);
  }, [cancelIntervention]);

  // SOC Incident updates
  const updateSocIncidentStatus = useCallback((id: string, status: SocIncident['status']) => {
    setSocIncidents((prev) =>
      prev.map((inc) => (inc.id === id ? { ...inc, status } : inc))
    );
  }, []);

  const escalateToCybercrimePortal = useCallback((id: string) => {
    setSocIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              escalatedToCybercrimePortal: true,
              cybercrimeEscalationRef: `NCRP-MHA-2026-${Math.floor(100000 + Math.random() * 900000)}`,
            }
          : inc
      )
    );
  }, []);

  // ─── Continuous SIH Demonstration Flow Controller (Requirement #26) ────────
  const runNextSihStep = useCallback(() => {
    setCallMode('simulation');
    setHasActiveCall(true);
    setSihStep((prev) => {
      const next = prev + 1;
      if (next === 2) {
        // Step 2: Conversation becomes suspicious (Caution)
        setCurrentRisk(PROGRESSIVE_RISK_STATES.Caution);
        setVerificationState('Suspicious', ['Speaking pattern variation', 'Unusual speaking conditions']);
        setReplayState('Replay suspected');
        addTranscriptLine(
          'caller',
          'Listen, I am in a board meeting right now and cannot talk on official lines. The vendor clearance is urgent.'
        );
      } else if (next === 3) {
        // Step 3: Urgent OTP/KYC request detected (Critical Risk)
        setCurrentRisk(PROGRESSIVE_RISK_STATES.Critical);
        setVerificationState('Identity Cannot Be Verified');
        addSensitiveSignal('OTP', 'send the OTP immediately');
        addTranscriptLine(
          'caller',
          'I need you to send the OTP immediately. This is urgent, authorize the transaction right now!'
        );
      } else if (next === 4) {
        // Step 4: Trigger Critical Intervention Flow
        startCriticalIntervention();
      }
      return next > 4 ? 4 : next;
    });
  }, [setVerificationState, setReplayState, addTranscriptLine, addSensitiveSignal, startCriticalIntervention]);

  const runFullSihScenario = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCallMode('simulation');
    setHasActiveCall(true);
    setClaimedCaller({
      name: 'Arun Kumar',
      roleAndDept: 'Senior Executive — Finance Department',
      organization: 'FinCorp India Pvt Ltd',
    });
    setCurrentRisk(PROGRESSIVE_RISK_STATES.Safe);
    setVerification({
      state: 'Verification Degraded',
      headline: 'Verification in progress',
      description: 'Voice verification may be affected by call quality or speaking conditions.',
      degradedFactors: ['Background noise'],
      independentVerificationRecommended: false,
    });
    setReplay({
      state: 'No replay indication',
      description: 'Acoustic continuity matches live microphone capture.',
    });
    setSensitiveSignals([]);
    setTranscript([...INITIAL_SIMULATION_DIALOGUE]);
    setInterimTranscript(null);
    cancelIntervention();
    setSihStep(1);
    setIsAutoAdvancing(true);

    // Initial safe step -> Step 2 after 2.5s
    timerRef.current = window.setTimeout(() => {
      setCurrentRisk(PROGRESSIVE_RISK_STATES.Caution);
      setVerificationState('Suspicious', ['Speaking pattern variation', 'Unusual speaking conditions']);
      setReplayState('Replay suspected');
      addTranscriptLine(
        'caller',
        'Listen, I am in a board meeting right now and cannot talk on official lines. The vendor clearance is urgent.'
      );
      setSihStep(2);

      // Advance to Step 3 (Critical OTP Request) after 3.5s
      timerRef.current = window.setTimeout(() => {
        setCurrentRisk(PROGRESSIVE_RISK_STATES.Critical);
        setVerificationState('Identity Cannot Be Verified');
        addSensitiveSignal('OTP', 'send the OTP immediately');
        addTranscriptLine(
          'caller',
          'I need you to send the OTP immediately. This is urgent, authorize the transaction right now!'
        );
        setSihStep(3);

        // Advance to Step 4 (Intervention Flow) after 3s
        timerRef.current = window.setTimeout(() => {
          setSihStep(4);
          startCriticalIntervention();
          setIsAutoAdvancing(false);
        }, 3000);
      }, 3500);
    }, 2500);
  }, [cancelIntervention, setVerificationState, setReplayState, addTranscriptLine, addSensitiveSignal, startCriticalIntervention]);

  const resetSihScenario = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCallMode('simulation');
    setHasActiveCall(true);
    setClaimedCaller({
      name: 'Arun Kumar',
      roleAndDept: 'Senior Executive — Finance Department',
      organization: 'FinCorp India Pvt Ltd',
    });
    setCurrentRisk(PROGRESSIVE_RISK_STATES.Safe);
    setVerification({
      state: 'Verification Degraded',
      headline: 'Verification in progress',
      description: 'Voice verification may be affected by call quality or speaking conditions.',
      degradedFactors: ['Background noise'],
      independentVerificationRecommended: false,
    });
    setReplay({
      state: 'No replay indication',
      description: 'Acoustic continuity matches live microphone capture.',
    });
    setSensitiveSignals([]);
    setTranscript([...INITIAL_SIMULATION_DIALOGUE]);
    setInterimTranscript(null);
    cancelIntervention();
    setSihStep(1);
    setIsAutoAdvancing(false);
  }, [cancelIntervention]);

  // Restore active live call from storage on mount
  useEffect(() => {
    try {
      const activeSessionId = callBridge.getActiveSessionId();
      const activeMeta = localStorage.getItem('voiceshield_active_call_meta');
      if (activeSessionId || activeMeta) {
        setHasActiveCall(true);
        setCallMode('live');
        if (activeMeta) {
          const meta = JSON.parse(activeMeta);
          if (meta.caller_name || meta.scenario?.claimedCaller) {
            setClaimedCaller({
              name: meta.caller_name || meta.scenario?.claimedCaller || 'Rajesh Kumar',
              roleAndDept: meta.caller_designation || meta.scenario?.callerDesignation || 'Bank Manager',
              organization: meta.claimed_org_name || meta.scenario?.claimedOrgName || 'Indian Overseas Bank',
            });
          }
        }
      }
      const savedDialogues = callBridge.getActiveDialogues();
      if (savedDialogues && savedDialogues.length > 0) {
        setTranscript(
          savedDialogues.map((d) => ({
            id: d.id,
            speaker: d.speaker,
            text: d.text,
            time: d.time,
            hasSensitiveKeyword: /otp|kyc|payment|password|pin|credential|transfer/i.test(d.text),
            hasUrgentKeyword: /urgent|immediately|quick|now|hurry|asap/i.test(d.text),
          }))
        );
      }
    } catch {}
  }, []);

  // Synchronize with callBridge cross-tab and backend events
  useEffect(() => {
    const unsub = callBridge.subscribe((evt) => {
      if (evt.type === 'INCOMING_CALL') {
        const p = evt.payload;
        setCallMode('live');
        if (p?.scenario) {
          setClaimedCaller({
            name: p.scenario.claimedCaller || 'Rajesh Kumar',
            roleAndDept: p.scenario.callerDesignation || 'Bank Manager',
            organization: p.scenario.claimedOrgName || 'Indian Overseas Bank',
          });
        } else if (p?.caller_name) {
          setClaimedCaller({
            name: p.caller_name,
            roleAndDept: p.caller_designation || 'Officer',
            organization: p.claimed_org_name || 'Organization',
          });
        }
      } else if (evt.type === 'CALL_ACCEPTED') {
        stopIncomingCallChime();
        setCallMode('live');
        setHasActiveCall(true);
        resetCallToInitial();
        setTranscript([]);
        callBridge.clearActiveDialogues();
        setInterimTranscript(null);
      } else if (evt.type === 'INTERIM_DIALOGUE') {
        if (callMode !== 'simulation') {
          setHasActiveCall(true);
        }
        if (evt.payload?.text) {
          setInterimTranscript({
            speaker: evt.payload.speaker || 'caller',
            text: evt.payload.text,
          });
          const interimAnalysis = analyzeSensitiveSolicitation(evt.payload.text, evt.payload.speaker || 'caller');
          if (interimAnalysis.isSensitive && interimAnalysis.severity === 'Critical') {
            setCurrentRiskLevel('Critical');
            startCriticalIntervention();
          }
        } else {
          setInterimTranscript(null);
        }
      } else if (evt.type === 'NEW_DIALOGUE') {
        if (callMode !== 'simulation') {
          setCallMode('live');
          setHasActiveCall(true);
        }
        setInterimTranscript(null);
        const { dialogue, riskLevel, analysis } = evt.payload;
        if (dialogue) {
          const sensitiveCheck = analysis || analyzeSensitiveSolicitation(dialogue.text, dialogue.speaker);
          const hasSensitiveKeyword =
            sensitiveCheck.isSensitive ||
            /otp|kyc|payment|password|pin|credential|transfer/i.test(dialogue.text);

          setTranscript((prev) => {
            if (dialogue.id && prev.some((item) => item.id === dialogue.id)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: dialogue.id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                speaker: dialogue.speaker,
                text: dialogue.text,
                time: dialogue.time || new Date().toLocaleTimeString('en-GB'),
                hasSensitiveKeyword,
                hasUrgentKeyword: /urgent|immediately|quick|now|hurry|asap/i.test(dialogue.text),
              },
            ];
          });

          if (sensitiveCheck.isSensitive) {
            const cat: SensitiveRequestSignal['category'] =
              sensitiveCheck.category === 'Bank Credentials'
                ? 'Banking credentials'
                : sensitiveCheck.category === 'Account Password'
                ? 'Password'
                : sensitiveCheck.category === 'Identity Document'
                ? 'KYC information'
                : sensitiveCheck.category === 'Payment Transfer'
                ? 'Payment'
                : 'OTP';
            addSensitiveSignal(cat, dialogue.text);
            setCurrentRiskLevel(sensitiveCheck.severity);
            setVerificationState('Identity Cannot Be Verified');
            if (sensitiveCheck.severity === 'Critical') {
              startCriticalIntervention();
            }
          }
        }
        if (riskLevel) {
          setCurrentRiskLevel(riskLevel);
          if (normalizeRiskLevel(riskLevel) === 'Critical') {
            startCriticalIntervention();
          }
        }
      } else if (evt.type === 'RISK_UPDATE') {
        if (evt.payload?.level) {
          setCurrentRiskLevel(evt.payload.level);
          if (normalizeRiskLevel(evt.payload.level) === 'Critical') {
            startCriticalIntervention();
          }
        }
      } else if (evt.type === 'CALL_ENDED' || evt.type === 'CALL_DECLINED') {
        stopIncomingCallChime();
        const activeId = callBridge.getActiveSessionId() || evt.payload?.sessionId || `call-${Date.now()}`;
        if (transcript && transcript.length > 0) {
          const isThreat = currentRisk.level === 'Critical' || currentRisk.level === 'High';
          saveLocalCallHistory({
            id: activeId,
            caller: {
              name: claimedCaller.name || 'External Caller',
              claimedRole: claimedCaller.roleAndDept || 'Executive / Official',
              organization: claimedCaller.organization || 'Indian Overseas Bank',
              status: isThreat ? 'failed' : 'verified',
              statusMessage: isThreat ? 'Deepfake vocal pattern detected' : 'Identity verified',
            },
            source: 'browser',
            startTime: new Date(Date.now() - 60000),
            endTime: new Date(),
            duration: 60,
            finalSeverity: isThreat ? 'CRITICAL' : 'SAFE',
            finalScore: isThreat ? 85 : 15,
            finalAction: isThreat ? 'Autonomous Protection Terminated' : 'Call completed normally',
            transcript: transcript.map((t, idx) => ({
              id: t.id,
              speaker: t.speaker,
              text: t.text,
              timestamp: idx * 5000,
            })),
            timeline: [],
            summary: `Call with ${claimedCaller.name || 'Caller'} (${claimedCaller.organization || 'Organization'})`,
            recommendation: isThreat ? 'Out-of-band verification recommended' : 'No threat detected',
            signals: [],
          });
        }
        setHasActiveCall(false);
        setInterimTranscript(null);
        callBridge.clearActiveDialogues();
        cancelIntervention();
      }
    });

    return () => unsub();
  }, [callMode, setCurrentRiskLevel, startCriticalIntervention, cancelIntervention, resetCallToInitial]);

  // Real-time backend WebSocket risk telemetry listener (via user personal feed)
  useEffect(() => {
    const unsubSocket = userSocketService.subscribe((evt) => {
      if (evt.type === 'RISK_UPDATE' && evt.data) {
        const d = evt.data;
        const level = d.risk_level || (d.risk_score >= 80 ? 'Critical' : d.risk_score >= 60 ? 'High' : 'Safe');
        setCurrentRiskLevel(level);
        if (normalizeRiskLevel(level) === 'Critical') {
          startCriticalIntervention();
        }
        // Sync real-time transcript from backend
        if (d.transcript) {
          if (d.is_final) {
            setInterimTranscript(null);
            addTranscriptLine(d.speaker || 'caller', d.transcript);
          } else {
            setInterimTranscript({
              speaker: d.speaker || 'caller',
              text: d.transcript,
            });
          }
        }
      } else if (evt.type === 'USER_SECURITY_ALERT' && evt.data) {
        setCurrentRiskLevel(evt.data.severity || 'Critical');
        startCriticalIntervention();
        warningAudioService.playSecurityWarning('CRITICAL', selectedLanguage.code || selectedLanguage.language);
      } else if (evt.type === 'CALL_ENDED') {
        stopIncomingCallChime();
        warningAudioService.stopWarning();
        setHasActiveCall(false);
        setInterimTranscript(null);
        cancelIntervention();
        callBridge.clearActiveDialogues();
      }
    });

    return () => unsubSocket();
  }, [setCurrentRiskLevel, startCriticalIntervention, addTranscriptLine, cancelIntervention, selectedLanguage]);

  return (
    <DemoScenarioContext.Provider
      value={{
        isDemoMode,
        setDemoMode,
        callMode,
        setCallMode,
        claimedCaller,
        setClaimedCaller,
        currentRisk,
        setCurrentRiskLevel,
        verification,
        setVerificationState,
        liveness,
        startLivenessChallenge,
        advanceLivenessStep,
        resetLiveness,
        replay,
        setReplayState,
        sensitiveSignals,
        addSensitiveSignal,
        intervention,
        startCriticalIntervention,
        cancelIntervention,
        resetCallToInitial,
        selectedLanguage,
        setSelectedLanguage,
        deviceContext,
        transcript,
        interimTranscript,
        addTranscriptLine,
        socIncidents,
        latestIncidentId,
        updateSocIncidentStatus,
        escalateToCybercrimePortal,
        hasActiveCall,
        setHasActiveCall,
        sihStep,
        runFullSihScenario,
        runNextSihStep,
        resetSihScenario,
        isAutoAdvancing,
      }}
    >
      {children}
    </DemoScenarioContext.Provider>
  );
}

export function useDemoScenario() {
  const context = useContext(DemoScenarioContext);
  if (!context) {
    throw new Error('useDemoScenario must be used within a DemoScenarioProvider');
  }
  return context;
}
