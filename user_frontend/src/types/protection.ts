/**
 * VoiceShield Enterprise Protection Types
 * Plain-language, trustworthy cybersecurity state models with no raw ML diagnostics.
 */

// ─── Progressive Risk System (Requirement #5) ────────────────────────────────
export type ProgressiveRiskLevel = 'Safe' | 'Low' | 'Caution' | 'High' | 'Critical';

export interface ProgressiveRiskInfo {
  level: ProgressiveRiskLevel;
  headline: string;
  detected: string;
  whyItMatters: string;
  recommendedAction: string;
}

// ─── Verification Panel (Requirement #6 & #9) ────────────────────────────────
export type VerificationState =
  | 'Verified'
  | 'Verification Degraded'
  | 'Identity Cannot Be Verified'
  | 'Suspicious';

export type DegradedFactor =
  | 'Background noise'
  | 'Audio quality'
  | 'Unusual speaking conditions'
  | 'Stress/fatigue indicators'
  | 'Speaking pattern variation';

export interface VerificationInfo {
  state: VerificationState;
  headline: string;
  description: string;
  degradedFactors?: DegradedFactor[];
  independentVerificationRecommended: boolean;
}

// ─── Active Liveness Verification (Requirement #7) ───────────────────────────
export type LivenessStep = 'idle' | 'challenge' | 'listening' | 'analysing' | 'result';
export type LivenessOutcome = 'Liveness Passed' | 'Liveness Inconclusive' | 'Liveness Failed';

export interface ActiveLivenessState {
  step: LivenessStep;
  challengePhrase: string;
  outcome?: LivenessOutcome;
  timestamp?: string;
}

// ─── Replay Attack Detection (Requirement #8) ────────────────────────────────
export type ReplayState = 'No replay indication' | 'Replay suspected' | 'Analysis inconclusive';

export interface ReplayProtectionInfo {
  state: ReplayState;
  description: string;
}

// ─── Sensitive Request Detection (Requirement #10) ───────────────────────────
export type SensitiveCategory =
  | 'OTP'
  | 'Payment'
  | 'Banking credentials'
  | 'Password'
  | 'PIN'
  | 'KYC information'
  | 'Other sensitive credentials';

export interface SensitiveRequestSignal {
  category: SensitiveCategory;
  detectedTextSnippet: string;
  timestamp: string;
}

// ─── Critical Intervention Flow (Requirement #11) ────────────────────────────
export type InterventionStep =
  | 'idle'
  | 'critical_detected'
  | 'call_held'
  | 'security_announcement'
  | 'countdown'
  | 'terminated'
  | 'incident_created';

export interface CriticalInterventionState {
  active: boolean;
  step: InterventionStep;
  countdownValue: number; // 3 -> 2 -> 1
  announcementLanguage: string;
  announcementRegion: string;
  announcementPlayed: boolean;
  incidentRef?: string;
  simulated: true;
  reason?: 'CREDENTIAL_EXPOSURE' | 'CRITICAL';
}

// ─── Multilingual Warning (Requirement #12) ──────────────────────────────────
export interface MultilingualOption {
  language: string;
  region: string;
  label: string;
  scriptText: string;
  code?: string;
}

// ─── Device & Network Context (Requirement #14) ──────────────────────────────
export interface DeviceNetworkContext {
  device: 'Registered Enterprise Device' | 'Unregistered Device' | 'Unknown';
  network: 'Corporate VPN' | 'Commercial Cellular' | 'VoIP Gateway' | 'Available';
  callQuality: 'Optimal' | 'Degraded' | 'High Jitter';
  locationContext: 'Bangalore, IN' | 'Mumbai, IN' | 'Chennai, IN' | 'Available Context';
}

// ─── SOC Event Timeline & Evidence (Requirements #18 - #24) ──────────────────
export interface SocTimelineEvent {
  id: string;
  time: string;
  title: string;
  detail: string;
  badge?: string;
  type: 'info' | 'warning' | 'critical' | 'action';
}

export interface SocInterventionEvidence {
  conversationSignal: string;
  verificationState: VerificationState;
  replayProtection: ReplayState;
  livenessResult: string;
  callCondition: string;
  employeeAction: string;
}

export type SocIncidentStatus = 'Open' | 'Investigating' | 'Resolved';

export interface SocIncident {
  id: string;
  timestamp: string;
  employee: string;
  employeeRole: string;
  claimedCaller: string;
  claimedDepartment: string;
  requestType: SensitiveCategory | string;
  protectionAction: string;
  status: SocIncidentStatus;
  evidence: SocInterventionEvidence;
  timeline: SocTimelineEvent[];
  warningLanguage: string;
  warningRegion: string;
  escalatedToCybercrimePortal: boolean;
  cybercrimeEscalationRef?: string;
  auditChain: string[];
}
