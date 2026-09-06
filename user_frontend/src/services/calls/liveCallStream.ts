import type { CallEvent, CallSession, ScenarioId, CallerIdentity, SecurityStatus } from '../../types';
import { DEMO_SCENARIOS, buildScenarioEvents } from '../../mock-data/scenarios';
import { scoreToSeverity } from '../../utils/dataMapper';
import { config } from '../config';
import { WebSocketLiveCallStreamImpl } from './webSocketLiveCallStream';

// ─── Live Call Stream Interface ───────────────────────────────
// UI components depend only on this interface — never on the implementation.

export interface LiveCallStream {
  subscribe(handler: (event: CallEvent) => void): () => void;
  start(scenarioId: ScenarioId, callId: string): void;
  stop(): void;
  isActive(): boolean;
  setMicEnabled(enabled: boolean): void;
}

// ─── Mock Live Call Stream (demo fallback) ────────────────────
class MockLiveCallStreamImpl implements LiveCallStream {
  private handlers: Array<(event: CallEvent) => void> = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private active = false;

  setMicEnabled(_enabled: boolean): void {}

  subscribe(handler: (event: CallEvent) => void): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  start(scenarioId: ScenarioId, callId: string): void {
    this.stop();
    this.active = true;

    const scenario = DEMO_SCENARIOS[scenarioId];
    const steps = buildScenarioEvents(scenarioId);

    const startSession = buildInitialSession(callId, scenarioId, scenario.caller);
    this.emit({ type: 'call_started', timestamp: Date.now(), payload: startSession });

    this.scheduleWaveformPulses();

    let cumulativeDelay = 0;
    for (const step of steps) {
      cumulativeDelay += step.delayMs;
      const d = cumulativeDelay;
      const t = setTimeout(() => {
        if (!this.active) return;
        this.emit({ type: 'security_update', timestamp: Date.now(), payload: step.event });
      }, d);
      this.timers.push(t);
    }
  }

  stop(): void {
    this.active = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  isActive(): boolean { return this.active; }

  private scheduleWaveformPulses(): void {
    const pulse = () => {
      if (!this.active) return;
      this.emit({ type: 'waveform_update', timestamp: Date.now(), payload: { waveformActivity: 0.3 + Math.random() * 0.6 } });
      const t = setTimeout(pulse, 100 + Math.random() * 100);
      this.timers.push(t);
    };
    const t = setTimeout(pulse, 200);
    this.timers.push(t);
  }

  private emit(event: CallEvent): void { this.handlers.forEach(h => h(event)); }
}

// ─── Helper ───────────────────────────────────────────────────
function buildInitialSession(callId: string, scenarioId: ScenarioId, caller: CallerIdentity): Partial<CallSession> {
  const initialScore = scenarioId === 'human_impersonator' ? 70 : 18;
  const security: SecurityStatus = {
    score: initialScore,
    severity: scoreToSeverity(initialScore),
    message: scenarioId === 'human_impersonator'
      ? "We couldn't confirm this caller's identity."
      : 'Analyzing the call',
    signals: [],
    voiceAuthenticity: 'unknown',
    callerIdentity: caller.status,
    securityTeamNotified: false,
  };
  return { id: callId, source: 'browser', caller, startTime: new Date(), state: 'active', security, transcript: [], waveformActivity: 0.5, scenarioId };
}

// ─── Singleton Export ─────────────────────────────────────────
// config.useMockStream=true  →  demo/mock stream (VITE_USE_MOCK_STREAM=true)
// config.useMockStream=false →  real WebSocket backend (default)
export const liveCallStream: LiveCallStream = config.useMockStream
  ? new MockLiveCallStreamImpl()
  : new WebSocketLiveCallStreamImpl();