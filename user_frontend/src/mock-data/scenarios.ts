import type {
  ScenarioId,
  DemoScenario,
  CallEvent,
  TranscriptSegment,
  ConversationSignal,
} from '../types';
import { scoreToSeverity, scoreToSecurityMessage } from '../utils/dataMapper';

// ─── Scenario Definitions ─────────────────────────────────────
export const DEMO_SCENARIOS: Record<ScenarioId, DemoScenario> = {
  genuine_executive: {
    id: 'genuine_executive',
    name: 'Genuine Executive',
    description: 'A verified call from the CFO. Safe throughout.',
    initialSeverity: 'SAFE',
    caller: {
      name: 'Rajesh Kumar',
      claimedRole: 'CFO',
      organization: 'TechCorp India',
      status: 'verified',
      statusMessage: 'Caller identity verified',
    },
  },
  ai_cloned_cfo: {
    id: 'ai_cloned_cfo',
    name: 'AI-Cloned CFO',
    description: 'Voice cloning attack — escalates SAFE → CRITICAL',
    initialSeverity: 'SAFE',
    caller: {
      name: 'Rajesh Kumar',
      claimedRole: 'CFO',
      organization: 'TechCorp India',
      status: 'checking',
      statusMessage: 'Verifying caller identity…',
    },
  },
  human_impersonator: {
    id: 'human_impersonator',
    name: 'Human Impersonator',
    description: 'A human claiming to be the CFO — identity fails.',
    initialSeverity: 'HIGH',
    caller: {
      name: 'Rajesh Kumar',
      claimedRole: 'CFO',
      organization: 'TechCorp India',
      status: 'failed',
      statusMessage: 'Caller identity could not be verified',
    },
  },
  fake_government_official: {
    id: 'fake_government_official',
    name: 'Fake Government Official',
    description: 'Impersonation of enforcement/tax agency with threats & urgent penalty demands.',
    initialSeverity: 'HIGH',
    caller: {
      name: 'Inspector Vikram Malhotra',
      claimedRole: 'Cybercrime / Tax Enforcement',
      organization: 'Regulatory Oversight Directorate',
      status: 'failed',
      statusMessage: 'Caller identity could not be verified',
    },
  },
  normal_conversation: {
    id: 'normal_conversation',
    name: 'Normal Conversation',
    description: 'A routine safe call.',
    initialSeverity: 'SAFE',
    caller: {
      name: 'Anita Sharma',
      claimedRole: 'HR Manager',
      organization: 'TechCorp India',
      status: 'verified',
      statusMessage: 'Caller identity verified',
    },
  },
};

// ─── Scenario Event Sequences ─────────────────────────────────

interface ScenarioStep {
  delayMs: number; // ms from previous step
  score: number;
  transcript?: Pick<TranscriptSegment, 'speaker' | 'text'>;
  signals?: ConversationSignal[];
  identityStatus?: 'verified' | 'unverified' | 'failed' | 'unavailable' | 'checking';
  waveformActivity?: number;
}

export const SCENARIO_STEPS: Record<ScenarioId, ScenarioStep[]> = {
  genuine_executive: [
    { delayMs: 300, score: 15, waveformActivity: 0.4, identityStatus: 'checking' },
    { delayMs: 1200, score: 14, transcript: { speaker: 'caller', text: "Hi, I wanted to discuss tomorrow's review meeting." }, waveformActivity: 0.7, identityStatus: 'verified' },
    { delayMs: 3000, score: 12, transcript: { speaker: 'caller', text: 'Can we go through the agenda items together on the shared deck?' }, waveformActivity: 0.6 },
    { delayMs: 3200, score: 10, transcript: { speaker: 'caller', text: "Great, everything looks in order. I'll see you at 10 AM then." }, waveformActivity: 0.5 },
  ],

  ai_cloned_cfo: [
    { delayMs: 300, score: 20, waveformActivity: 0.5, identityStatus: 'checking' },
    { delayMs: 1400, score: 32, transcript: { speaker: 'caller', text: 'Hi, I need your urgent assistance with something confidential.' }, waveformActivity: 0.7, signals: [{ type: 'authority_claim', label: 'Authority claim', severity: 'LOW' }] },
    { delayMs: 2800, score: 58, transcript: { speaker: 'caller', text: "I'm between executive board meetings right now. I need an urgent wire payment processed." }, waveformActivity: 0.8, signals: [{ type: 'urgent_request', label: 'Urgent request', severity: 'MEDIUM' }, { type: 'payment_request', label: 'Payment request', severity: 'HIGH' }] },
    { delayMs: 3200, score: 76, transcript: { speaker: 'caller', text: 'This wire transfer was approved by the board today. Please authorize it immediately.' }, waveformActivity: 0.85, identityStatus: 'failed' },
    { delayMs: 3200, score: 92, transcript: { speaker: 'caller', text: 'Please send me the 6-digit authorization OTP right away so we can complete it.' }, waveformActivity: 0.95, signals: [{ type: 'otp_request', label: 'OTP / code request', severity: 'CRITICAL' }] },
  ],

  human_impersonator: [
    { delayMs: 300, score: 68, waveformActivity: 0.5, identityStatus: 'checking' },
    { delayMs: 1400, score: 74, transcript: { speaker: 'caller', text: 'Hello, this is Rajesh. I need to speak with you urgently.' }, waveformActivity: 0.7, identityStatus: 'failed', signals: [{ type: 'authority_claim', label: 'Authority claim', severity: 'LOW' }] },
    { delayMs: 3000, score: 82, transcript: { speaker: 'caller', text: "I'm calling about the emergency settlement transfer that must clear today." }, waveformActivity: 0.8, signals: [{ type: 'payment_request', label: 'Payment request', severity: 'HIGH' }] },
    { delayMs: 3200, score: 90, transcript: { speaker: 'caller', text: 'Please bypass the standard approval queue and push this through immediately.' }, waveformActivity: 0.9, signals: [{ type: 'urgent_request', label: 'Urgent demand', severity: 'CRITICAL' }] },
  ],

  fake_government_official: [
    { delayMs: 300, score: 65, waveformActivity: 0.5, identityStatus: 'checking' },
    { delayMs: 1400, score: 72, transcript: { speaker: 'caller', text: 'This is Inspector Vikram from the Central Regulatory Enforcement Bureau.' }, waveformActivity: 0.75, identityStatus: 'failed', signals: [{ type: 'authority_claim', label: 'Authority claim', severity: 'LOW' }] },
    { delayMs: 3200, score: 81, transcript: { speaker: 'caller', text: 'A non-compliance tax case and financial fraud notice has been registered against your account.' }, waveformActivity: 0.85, signals: [{ type: 'threat', label: 'Enforcement threat', severity: 'HIGH' }, { type: 'urgent_request', label: 'Urgent demand', severity: 'HIGH' }] },
    { delayMs: 3400, score: 89, transcript: { speaker: 'caller', text: 'Unless a provisional security penalty is settled within 30 minutes, all linked accounts will be frozen.' }, waveformActivity: 0.9, signals: [{ type: 'threat', label: 'Account freeze threat', severity: 'CRITICAL' }, { type: 'payment_request', label: 'Immediate penalty demand', severity: 'CRITICAL' }] },
    { delayMs: 3400, score: 96, transcript: { speaker: 'caller', text: 'Transfer the penalty amount immediately to our escrow clearance details to avoid arrest.' }, waveformActivity: 0.95, signals: [{ type: 'threat', label: 'Legal action threat', severity: 'CRITICAL' }] },
  ],

  normal_conversation: [
    { delayMs: 300, score: 15, waveformActivity: 0.4, identityStatus: 'checking' },
    { delayMs: 1200, score: 14, transcript: { speaker: 'caller', text: 'Hi! Just calling to check in about lunch today. Are we still meeting at 1 PM?' }, waveformActivity: 0.7, identityStatus: 'verified' },
    { delayMs: 2800, score: 12, transcript: { speaker: 'caller', text: 'The cafe around the corner has a new menu we could try.' }, waveformActivity: 0.6 },
    { delayMs: 2800, score: 10, transcript: { speaker: 'caller', text: "Sounds great, see you there at 1!" }, waveformActivity: 0.5 },
  ],
};

// ─── Step Player ─────────────────────────────────────────────
export function buildScenarioEvents(scenarioId: ScenarioId): Array<{ delayMs: number; event: Partial<CallEvent['payload']> }> {
  const steps = SCENARIO_STEPS[scenarioId];
  const scenario = DEMO_SCENARIOS[scenarioId];
  let accumulatedSignals: ConversationSignal[] = [];
  let accumulatedTranscript: TranscriptSegment[] = [];

  return steps.map((step, i) => {
    if (step.signals) {
      accumulatedSignals = [...accumulatedSignals, ...step.signals.filter(s => !accumulatedSignals.find(a => a.type === s.type))];
    }
    if (step.transcript) {
      accumulatedTranscript = [...accumulatedTranscript, {
        id: `seg-${i}`,
        speaker: step.transcript.speaker,
        text: step.transcript.text,
        timestamp: i * 3000,
      }];
    }

    const severity = scoreToSeverity(step.score);
    const identityStatus = step.identityStatus ?? scenario.caller.status;

    const syntheticProbability =
      scenarioId === 'ai_cloned_cfo'
        ? Math.min(0.96, Math.max(0.25, step.score / 100))
        : scenarioId === 'fake_government_official'
        ? 0.88
        : scenarioId === 'human_impersonator'
        ? 0.12
        : 0.05;

    const speakerSimilarity =
      scenarioId === 'genuine_executive'
        ? 0.94
        : scenarioId === 'ai_cloned_cfo'
        ? 0.87
        : scenarioId === 'human_impersonator'
        ? 0.22
        : 0.18;

    const action =
      severity === 'CRITICAL'
        ? 'BLOCK / VERIFY'
        : severity === 'HIGH'
        ? 'STEP-UP AUTH / VERIFY'
        : severity === 'MEDIUM'
        ? 'MONITOR / CAUTION'
        : 'ALLOW / PASS';

    const intent = accumulatedSignals[accumulatedSignals.length - 1]?.label || 'Normal Conversation';

    return {
      delayMs: step.delayMs,
      event: {
        security: {
          score: step.score,
          severity,
          message: scoreToSecurityMessage(step.score),
          signals: [...accumulatedSignals],
          voiceAuthenticity: step.score > 70 ? 'altered' : step.score > 40 ? 'unknown' : 'authentic',
          callerIdentity: identityStatus as any,
          securityTeamNotified: step.score >= 81,
          syntheticProbability,
          speakerSimilarity,
          speakerMatch: identityStatus === 'verified',
          intent,
          action,
          identityStatusText: identityStatus === 'verified' ? 'MATCHED' : identityStatus === 'failed' ? 'MISMATCHED' : 'CHECKING',
        },
        caller: {
          ...scenario.caller,
          status: identityStatus as any,
          statusMessage:
            identityStatus === 'verified'
              ? 'Caller identity verified'
              : identityStatus === 'failed'
              ? 'Caller identity could not be verified'
              : identityStatus === 'checking'
              ? 'Verifying caller identity…'
              : 'Caller identity could not be confirmed',
        },
        transcript: [...accumulatedTranscript],
        waveformActivity: step.waveformActivity ?? 0.5,
      },
    };
  });
}
