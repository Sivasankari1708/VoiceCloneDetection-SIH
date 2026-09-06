import type {
  SeverityLevel,
  ConversationSignal,
  SignalType,
  IdentityStatus,
  BackendRiskUpdate,
  SecurityStatus,
  TranscriptSegment,
} from '../types';

// ─── Severity Mapping ────────────────────────────────────────
/** Maps a raw risk score (0–100) to a SeverityLevel */
export function scoreToSeverity(score: number): SeverityLevel {
  if (score <= 25) return 'SAFE';
  if (score <= 45) return 'LOW';
  if (score <= 65) return 'MEDIUM';
  if (score <= 80) return 'HIGH';
  return 'CRITICAL';
}

/** Maps backend risk_level string directly to SeverityLevel */
export function mapRiskLevel(level: string): SeverityLevel {
  const map: Record<string, SeverityLevel> = {
    SAFE: 'SAFE', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL',
  };
  return map[level?.toUpperCase()] ?? 'SAFE';
}

/** Maps backend synthetic_probability to user-friendly voice authenticity */
export function mapVoiceAuthenticity(syntheticProbability: number): 'authentic' | 'altered' | 'unknown' {
  if (syntheticProbability < 0.4) return 'authentic';
  if (syntheticProbability >= 0.7) return 'altered';
  return 'unknown';
}

/** Maps voice authenticity to user-friendly label */
export function voiceAuthenticityLabel(authenticity: 'authentic' | 'altered' | 'unknown'): string {
  switch (authenticity) {
    case 'authentic': return 'Voice appears authentic';
    case 'altered': return 'Voice may be altered';
    case 'unknown': return 'Voice analysis in progress';
  }
}

/**
 * Maps backend identity_status string to frontend IdentityStatus.
 * Accepts both backend strings ("MATCHED") and numeric similarity (legacy).
 */
export function mapIdentityStatus(value: string | number): IdentityStatus {
  if (typeof value === 'number') {
    if (value >= 0.75) return 'verified';
    if (value >= 0.5) return 'unverified';
    return 'failed';
  }
  switch (value?.toUpperCase()) {
    case 'MATCHED': return 'verified';
    case 'MISMATCHED': return 'failed';
    case 'UNENROLLED': return 'unavailable';
    case 'INCONCLUSIVE': return 'checking';
    default: return 'checking';
  }
}

/** Maps identity status to user-friendly message */
export function identityStatusMessage(status: IdentityStatus): string {
  switch (status) {
    case 'verified': return 'Caller identity verified';
    case 'unverified': return 'Caller identity could not be confirmed';
    case 'failed': return 'Caller identity could not be verified';
    case 'unavailable': return 'Verification unavailable';
    case 'checking': return 'Verifying caller identity';
  }
}

// ─── Intent / Signal Mapping ─────────────────────────────────
const SIGNAL_MAP: Record<string, { type: SignalType; label: string; severity: SeverityLevel }> = {
  // Backend intent strings (uppercase)
  PAYMENT_TRANSFER: { type: 'payment_request', label: 'Payment request', severity: 'HIGH' },
  OTP_REQUEST: { type: 'otp_request', label: 'OTP / code request', severity: 'CRITICAL' },
  CREDENTIAL_REQUEST: { type: 'credential_request', label: 'Credential request', severity: 'CRITICAL' },
  URGENT_REQUEST: { type: 'urgent_request', label: 'Urgent request', severity: 'MEDIUM' },
  AUTHORITY_CLAIM: { type: 'authority_claim', label: 'Authority claim', severity: 'LOW' },
  SENSITIVE_INFO_REQUEST: { type: 'sensitive_info_request', label: 'Sensitive info request', severity: 'HIGH' },
  THREAT: { type: 'threat', label: 'Threat / Coercion', severity: 'CRITICAL' },
  NORMAL_CONVERSATION: { type: 'normal', label: 'Normal conversation', severity: 'SAFE' },
  // Legacy lowercase keys (mock data)
  payment_request: { type: 'payment_request', label: 'Payment request', severity: 'HIGH' },
  otp_request: { type: 'otp_request', label: 'OTP / code request', severity: 'CRITICAL' },
  urgent_request: { type: 'urgent_request', label: 'Urgent request', severity: 'MEDIUM' },
  authority_claim: { type: 'authority_claim', label: 'Authority claim', severity: 'LOW' },
  sensitive_info_request: { type: 'sensitive_info_request', label: 'Sensitive information requested', severity: 'HIGH' },
  credential_request: { type: 'credential_request', label: 'Credential request', severity: 'CRITICAL' },
  threat: { type: 'threat', label: 'Threat / Coercion', severity: 'CRITICAL' },
  normal: { type: 'normal', label: 'Normal conversation', severity: 'SAFE' },
};

/** Maps backend intent string to a ConversationSignal */
export function mapIntent(intent: string): ConversationSignal {
  const mapped = SIGNAL_MAP[intent] ?? SIGNAL_MAP[intent?.toUpperCase()];
  if (mapped) return mapped;
  return { type: 'normal', label: intent, severity: 'SAFE' };
}

/** Maps backend context_signals[] to ConversationSignal[] */
export function mapContextSignals(signals: string[]): ConversationSignal[] {
  return signals
    .map(s => SIGNAL_MAP[s] ?? SIGNAL_MAP[s?.toUpperCase()])
    .filter((s): s is ConversationSignal => s !== undefined);
}

/** Maps backend recommended_action to a human-friendly string */
export function mapRecommendedAction(action: string): string {
  switch (action?.toUpperCase()) {
    case 'ALLOW': return '';
    case 'MONITOR': return 'Stay alert';
    case 'VERIFY_SPEAKER': return 'Verify the caller before continuing';
    case 'BLOCK_OR_ESCALATE': return 'Do not share sensitive information';
    default: return '';
  }
}

/** Maps backend verdict to user-friendly voice authenticity */
export function mapVerdict(verdict: string): 'authentic' | 'altered' | 'unknown' {
  switch (verdict?.toLowerCase()) {
    case 'genuine': return 'authentic';
    case 'cloned':
    case 'imposter': return 'altered';
    default: return 'unknown';
  }
}

// ─── Primary Backend Mapper ──────────────────────────────────
/**
 * Maps a BackendRiskUpdate payload to a partial CallSession shape
 * for the frontend via UPDATE_ACTIVE_CALL dispatch.
 */
export function mapBackendRiskUpdate(
  update: BackendRiskUpdate,
  callStartTime: Date,
  existingTranscript: TranscriptSegment[]
): { security: Partial<SecurityStatus>; transcriptSegment: TranscriptSegment | null } {
  const severity = mapRiskLevel(update.risk_level);
  const identityStatus = mapIdentityStatus(update.identity_status);
  const voiceAuthenticity = mapVerdict(update.verdict);
  const recommendation = mapRecommendedAction(update.recommended_action);

  // Build signals: primary intent + context signals (deduplicated)
  const signals: ConversationSignal[] = [];
  if (update.intent && update.intent !== 'NORMAL_CONVERSATION') {
    signals.push(mapIntent(update.intent));
  }
  mapContextSignals(update.context_signals ?? []).forEach(s => {
    if (!signals.find(ex => ex.type === s.type)) signals.push(s);
  });

  const security: Partial<SecurityStatus> = {
    score: update.risk_score,
    severity,
    voiceAuthenticity,
    callerIdentity: identityStatus,
    signals,
    recommendation,
    message: scoreToSecurityMessage(update.risk_score),
    securityTeamNotified: update.is_alert,
    syntheticProbability: update.synthetic_probability ?? update.smoothed_synthetic_probability,
    speakerSimilarity: update.speaker_similarity ?? update.smoothed_speaker_similarity,
    speakerMatch: update.speaker_match,
    intent: update.intent || (signals[0]?.label ?? 'NORMAL_CONVERSATION'),
    identityStatusText: update.identity_status,
    action: update.recommended_action || (severity === 'CRITICAL' ? 'BLOCK / VERIFY' : severity === 'HIGH' ? 'VERIFY' : 'MONITOR'),
  };

  // Append transcript when there is actual new text
  let transcriptSegment: TranscriptSegment | null = null;
  const chunkText = update.transcript?.trim();
  if (chunkText) {
    const lastSeg = existingTranscript[existingTranscript.length - 1];
    const isExactRepeatOfLast = lastSeg && lastSeg.text.trim() === chunkText && (Date.now() - callStartTime.getTime() - lastSeg.timestamp < 1200);
    const idExists = existingTranscript.some(t => t.id === `seg-${update.chunk_id}`);
    if (!isExactRepeatOfLast && !idExists) {
      transcriptSegment = {
        id: `seg-${update.chunk_id}-${Date.now()}`,
        speaker: 'caller',
        text: chunkText,
        timestamp: Math.max(0, Date.now() - callStartTime.getTime()),
        isPartial: false,
      };
    }
  }

  return { security, transcriptSegment };
}

// ─── Severity Human Labels ───────────────────────────────────
export function severityDescription(level: SeverityLevel): string {
  switch (level) {
    case 'SAFE': return 'Normal communication.';
    case 'LOW': return 'Minor concern detected.';
    case 'MEDIUM': return 'Something unusual requires attention.';
    case 'HIGH': return 'Suspicious communication. Verification recommended.';
    case 'CRITICAL': return 'Potential impersonation or fraud. Immediate action required.';
  }
}

export function severityActionMessage(level: SeverityLevel): string {
  switch (level) {
    case 'SAFE': return 'Your call is proceeding normally.';
    case 'LOW': return 'Stay alert. No action required yet.';
    case 'MEDIUM': return 'Be cautious. Avoid sharing sensitive information.';
    case 'HIGH': return 'We recommend verifying this caller before proceeding.';
    case 'CRITICAL': return 'Do not share OTPs, passwords, or financial information.';
  }
}

// ─── Score Message ────────────────────────────────────────────
export function scoreToSecurityMessage(score: number): string {
  if (score <= 25) return 'This call appears to be safe.';
  if (score <= 45) return 'A minor concern has been detected.';
  if (score <= 65) return 'Unusual activity has been detected in this call.';
  if (score <= 80) return 'This call requires your attention. Consider verifying the caller.';
  return 'This call may not be from the person it claims to be.';
}

// ─── Duration ─────────────────────────────────────────────────
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatCallDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}