// src/utils/mockData.js
// Enterprise Security Operations Center Mock Data & State Store

export const INITIAL_KPIS = {
  activeCritical: 3,
  highRiskEvents: 8,
  underAnalysis: 5,
  openInvestigations: 4,
  incidentsToday: 14,
  protectedIdentities: 18,
};

export const INITIAL_SYSTEM_SERVICES = [
  { id: 'voice_detection', name: 'Voice Detection (CNN v2)', status: 'OPERATIONAL', latencyMs: 38, uptime: '99.98%', lastCheck: 'Just now' },
  { id: 'speaker_verification', name: 'Speaker Verification (ECAPA-TDNN)', status: 'OPERATIONAL', latencyMs: 42, uptime: '99.95%', lastCheck: 'Just now' },
  { id: 'whisper_asr', name: 'ASR Engine (faster-whisper)', status: 'OPERATIONAL', latencyMs: 65, uptime: '99.91%', lastCheck: 'Just now' },
  { id: 'risk_engine', name: 'Risk Decision Engine', status: 'OPERATIONAL', latencyMs: 12, uptime: '100.0%', lastCheck: 'Just now' },
  { id: 'event_stream', name: 'Telemetry Event Stream', status: 'OPERATIONAL', latencyMs: 5, uptime: '99.99%', lastCheck: 'Just now' },
  { id: 'database', name: 'Security Data Lake', status: 'OPERATIONAL', latencyMs: 16, uptime: '100.0%', lastCheck: 'Just now' },
];

export const INITIAL_PROTECTED_IDENTITIES = [
  {
    id: 'PID-101',
    name: 'Elena Rostova',
    position: 'Chief Financial Officer (CFO)',
    department: 'Finance',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'ENROLLED',
    samplesCount: 5,
    enrollmentDate: '2026-01-15',
    lastVerification: '2026-09-05 14:22:10 UTC',
    riskTier: 'TIER-1 (CRITICAL)',
    avatarInitials: 'ER'
  },
  {
    id: 'PID-102',
    name: 'Arthur Sterling',
    position: 'Chief Executive Officer (CEO)',
    department: 'Executive',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'ENROLLED',
    samplesCount: 6,
    enrollmentDate: '2026-01-10',
    lastVerification: '2026-09-04 18:40:02 UTC',
    riskTier: 'TIER-1 (CRITICAL)',
    avatarInitials: 'AS'
  },
  {
    id: 'PID-103',
    name: 'Devon Vance',
    position: 'VP of Infrastructure & Security',
    department: 'Engineering',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'ENROLLED',
    samplesCount: 4,
    enrollmentDate: '2026-02-01',
    lastVerification: '2026-09-05 11:15:32 UTC',
    riskTier: 'TIER-1 (CRITICAL)',
    avatarInitials: 'DV'
  },
  {
    id: 'PID-104',
    name: 'Sarah Jenkins',
    position: 'Chief Legal Officer & General Counsel',
    department: 'Legal',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'ENROLLED',
    samplesCount: 5,
    enrollmentDate: '2026-02-18',
    lastVerification: '2026-09-03 09:12:44 UTC',
    riskTier: 'TIER-2 (HIGH)',
    avatarInitials: 'SJ'
  },
  {
    id: 'PID-105',
    name: 'Rajesh Patel',
    position: 'Head of Global Human Resources',
    department: 'HR',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'ENROLLED',
    samplesCount: 3,
    enrollmentDate: '2026-03-05',
    lastVerification: '2026-09-05 08:31:00 UTC',
    riskTier: 'TIER-2 (HIGH)',
    avatarInitials: 'RP'
  },
  {
    id: 'PID-106',
    name: 'Claire Beauchamp',
    position: 'Treasurer & Senior Controller',
    department: 'Finance',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'PENDING_UPDATE',
    samplesCount: 2,
    enrollmentDate: '2026-04-12',
    lastVerification: '2026-08-29 16:04:19 UTC',
    riskTier: 'TIER-1 (CRITICAL)',
    avatarInitials: 'CB'
  },
  {
    id: 'PID-107',
    name: 'Michael Thorne',
    position: 'Chief Information Officer (CIO)',
    department: 'IT Operations',
    protectionStatus: 'ACTIVE',
    speakerProfileStatus: 'ENROLLED',
    samplesCount: 4,
    enrollmentDate: '2026-01-20',
    lastVerification: '2026-09-02 10:14:50 UTC',
    riskTier: 'TIER-1 (CRITICAL)',
    avatarInitials: 'MT'
  }
];

export const INITIAL_INCIDENTS = [
  {
    id: 'INC-2026-00142',
    title: 'Potential AI-cloned CFO impersonation targeting Senior Controller',
    severity: 'CRITICAL',
    status: 'OPEN',
    createdAt: '2026-09-05 14:48:22 UTC',
    lastUpdated: '2026-09-05 14:51:10 UTC',
    target: {
      name: 'Claire Beauchamp',
      role: 'Senior Financial Controller',
      department: 'Finance',
      email: 'c.beauchamp@enterprise.internal',
      endpointId: 'EXT-8834 (Inbound VoIP)'
    },
    claimedIdentity: {
      name: 'Elena Rostova',
      role: 'Chief Financial Officer (CFO)',
      isProtected: true,
      profileId: 'PID-101'
    },
    attackType: 'AI Voice Clone & Financial Fraud',
    riskScore: 92,
    assignedAnalyst: 'Sarah Chen (SOC Lead)',
    duration: '2m 14s',
    channel: 'Enterprise PBX Trunk 02',
    callerNumber: '+1 (415) 555-0193 [Spoofed Internal CallerID]',
    
    overallRisk: {
      score: 92,
      level: 'CRITICAL',
      recommendation: 'BLOCK_OR_ESCALATE'
    },
    riskBreakdown: {
      voiceAuthenticity: 91,
      identityRisk: 86,
      conversationRisk: 78,
      contextualRisk: 82,
      transactionRisk: null
    },
    detectionEvidence: {
      syntheticProbability: 0.91,
      speakerSimilarity: 0.63,
      identityVerification: 'IDENTITY MISMATCH',
      voiceAuthenticity: 'SUSPICIOUS',
      indicators: [
        'Spectral vocoder discontinuity (HiFi-GAN marker)',
        'Synthetic pitch track irregularity',
        'Unnatural formants transition in vocal tract',
        'Speaker biometric separation distance > 0.37',
        'Urgency cues combined with procedure bypass attempt'
      ]
    },
    identityDetails: {
      claimed: 'Chief Financial Officer',
      protectedProfile: 'Available',
      verification: 'IDENTITY MISMATCH',
      speakerSimilarity: '0.63',
      verificationConfidence: 'HIGH'
    },
    conversationIntelligence: {
      detectedIntent: 'PAYMENT_TRANSFER',
      intentConfidence: 0.94,
      suspiciousIndicators: [
        'Authority claim (Executive urgency)',
        'Sensitive payment wire ($480,000 acquisition fee)',
        'Request to bypass standard 2-party sign-off',
        'Strict confidentiality & secrecy demand',
        'Out-of-band communication direction'
      ],
      transcriptNotice: 'Restricted investigation evidence — not connected'
    },
    explainability: [
      'Synthetic voice probability (91%) exceeded critical threat threshold (60%)',
      'Protected biometric speaker identity conflict (Cosine similarity 0.63 vs 0.70 threshold)',
      'High-risk intent detected: Unscheduled high-value wire transfer request',
      'Urgency and crisis framing detected in conversational cadence',
      'Procedural bypass directive issued to finance subordinate'
    ],
    riskOverTime: [
      { timestamp: '00:00', risk: 14, syntheticProb: 0.08, speakerSim: 0.60 },
      { timestamp: '00:25', risk: 28, syntheticProb: 0.22, speakerSim: 0.61 },
      { timestamp: '00:50', risk: 62, syntheticProb: 0.71, speakerSim: 0.62 },
      { timestamp: '01:15', risk: 85, syntheticProb: 0.89, speakerSim: 0.63 },
      { timestamp: '01:40', risk: 92, syntheticProb: 0.91, speakerSim: 0.63 },
      { timestamp: '02:05', risk: 92, syntheticProb: 0.91, speakerSim: 0.63 }
    ],
    timeline: [
      { id: 'tl-1', time: '14:48:22 UTC', event: 'Communication session initiated via PBX Trunk 02', severity: 'LOW' },
      { id: 'tl-2', time: '14:48:35 UTC', event: 'Identity claim detected: Caller identified as CFO Elena Rostova', severity: 'LOW' },
      { id: 'tl-3', time: '14:49:05 UTC', event: 'Silero VAD confirms active human-cadence speech stream', severity: 'LOW' },
      { id: 'tl-4', time: '14:49:22 UTC', event: 'Acoustic feature analysis detects neural vocoder artifacts; synthetic probability crosses 70%', severity: 'HIGH' },
      { id: 'tl-5', time: '14:49:40 UTC', event: 'ECAPA-TDNN biometric verification yields 0.63 cosine similarity (IDENTITY MISMATCH)', severity: 'HIGH' },
      { id: 'tl-6', time: '14:50:01 UTC', event: 'Risk Engine escalates session to CRITICAL (Risk: 92 / 100)', severity: 'CRITICAL' },
      { id: 'tl-7', time: '14:50:05 UTC', event: 'Conversational intent detector flags urgent wire transfer ($480k) with bypass cues', severity: 'CRITICAL' },
      { id: 'tl-8', time: '14:50:07 UTC', event: 'Target receiver endpoint alerted with high-risk visual banner', severity: 'HIGH' },
      { id: 'tl-9', time: '14:50:10 UTC', event: 'Security incident INC-2026-00142 created automatically and pushed to SOC queue', severity: 'CRITICAL' },
      { id: 'tl-10', time: '14:51:10 UTC', event: 'SOC Lead Sarah Chen opened investigation workspace', severity: 'MEDIUM' }
    ],
    resolution: null
  },
  {
    id: 'INC-2026-00141',
    title: 'Synthetic Voice OTP Bypass attempt targeting IT Operations Lead',
    severity: 'HIGH',
    status: 'UNDER_INVESTIGATION',
    createdAt: '2026-09-05 13:12:04 UTC',
    lastUpdated: '2026-09-05 13:40:19 UTC',
    target: {
      name: 'Michael Thorne',
      role: 'Chief Information Officer',
      department: 'IT Operations',
      email: 'm.thorne@enterprise.internal',
      endpointId: 'EXT-1042 (Direct Inbound)'
    },
    claimedIdentity: {
      name: 'Devon Vance',
      role: 'VP of Infrastructure & Security',
      isProtected: true,
      profileId: 'PID-103'
    },
    attackType: 'Credential Harvesting & Voice Spoofing',
    riskScore: 78,
    assignedAnalyst: 'Marcus Vance (Analyst II)',
    duration: '1m 45s',
    channel: 'Enterprise WebRTC Gateway',
    callerNumber: '+1 (202) 555-0182',
    
    overallRisk: {
      score: 78,
      level: 'HIGH',
      recommendation: 'REQUIRE_ADDITIONAL_VERIFICATION'
    },
    riskBreakdown: {
      voiceAuthenticity: 74,
      identityRisk: 82,
      conversationRisk: 88,
      contextualRisk: 68,
      transactionRisk: null
    },
    detectionEvidence: {
      syntheticProbability: 0.74,
      speakerSimilarity: 0.58,
      identityVerification: 'IDENTITY MISMATCH',
      voiceAuthenticity: 'SUSPICIOUS',
      indicators: [
        'Acoustic phase irregularities',
        'Speaker similarity below baseline threshold',
        'Direct inquiry for multi-factor authentication token'
      ]
    },
    identityDetails: {
      claimed: 'VP Infrastructure & Security',
      protectedProfile: 'Available',
      verification: 'IDENTITY MISMATCH',
      speakerSimilarity: '0.58',
      verificationConfidence: 'HIGH'
    },
    conversationIntelligence: {
      detectedIntent: 'OTP_REQUEST',
      intentConfidence: 0.91,
      suspiciousIndicators: [
        'Urgent production outage pretext',
        'Immediate OTP / push token forward request',
        'Voice clone of infrastructure executive'
      ],
      transcriptNotice: 'Restricted investigation evidence — not connected'
    },
    explainability: [
      'Synthetic probability (74%) flagged as anomalous',
      'Speaker biometric profile conflict with Devon Vance (0.58 similarity)',
      'Intent classified as critical OTP / credential request',
      'Recipient advised to perform secondary callback verification'
    ],
    riskOverTime: [
      { timestamp: '00:00', risk: 10, syntheticProb: 0.05, speakerSim: 0.55 },
      { timestamp: '00:30', risk: 35, syntheticProb: 0.30, speakerSim: 0.57 },
      { timestamp: '01:00', risk: 65, syntheticProb: 0.68, speakerSim: 0.58 },
      { timestamp: '01:30', risk: 78, syntheticProb: 0.74, speakerSim: 0.58 }
    ],
    timeline: [
      { id: 'tl-1', time: '13:12:04 UTC', event: 'Inbound session established via WebRTC Gateway', severity: 'LOW' },
      { id: 'tl-2', time: '13:12:20 UTC', event: 'Caller claims identity of VP Infrastructure', severity: 'LOW' },
      { id: 'tl-3', time: '13:12:50 UTC', event: 'Biometric mismatch recorded against PID-103', severity: 'HIGH' },
      { id: 'tl-4', time: '13:13:15 UTC', event: 'Intent engine detects OTP_REQUEST', severity: 'HIGH' },
      { id: 'tl-5', time: '13:13:20 UTC', event: 'Incident INC-2026-00141 created', severity: 'HIGH' },
      { id: 'tl-6', time: '13:15:00 UTC', event: 'Analyst Marcus Vance assigned to case', severity: 'MEDIUM' }
    ],
    resolution: null
  },
  {
    id: 'INC-2026-00140',
    title: 'Unenrolled caller impersonation targeting HR Payroll Specialist',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    createdAt: '2026-09-05 11:05:19 UTC',
    lastUpdated: '2026-09-05 11:45:22 UTC',
    target: {
      name: 'Anita Roy',
      role: 'Senior Payroll Specialist',
      department: 'HR',
      email: 'a.roy@enterprise.internal',
      endpointId: 'EXT-5109'
    },
    claimedIdentity: {
      name: 'David K. Miller',
      role: 'Director of Product',
      isProtected: false,
      profileId: null
    },
    attackType: 'Caller Impersonation & Direct Deposit Diversion',
    riskScore: 58,
    assignedAnalyst: 'Alex Mercer (Analyst I)',
    duration: '3m 10s',
    channel: 'VoIP Gateway 01',
    callerNumber: '+1 (312) 555-0144',
    
    overallRisk: {
      score: 58,
      level: 'MEDIUM',
      recommendation: 'VERIFY_SPEAKER'
    },
    riskBreakdown: {
      voiceAuthenticity: 35,
      identityRisk: 65,
      conversationRisk: 72,
      contextualRisk: 60,
      transactionRisk: null
    },
    detectionEvidence: {
      syntheticProbability: 0.22,
      speakerSimilarity: null,
      identityVerification: 'NOT AVAILABLE',
      voiceAuthenticity: 'GENUINE',
      indicators: [
        'Acoustic profile appears natural human voice',
        'No pre-enrolled speaker profile exists for claimed identity',
        'High conversation risk: Request to redirect salary direct deposit'
      ]
    },
    identityDetails: {
      claimed: 'David K. Miller',
      protectedProfile: 'Not Available',
      verification: 'NOT AVAILABLE',
      speakerSimilarity: 'N/A',
      verificationConfidence: 'LOW'
    },
    conversationIntelligence: {
      detectedIntent: 'PAYMENT_TRANSFER',
      intentConfidence: 0.78,
      suspiciousIndicators: [
        'Direct deposit bank account update request',
        'Call placed outside normal business hours',
        'Caller insisted on immediate change before cutoff'
      ],
      transcriptNotice: 'Restricted investigation evidence — not connected'
    },
    explainability: [
      'Speaker verification unavailable: No voiceprint on file for employee',
      'Synthetic probability was low (22%), indicating genuine human caller',
      'Conversational intent flagged high-risk payroll routing request',
      'Standard protocol requires video call verification for payroll changes'
    ],
    riskOverTime: [
      { timestamp: '00:00', risk: 15, syntheticProb: 0.10, speakerSim: null },
      { timestamp: '01:00', risk: 42, syntheticProb: 0.18, speakerSim: null },
      { timestamp: '02:00', risk: 58, syntheticProb: 0.22, speakerSim: null }
    ],
    timeline: [
      { id: 'tl-1', time: '11:05:19 UTC', event: 'Call connected to HR payroll queue', severity: 'LOW' },
      { id: 'tl-2', time: '11:06:00 UTC', event: 'Profile lookup indicates no enrollment for David K. Miller', severity: 'MEDIUM' },
      { id: 'tl-3', time: '11:07:15 UTC', event: 'Payroll account redirection intent detected', severity: 'MEDIUM' },
      { id: 'tl-4', time: '11:07:30 UTC', event: 'Incident INC-2026-00140 dispatched', severity: 'MEDIUM' },
      { id: 'tl-5', time: '11:35:00 UTC', event: 'Analyst completed out-of-band phone verification with actual employee', severity: 'LOW' },
      { id: 'tl-6', time: '11:45:22 UTC', event: 'Incident resolved: Confirmed social engineering attempt by unknown third party', severity: 'LOW' }
    ],
    resolution: {
      verdict: 'CONFIRMED_ATTACK',
      reason: 'Verified through employee secondary mobile phone that he did not place this call. Fraudulent direct deposit attempt blocked.',
      resolvedBy: 'Alex Mercer (Analyst I)',
      resolvedAt: '2026-09-05 11:45:22 UTC'
    }
  },
  {
    id: 'INC-2026-00139',
    title: 'Cellular degradation false-positive on verified CLO call',
    severity: 'LOW',
    status: 'FALSE_POSITIVE',
    createdAt: '2026-09-05 09:14:33 UTC',
    lastUpdated: '2026-09-05 09:50:11 UTC',
    target: {
      name: 'Thomas Vance',
      role: 'Associate General Counsel',
      department: 'Legal',
      email: 't.vance@enterprise.internal',
      endpointId: 'EXT-3012'
    },
    claimedIdentity: {
      name: 'Sarah Jenkins',
      role: 'Chief Legal Officer',
      isProtected: true,
      profileId: 'PID-104'
    },
    attackType: 'Channel Distortion Anomaly',
    riskScore: 32,
    assignedAnalyst: 'Sarah Chen (SOC Lead)',
    duration: '4m 12s',
    channel: 'Mobile Gateway LTE',
    callerNumber: '+1 (202) 555-0111',
    
    overallRisk: {
      score: 32,
      level: 'LOW',
      recommendation: 'MONITOR'
    },
    riskBreakdown: {
      voiceAuthenticity: 38,
      identityRisk: 25,
      conversationRisk: 10,
      contextualRisk: 20,
      transactionRisk: null
    },
    detectionEvidence: {
      syntheticProbability: 0.38,
      speakerSimilarity: 0.88,
      identityVerification: 'VERIFIED',
      voiceAuthenticity: 'GENUINE',
      indicators: [
        'Packet jitter and GSM codec compression artifacts triggered initial anomaly warning',
        'ECAPA-TDNN speaker similarity 0.88 (exceeds 0.70 threshold)',
        'Conversational intent classified as NORMAL_CONVERSATION'
      ]
    },
    identityDetails: {
      claimed: 'Chief Legal Officer',
      protectedProfile: 'Available',
      verification: 'VERIFIED',
      speakerSimilarity: '0.88',
      verificationConfidence: 'HIGH'
    },
    conversationIntelligence: {
      detectedIntent: 'NORMAL_CONVERSATION',
      intentConfidence: 0.96,
      suspiciousIndicators: [],
      transcriptNotice: 'Restricted investigation evidence — not connected'
    },
    explainability: [
      'Speaker biometrics strongly matched Chief Legal Officer Sarah Jenkins (0.88)',
      'Transient synthetic score elevation caused by AMR-WB cellular codec packet loss',
      'Zero financial, urgency, or credential requests detected in conversation',
      'Confirmed legitimate executive call'
    ],
    riskOverTime: [
      { timestamp: '00:00', risk: 12, syntheticProb: 0.12, speakerSim: 0.87 },
      { timestamp: '01:00', risk: 44, syntheticProb: 0.42, speakerSim: 0.88 },
      { timestamp: '02:00', risk: 32, syntheticProb: 0.38, speakerSim: 0.88 },
      { timestamp: '03:00', risk: 20, syntheticProb: 0.15, speakerSim: 0.89 }
    ],
    timeline: [
      { id: 'tl-1', time: '09:14:33 UTC', event: 'Inbound cellular roaming call connected', severity: 'LOW' },
      { id: 'tl-2', time: '09:15:10 UTC', event: 'Biometric verification confirms identity (Cosine: 0.88)', severity: 'LOW' },
      { id: 'tl-3', time: '09:15:40 UTC', event: 'Packet jitter flagged low-confidence anomaly', severity: 'MEDIUM' },
      { id: 'tl-4', time: '09:50:11 UTC', event: 'Closed as FALSE_POSITIVE by SOC Lead', severity: 'LOW' }
    ],
    resolution: {
      verdict: 'FALSE_POSITIVE',
      reason: 'Cellular network packet loss caused transient high-frequency clipping. Speaker identity confirmed and no hostile intent present.',
      resolvedBy: 'Sarah Chen (SOC Lead)',
      resolvedAt: '2026-09-05 09:50:11 UTC'
    }
  },
  {
    id: 'INC-2026-00138',
    title: 'AI cloned CEO speech targeting Executive Assistant for M&A documents',
    severity: 'CRITICAL',
    status: 'CONFIRMED_ATTACK',
    createdAt: '2026-09-04 17:21:09 UTC',
    lastUpdated: '2026-09-04 18:05:44 UTC',
    target: {
      name: 'Chloe Bennett',
      role: 'Executive Assistant to CEO',
      department: 'Executive',
      email: 'c.bennett@enterprise.internal',
      endpointId: 'EXT-1002'
    },
    claimedIdentity: {
      name: 'Arthur Sterling',
      role: 'Chief Executive Officer (CEO)',
      isProtected: true,
      profileId: 'PID-102'
    },
    attackType: 'AI Voice Clone & Data Exfiltration',
    riskScore: 96,
    assignedAnalyst: 'Sarah Chen (SOC Lead)',
    duration: '1m 58s',
    channel: 'Inbound SIP Trunk 01',
    callerNumber: '+1 (212) 555-0100 [Spoofed]',
    
    overallRisk: {
      score: 96,
      level: 'CRITICAL',
      recommendation: 'BLOCK_OR_ESCALATE'
    },
    riskBreakdown: {
      voiceAuthenticity: 95,
      identityRisk: 92,
      conversationRisk: 89,
      contextualRisk: 94,
      transactionRisk: null
    },
    detectionEvidence: {
      syntheticProbability: 0.95,
      speakerSimilarity: 0.61,
      identityVerification: 'IDENTITY MISMATCH',
      voiceAuthenticity: 'SUSPICIOUS',
      indicators: [
        'Synthetic vocoder artifact index 0.95',
        'Deepfake CNN v2 classification: CLONED',
        'Speaker similarity 0.61 vs 0.70 threshold',
        'Confidential M&A acquisition contract exfiltration intent'
      ]
    },
    identityDetails: {
      claimed: 'Chief Executive Officer',
      protectedProfile: 'Available',
      verification: 'IDENTITY MISMATCH',
      speakerSimilarity: '0.61',
      verificationConfidence: 'HIGH'
    },
    conversationIntelligence: {
      detectedIntent: 'CREDENTIAL_REQUEST',
      intentConfidence: 0.93,
      suspiciousIndicators: [
        'Request for unredacted Project Titan M&A dossier',
        'Instructions to send to private ProtonMail address',
        'Severe urgency ("on the runway in Zurich, need it right now")',
        'AI clone of CEO cadence and verbal idiosyncrasies'
      ],
      transcriptNotice: 'Restricted investigation evidence — not connected'
    },
    explainability: [
      'Acoustic deepfake model recorded 95% synthetic probability',
      'Speaker biometric profile conflict with CEO Arthur Sterling',
      'Request violated confidential document distribution security policy',
      'Immediate alert presented to assistant; exfiltration prevented'
    ],
    riskOverTime: [
      { timestamp: '00:00', risk: 20, syntheticProb: 0.15, speakerSim: 0.58 },
      { timestamp: '00:30', risk: 65, syntheticProb: 0.72, speakerSim: 0.60 },
      { timestamp: '01:00', risk: 94, syntheticProb: 0.94, speakerSim: 0.61 },
      { timestamp: '01:30', risk: 96, syntheticProb: 0.95, speakerSim: 0.61 }
    ],
    timeline: [
      { id: 'tl-1', time: '17:21:09 UTC', event: 'Call received by CEO office assistant', severity: 'LOW' },
      { id: 'tl-2', time: '17:21:40 UTC', event: 'Acoustic deepfake detector flags synthetic voice (0.95)', severity: 'CRITICAL' },
      { id: 'tl-3', time: '17:22:01 UTC', event: 'Biometric mismatch recorded against CEO reference profile', severity: 'CRITICAL' },
      { id: 'tl-4', time: '17:22:15 UTC', event: 'Recipient endpoint displays RED SECURITY BANNER', severity: 'HIGH' },
      { id: 'tl-5', time: '17:22:30 UTC', event: 'Assistant hung up without transmitting documents', severity: 'LOW' },
      { id: 'tl-6', time: '18:05:44 UTC', event: 'Incident closed as CONFIRMED_ATTACK by SOC Lead', severity: 'LOW' }
    ],
    resolution: {
      verdict: 'CONFIRMED_ATTACK',
      reason: 'Forensic telemetry confirmed AI voice synthesis clone of CEO. Threat actor attempted social engineering to exfiltrate unreleased M&A data. Incident escalated to Federal Law Enforcement & CIRT.',
      resolvedBy: 'Sarah Chen (SOC Lead)',
      resolvedAt: '2026-09-04 18:05:44 UTC'
    }
  }
];

export const INITIAL_LIVE_EVENTS = [
  {
    id: 'EVT-90412',
    timestamp: '2 sec ago',
    severity: 'CRITICAL',
    title: 'Potential AI-cloned executive impersonation detected',
    target: 'Finance Officer (Claire Beauchamp)',
    claimedIdentity: 'CFO Elena Rostova',
    riskScore: 92,
    syntheticProbability: 0.91,
    speakerStatus: 'IDENTITY MISMATCH',
    intent: 'PAYMENT_TRANSFER',
    channel: 'PBX-Trunk-02',
    status: 'INCIDENT_CREATED',
    incidentId: 'INC-2026-00142'
  },
  {
    id: 'EVT-90411',
    timestamp: '18 sec ago',
    severity: 'HIGH',
    title: 'Sensitive token request with low speaker biometric match',
    target: 'IT Infrastructure (Michael Thorne)',
    claimedIdentity: 'VP Security Devon Vance',
    riskScore: 78,
    syntheticProbability: 0.74,
    speakerStatus: 'IDENTITY MISMATCH',
    intent: 'OTP_REQUEST',
    channel: 'WebRTC-Gateway',
    status: 'INCIDENT_CREATED',
    incidentId: 'INC-2026-00141'
  },
  {
    id: 'EVT-90410',
    timestamp: '1m ago',
    severity: 'LOW',
    title: 'Legitimate routine call analyzed — voice verified',
    target: 'Legal Counsel (Thomas Vance)',
    claimedIdentity: 'CLO Sarah Jenkins',
    riskScore: 18,
    syntheticProbability: 0.04,
    speakerStatus: 'VERIFIED',
    intent: 'NORMAL_CONVERSATION',
    channel: 'SIP-Trunk-01',
    status: 'CLEARED',
    incidentId: null
  },
  {
    id: 'EVT-90409',
    timestamp: '3m ago',
    severity: 'MEDIUM',
    title: 'Acoustic anomaly detected in unauthenticated external trunk',
    target: 'Helpdesk Queue 03',
    claimedIdentity: 'Unverified External Caller',
    riskScore: 54,
    syntheticProbability: 0.48,
    speakerStatus: 'NOT AVAILABLE',
    intent: 'UNKNOWN',
    channel: 'VoIP-GW-04',
    status: 'ANALYZING',
    incidentId: null
  },
  {
    id: 'EVT-90408',
    timestamp: '5m ago',
    severity: 'LOW',
    title: 'Executive internal check-in cleared by biometrics',
    target: 'Chief of Staff',
    claimedIdentity: 'Arthur Sterling (CEO)',
    riskScore: 12,
    syntheticProbability: 0.02,
    speakerStatus: 'VERIFIED',
    intent: 'NORMAL_CONVERSATION',
    channel: 'Direct-VoIP',
    status: 'CLEARED',
    incidentId: null
  }
];

export const INITIAL_AUDIT_LOGS = [
  {
    id: 'AUD-8821',
    timestamp: '2026-09-05 14:51:10 UTC',
    actor: 'Sarah Chen',
    role: 'SOC Lead',
    action: 'ASSIGN_ANALYST',
    incidentId: 'INC-2026-00142',
    prevState: 'Unassigned',
    newState: 'Sarah Chen (SOC Lead)'
  },
  {
    id: 'AUD-8820',
    timestamp: '2026-09-05 14:50:10 UTC',
    actor: 'System / RiskEngine',
    role: 'AUTOMATION',
    action: 'CREATE_INCIDENT',
    incidentId: 'INC-2026-00142',
    prevState: 'TELEMETRY_STREAM',
    newState: 'INCIDENT_OPEN'
  },
  {
    id: 'AUD-8819',
    timestamp: '2026-09-05 13:15:00 UTC',
    actor: 'Marcus Vance',
    role: 'Analyst II',
    action: 'ACKNOWLEDGE_INCIDENT',
    incidentId: 'INC-2026-00141',
    prevState: 'OPEN',
    newState: 'UNDER_INVESTIGATION'
  },
  {
    id: 'AUD-8818',
    timestamp: '2026-09-05 11:45:22 UTC',
    actor: 'Alex Mercer',
    role: 'Analyst I',
    action: 'RESOLVE_INCIDENT',
    incidentId: 'INC-2026-00140',
    prevState: 'UNDER_INVESTIGATION',
    newState: 'RESOLVED (CONFIRMED_ATTACK)'
  },
  {
    id: 'AUD-8817',
    timestamp: '2026-09-05 09:50:11 UTC',
    actor: 'Sarah Chen',
    role: 'SOC Lead',
    action: 'RESOLVE_INCIDENT',
    incidentId: 'INC-2026-00139',
    prevState: 'UNDER_INVESTIGATION',
    newState: 'RESOLVED (FALSE_POSITIVE)'
  },
  {
    id: 'AUD-8816',
    timestamp: '2026-09-04 18:05:44 UTC',
    actor: 'Sarah Chen',
    role: 'SOC Lead',
    action: 'CONFIRM_ATTACK_AND_ESCALATE',
    incidentId: 'INC-2026-00138',
    prevState: 'UNDER_INVESTIGATION',
    newState: 'CONFIRMED_ATTACK (ESCALATED_CIRT)'
  }
];

export const INITIAL_REPORTS = [
  {
    id: 'REP-2026-W36',
    title: 'Weekly Executive Voice Impersonation Threat Report',
    type: 'Weekly Voice Security Report',
    generatedAt: '2026-09-05 00:00:00 UTC',
    author: 'VoiceShield Intelligence Engine',
    period: 'Aug 30, 2026 – Sep 05, 2026',
    summary: 'Analyzed 1,420 high-value executive calls across 18 protected identities. 3 confirmed AI clone attempts neutralized.',
    stats: { analyzed: 1420, critical: 4, high: 9, confirmedAttacks: 3, falsePositives: 2 },
    format: 'PDF / CSV'
  },
  {
    id: 'REP-2026-D248',
    title: 'Daily Security Operations Telemetry Summary',
    type: 'Daily Security Summary',
    generatedAt: '2026-09-05 06:00:00 UTC',
    author: 'SOC Automation Scheduler',
    period: 'Sep 04, 2026 – Sep 05, 2026',
    summary: 'Daily breakdown of PBX, WebRTC, and cellular ingress telemetry. 99.98% model uptime maintained.',
    stats: { analyzed: 215, critical: 1, high: 2, confirmedAttacks: 1, falsePositives: 0 },
    format: 'PDF / CSV'
  },
  {
    id: 'REP-2026-INC-00138',
    title: 'Forensic Investigation Dossier: INC-2026-00138 (CEO AI Clone)',
    type: 'Incident Report',
    generatedAt: '2026-09-04 19:30:00 UTC',
    author: 'Sarah Chen (SOC Lead)',
    period: 'Incident Investigation Record',
    summary: 'Full acoustic spectral evidence, ECAPA-TDNN feature comparison, and CIRT timeline.',
    stats: { analyzed: 1, critical: 1, high: 0, confirmedAttacks: 1, falsePositives: 0 },
    format: 'PDF / CSV'
  },
  {
    id: 'REP-2026-DEP-FIN',
    title: 'Department Risk Exposure Analysis: Corporate Finance & Treasury',
    type: 'Department Risk Report',
    generatedAt: '2026-09-01 12:00:00 UTC',
    author: 'Security Analytics Engine',
    period: 'August 2026 Retrospective',
    summary: 'Finance accounts for 68% of targeted voice cloning attempts, predominantly targeting wire transfer authorizations.',
    stats: { analyzed: 640, critical: 5, high: 14, confirmedAttacks: 4, falsePositives: 3 },
    format: 'PDF / CSV'
  }
];

// Helper functions for persistent state management via localStorage
const STORAGE_KEY_INCIDENTS = 'voiceshield_soc_incidents_v1';
const STORAGE_KEY_AUDIT = 'voiceshield_soc_audit_v1';

export function getStoredIncidents() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_INCIDENTS);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load incidents from localStorage', e);
  }
  return INITIAL_INCIDENTS;
}

export function saveStoredIncidents(incidents) {
  try {
    localStorage.setItem(STORAGE_KEY_INCIDENTS, JSON.stringify(incidents));
  } catch (e) {
    console.error('Failed to save incidents to localStorage', e);
  }
}

export function getStoredAuditLogs() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AUDIT);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load audit logs from localStorage', e);
  }
  return INITIAL_AUDIT_LOGS;
}

export function saveStoredAuditLogs(logs) {
  try {
    localStorage.setItem(STORAGE_KEY_AUDIT, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save audit logs to localStorage', e);
  }
}

export function addAuditEntry(action, incidentId, prevState, newState, actor = 'Sarah Chen (SOC Lead)', role = 'SOC Analyst') {
  const logs = getStoredAuditLogs();
  const newEntry = {
    id: `AUD-${Date.now().toString().slice(-4)}`,
    timestamp: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
    actor,
    role,
    action,
    incidentId,
    prevState,
    newState
  };
  const updated = [newEntry, ...logs];
  saveStoredAuditLogs(updated);
  return updated;
}
