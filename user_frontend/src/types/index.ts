// ============================================================
// VoiceShield — Core TypeScript Types
// ============================================================

// ─── Severity ───────────────────────────────────────────────
export type SeverityLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SeverityInfo {
  level: SeverityLevel;
  score: number;
  label: string;
  description: string;
}

// ─── Communication Sources ──────────────────────────────────
export type CommunicationSource = 'browser' | 'phone' | 'voip' | 'teams' | 'zoom';

export interface CommunicationSourceConfig {
  id: CommunicationSource;
  name: string;
  description: string;
  available: boolean;
  comingSoon: boolean;
}

// ─── User / Auth ────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  organization: string;
  role: string;
  avatarInitials: string;
  accountStatus: 'active' | 'suspended' | 'pending';
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

// ─── Caller Identity ────────────────────────────────────────
export type IdentityStatus =
  | 'verified'
  | 'unverified'
  | 'failed'
  | 'unavailable'
  | 'checking';

export interface CallerIdentity {
  name: string;
  claimedRole: string;
  organization: string;
  status: IdentityStatus;
  /** User-friendly message — no technical metrics */
  statusMessage: string;
}

// ─── Conversation Signals ───────────────────────────────────
export type SignalType =
  | 'payment_request'
  | 'otp_request'
  | 'urgent_request'
  | 'authority_claim'
  | 'sensitive_info_request'
  | 'credential_request'
  | 'threat'
  | 'normal';

export interface ConversationSignal {
  type: SignalType;
  /** Human-friendly label */
  label: string;
  severity: SeverityLevel;
}

// ─── Transcript ─────────────────────────────────────────────
export interface TranscriptSegment {
  id: string;
  speaker: 'caller' | 'employee';
  text: string;
  timestamp: number; // ms from call start
  isPartial?: boolean;
}

// ─── Security Status ────────────────────────────────────────
export interface SecurityStatus {
  score: number;
  severity: SeverityLevel;
  /** Primary human-friendly message */
  message: string;
  /** Secondary context message */
  details?: string;
  /** Recommended employee action */
  recommendation?: string;
  signals: ConversationSignal[];
  voiceAuthenticity: 'authentic' | 'altered' | 'unknown';
  callerIdentity: IdentityStatus;
  securityTeamNotified: boolean;
  syntheticProbability?: number;
  speakerSimilarity?: number;
  speakerMatch?: boolean;
  intent?: string;
  identityStatusText?: string;
  action?: string;
}

// ─── Call Session (live) ────────────────────────────────────
export type CallState = 'initializing' | 'active' | 'ended' | 'error';

export interface CallSession {
  id: string;
  source: CommunicationSource;
  caller: CallerIdentity;
  startTime: Date;
  endTime?: Date;
  state: CallState;
  security: SecurityStatus;
  transcript: TranscriptSegment[];
  waveformActivity: number; // 0–1
  scenarioId: string;
}

// ─── Call Events (from stream) ──────────────────────────────
export type CallEventType =
  | 'call_started'
  | 'call_ended'
  | 'transcript_update'
  | 'security_update'
  | 'identity_update'
  | 'signal_detected'
  | 'alert_triggered'
  | 'waveform_update'
  | 'verification_requested';

export interface CallEvent {
  type: CallEventType;
  timestamp: number;
  payload: Partial<CallSession>;
}

// ─── Security Alert ─────────────────────────────────────────
export interface SecurityAlert {
  id: string;
  callId: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  reasons: string[];
  recommendation: string;
  actions: AlertAction[];
  incidentRef?: string; // demo: simulated
  securityTeamNotified: boolean;
  createdAt: Date;
}

export interface AlertAction {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'danger';
  route?: string;
  action?: string;
}

// ─── Verification ────────────────────────────────────────────
export type VerificationMethod = 'trusted_call' | 'verification_request' | 'mfa';
export type VerificationState = 'idle' | 'in_progress' | 'success' | 'failed';

export interface VerificationResult {
  success: boolean;
  method: VerificationMethod;
  message: string;
  /** Security score after verification */
  updatedScore?: number;
  updatedSeverity?: SeverityLevel;
  timestamp: Date;
}

// ─── Call History ────────────────────────────────────────────
export interface CallTimelineEvent {
  time: string;
  description: string;
  type: 'info' | 'warning' | 'critical' | 'success';
}

export interface CallHistoryItem {
  id: string;
  caller: CallerIdentity;
  source: CommunicationSource;
  startTime: Date;
  endTime: Date;
  duration: number; // seconds
  finalSeverity: SeverityLevel;
  finalScore: number;
  finalAction: string;
  scenarioId?: string;
  transcript: TranscriptSegment[];
  timeline: CallTimelineEvent[];
  summary: string;
  recommendation: string;
  signals: ConversationSignal[];
}

// ─── Notifications ───────────────────────────────────────────
export type NotificationType =
  | 'security_alert'
  | 'verification_complete'
  | 'security_reminder'
  | 'call_summary'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  callId?: string;
  actionLabel?: string;
  actionRoute?: string;
}

// ─── Security Settings ───────────────────────────────────────
export interface SecuritySettings {
  callProtectionEnabled: boolean;
  showSecurityWarnings: boolean;
  suggestVerification: boolean;
  notifyOnAlerts: boolean;
  notifyOnVerification: boolean;
  notifyOnCallProtection: boolean;
  trustedVerificationMethods: VerificationMethod[];
  mfaEnabled: boolean;
}

// ─── Demo Scenarios ──────────────────────────────────────────
export type ScenarioId =
  | 'genuine_executive'
  | 'ai_cloned_cfo'
  | 'human_impersonator'
  | 'fake_government_official'
  | 'normal_conversation';

export interface DemoScenario {
  id: ScenarioId;
  name: string;
  description: string;
  initialSeverity: SeverityLevel;
  caller: CallerIdentity;
}

// ─── Backend WebSocket Event Payloads ───────────────────────────────────────

/** RiskUpdatePayload — emitted by the backend on each audio chunk */
export interface BackendRiskUpdate {
  session_id: string;
  chunk_id: number;
  timestamp: string;
  speech_detected: boolean;
  risk_score: number;              // 0–100
  risk_level: string;              // "SAFE"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"
  synthetic_probability?: number;
  smoothed_synthetic_probability?: number;
  speaker_similarity?: number;
  smoothed_speaker_similarity?: number;
  identity_status: string;         // "MATCHED"|"MISMATCHED"|"UNENROLLED"|"INCONCLUSIVE"
  speaker_match?: boolean;
  transcript: string;              // this chunk only
  accumulated_transcript: string;
  intent: string;                  // "PAYMENT_TRANSFER"|"OTP_REQUEST"|"CREDENTIAL_REQUEST"|"URGENT_REQUEST"|"NORMAL_CONVERSATION"
  intent_confidence: number;
  context_signals: string[];
  verdict: string;                 // "genuine"|"cloned"|"imposter"|"inconclusive"
  reasons: string[];
  recommended_action: string;      // "ALLOW"|"MONITOR"|"VERIFY_SPEAKER"|"BLOCK_OR_ESCALATE"
  is_alert: boolean;
  alert_reason?: string;
  latency_ms: number;
  real_time_factor: number;
}

/** UserSecurityAlertPayload — emitted when is_alert = true */
export interface BackendUserSecurityAlert {
  session_id: string;
  severity: string;
  risk_score: number;
  warning_message: string;
  claimed_identity?: string;
  reasons: string[];
  recommended_action: string;
  timestamp: string;
}
