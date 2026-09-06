import type {
  CallEvent,
  CallSession,
  ScenarioId,
  CallerIdentity,
  SecurityStatus,
  TranscriptSegment,
  BackendRiskUpdate,
  BackendUserSecurityAlert,
} from '../../types';
import type { LiveCallStream } from './liveCallStream';
import { config } from '../config';
import { authService } from '../auth/authService';
import { DEMO_SCENARIOS, buildScenarioEvents } from '../../mock-data/scenarios';
import { mapBackendRiskUpdate, mapRiskLevel, scoreToSeverity } from '../../utils/dataMapper';
import { downsampleTo16kHz, float32ToInt16PCM, encodeWAV } from '../../utils/audioUtils';
import { speakCallerText, stopCallerSpeech } from '../../utils/speechSynthesis';

interface StartCallResponse {
  session_id: string;
  [key: string]: unknown;
}

export interface StreamDiagnostics {
  micStatus: 'connected' | 'requesting' | 'denied' | 'error';
  audioContextState: 'running' | 'suspended' | 'closed' | 'none';
  audioContextSampleRate: number;
  activityLevel: number;
  rms: number;
  audioProcessCallbacks: number;
  pcmFramesSent: number;
  pcmNonZeroPercent: number;
  totalBytesSent: number;
  wsStatus: 'connected' | 'connecting' | 'closed' | 'error';
  backendResultsCount: number;
  lastEvent: string;
  lastTranscript: string;
  lastVerdict: string;
  lastRiskScore: number;
  lastRiskLevel: string;
  lastSpeechDetected: boolean | null;
  lastUpdateTime: number;
}

export class WebSocketLiveCallStreamImpl implements LiveCallStream {
  private handlers: Array<(event: CallEvent) => void> = [];
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private active = false;
  private callStartTime: Date = new Date();
  private transcriptCache: TranscriptSegment[] = [];
  private micMuted = false;
  private lastWaveformEmitTime = 0;
  private scenarioTimers: ReturnType<typeof setTimeout>[] = [];
  private lastScenarioScore = 0;
  private currentCallId: string | null = null;

  // Web Audio Graph & Buffering
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private rawSampleBuffer: number[] = [];
  private animFrameId: number | null = null;
  private lastRMSLogTime = 0;
  private lastCallbackLogTime = 0;

  // Diagnostics Telemetry State
  private diagnostics: StreamDiagnostics = {
    micStatus: 'requesting',
    audioContextState: 'none',
    audioContextSampleRate: 0,
    activityLevel: 0.05,
    rms: 0.0,
    audioProcessCallbacks: 0,
    pcmFramesSent: 0,
    pcmNonZeroPercent: 0,
    totalBytesSent: 0,
    wsStatus: 'connecting',
    backendResultsCount: 0,
    lastEvent: 'NONE',
    lastTranscript: '',
    lastVerdict: 'inconclusive',
    lastRiskScore: 0,
    lastRiskLevel: 'ANALYZING',
    lastSpeechDetected: null,
    lastUpdateTime: Date.now(),
  };

  subscribe(handler: (event: CallEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  getDiagnostics(): StreamDiagnostics {
    return { ...this.diagnostics };
  }

  setMicEnabled(enabled: boolean): void {
    this.micMuted = !enabled;
    this.diagnostics.micStatus = enabled ? 'connected' : 'requesting';
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
    }
  }

  async start(scenarioId: ScenarioId = 'genuine_executive', callId: string = `call-${Date.now()}`): Promise<void> {
    this.stop();
    this.active = true;
    this.micMuted = false;
    this.callStartTime = new Date();
    this.transcriptCache = [];
    this.rawSampleBuffer = [];
    this.currentCallId = callId;

    this.diagnostics = {
      micStatus: 'requesting',
      audioContextState: 'none',
      audioContextSampleRate: 0,
      activityLevel: 0.05,
      rms: 0.0,
      audioProcessCallbacks: 0,
      pcmFramesSent: 0,
      pcmNonZeroPercent: 0,
      totalBytesSent: 0,
      wsStatus: 'connecting',
      backendResultsCount: 0,
      lastEvent: 'CALL_STARTING',
      lastTranscript: '',
      lastVerdict: 'inconclusive',
      lastRiskScore: 0,
      lastRiskLevel: 'ANALYZING',
      lastSpeechDetected: null,
      lastUpdateTime: Date.now(),
    };

    // 1. Initial Call Session
    const initialSession = buildInitialSession(callId, scenarioId);
    this.emit({
      type: 'call_started',
      timestamp: Date.now(),
      payload: initialSession,
    });

    // Clear previous scenario simulation timers
    this.scenarioTimers.forEach(clearTimeout);
    this.scenarioTimers = [];
    this.lastScenarioScore = initialSession.security.score;

    // Schedule realistic scenario simulation progression
    const steps = buildScenarioEvents(scenarioId);
    let cumulativeDelay = 200;
    for (const step of steps) {
      cumulativeDelay += step.delayMs;
      const t = setTimeout(() => {
        if (!this.active) return;
        const p = step.event;
        if (p.security?.score !== undefined) {
          this.lastScenarioScore = p.security.score;
          this.reportScenarioRiskToBackend(scenarioId, p);
        }
        if (p.transcript) {
          this.transcriptCache = [...p.transcript];
          const latestSeg = p.transcript[p.transcript.length - 1];
          if (latestSeg && latestSeg.speaker === 'caller') {
            speakCallerText(latestSeg.text, scenarioId, {
              onStart: () => {
                if (!this.active) return;
                this.emit({
                  type: 'waveform_update',
                  timestamp: Date.now(),
                  payload: { waveformActivity: 0.8 },
                });
              },
              onEnd: () => {
                if (!this.active) return;
                this.emit({
                  type: 'waveform_update',
                  timestamp: Date.now(),
                  payload: { waveformActivity: 0.08 },
                });
              },
            });
          }
        }
        this.emit({
          type: 'security_update',
          timestamp: Date.now(),
          payload: {
            ...p,
            transcript: [...this.transcriptCache],
          },
        });
        if (p.waveformActivity !== undefined && !this.micMuted) {
          this.emit({
            type: 'waveform_update',
            timestamp: Date.now(),
            payload: { waveformActivity: p.waveformActivity },
          });
        }
      }, cumulativeDelay);
      this.scenarioTimers.push(t);
    }

    // 2. Start microphone capture & Audio Graph
    await this.startMicrophone();

    // 3. Create backend session on FastAPI
    const scenario = DEMO_SCENARIOS[scenarioId] || DEMO_SCENARIOS['genuine_executive'];
    let claimedSpeakerId: string | null = null;
    if (scenarioId === 'ai_cloned_cfo' || scenarioId === 'genuine_executive' || scenarioId === 'human_impersonator') {
      claimedSpeakerId = 'LA_0069'; // CFO reference profile in DB
    }

    try {
      const token = await (authService as any).ensureToken?.() || authService.getToken();
      console.info(`[WS] Creating backend session via ${config.apiBaseUrl}/api/calls/start...`);
      const res = await fetch(`${config.apiBaseUrl}/api/calls/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          caller_name: scenario.caller.name,
          caller_number: scenario.caller.claimedRole,
          claimed_speaker_id: claimedSpeakerId,
        }),
      });

      if (!res.ok) {
        throw new Error(`/api/calls/start returned HTTP ${res.status}`);
      }

      const data: StartCallResponse = await res.json();
      this.sessionId = data.session_id;
      console.info(`[WS] Backend session created: ${data.session_id}`);

      // 4. Open WebSocket connection
      this.connectWebSocket(data.session_id);
    } catch (err) {
      console.error('[WS] Failed to initialize backend session, falling back to standalone channel:', err);
      this.diagnostics.wsStatus = 'error';
      // Attempt fallback connection directly with callId (backend will auto-provision)
      this.connectWebSocket(callId);
    }
  }

  private connectWebSocket(sessionId: string): void {
    const wsUrl = `${config.wsBaseUrl}/ws/stream/${sessionId}`;
    console.info(`[WS] CONNECTING to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.info('[WS] OPEN — WebSocket stream connected successfully');
      this.diagnostics.wsStatus = 'connected';
      this.diagnostics.lastEvent = 'WS_CONNECTED';
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data !== 'string') return;
      try {
        const envelope = JSON.parse(evt.data) as {
          event?: string;
          type?: string;
          data?: unknown;
          timestamp?: string;
        };

        if (envelope.type === 'pong') return;

        const eventName = envelope.event ?? '';
        const data = envelope.data;

        this.diagnostics.backendResultsCount++;
        this.diagnostics.lastEvent = eventName;
        this.diagnostics.lastUpdateTime = Date.now();

        if (eventName === 'RISK_UPDATE') {
          const update = data as BackendRiskUpdate;
          console.info(
            `[WS RX] event = RISK_UPDATE | risk_level = ${update.risk_level} | risk_score = ${update.risk_score} | speech = ${update.speech_detected} | verdict = ${update.verdict} | transcript = "${update.transcript || ''}"`
          );
          this.diagnostics.lastVerdict = update.verdict;
          this.diagnostics.lastRiskScore = update.risk_score;
          this.diagnostics.lastRiskLevel = update.risk_level;
          this.diagnostics.lastSpeechDetected = update.speech_detected;
          if (update.transcript) {
            this.diagnostics.lastTranscript = update.transcript;
          }
          this.handleRiskUpdate(update);
        } else if (eventName === 'USER_SECURITY_ALERT') {
          const alertData = data as BackendUserSecurityAlert;
          console.warn(`[WS RX] event = USER_SECURITY_ALERT | severity = ${alertData.severity} | score = ${alertData.risk_score}`);
          this.handleSecurityAlert(alertData);
        } else if (eventName === 'CALL_ENDED') {
          console.info('[WS RX] event = CALL_ENDED');
          this.active = false;
          this.emit({ type: 'call_ended', timestamp: Date.now(), payload: {} });
        } else if (eventName === 'ERROR') {
          console.warn('[WS RX] Backend ERROR:', data);
        }
      } catch (e) {
        console.warn('[WS RX] Failed to parse message:', e);
      }
    };

    ws.onerror = (e) => {
      console.error('[WS] Error on streaming socket:', e);
      this.diagnostics.wsStatus = 'error';
    };

    ws.onclose = () => {
      console.info('[WS] Streaming socket closed');
      this.diagnostics.wsStatus = 'closed';
    };
  }

  stop(): void {
    stopCallerSpeech();
    this.active = false;
    this.scenarioTimers.forEach(clearTimeout);
    this.scenarioTimers = [];
    this.stopMicrophone();

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.sessionId) {
      const token = authService.getToken();
      const endUrl = `${config.apiBaseUrl}/api/calls/${this.sessionId}/end`;
      fetch(endUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: 'NORMAL_HANGUP' }),
      }).catch(() => {});
      this.sessionId = null;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  private reportScenarioRiskToBackend(scenarioId: ScenarioId, payload: Record<string, any>): void {
    const scenario = DEMO_SCENARIOS[scenarioId] || DEMO_SCENARIOS['genuine_executive'];
    const riskScore = Number(payload.security?.score ?? 0);
    const riskLevel = riskScore >= 80 ? 'CRITICAL' : riskScore >= 60 ? 'HIGH' : 'LOW';
    const claimedIdentity = scenario.caller.name;
    const rawSignals = (payload.signals || []) as Array<Record<string, any>>;
    const intent = rawSignals.find(s =>
      String(s.type || '').includes('payment') ||
      String(s.type || '').includes('otp') ||
      String(s.type || '').includes('threat') ||
      String(s.type || '').includes('urgent')
    )?.label || 'Call Security Verification';

    const riskEvent = {
      type: 'SCENARIO_RISK_UPDATE',
      data: {
        scenario: scenarioId,
        risk_score: riskScore,
        risk_level: riskLevel,
        claimed_identity: claimedIdentity,
        intent,
        synthetic_probability: typeof payload.security?.syntheticProbability === 'number'
          ? payload.security.syntheticProbability
          : (riskScore / 100),
        speaker_similarity: typeof payload.security?.speakerMatch === 'number'
          ? (payload.security.speakerMatch / 100)
          : 0.85,
        reasons: ['Biometric anomaly detected', 'Impersonation vector'],
        signals: payload.signals || [],
        transcript: this.transcriptCache.map(t => `${t.speaker}: ${t.text}`).join('\n'),
      },
    };

    // 1. Send over active WebSocket if open
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(riskEvent));
      } catch (err) {
        console.warn('[WS TX] Failed to send SCENARIO_RISK_UPDATE over socket:', err);
      }
    }

    // 2. HTTP POST fallback to ensure backend and SOC persistence
    const targetSessionId = this.sessionId || this.currentCallId;
    if (targetSessionId) {
      const token = authService.getToken();
      fetch(`${config.apiBaseUrl}/api/calls/${targetSessionId}/report_risk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(riskEvent),
      }).catch(err => {
        console.warn('[HTTP] Failed to report risk to backend:', err);
      });
    }
  }

  // ── Step 1-7: Real Chrome Microphone Capture, WebAudio Graph & Resampling ──
  private async startMicrophone(): Promise<void> {
    try {
      console.info('[VOICE] Requesting microphone access from browser...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.mediaStream = stream;

      const tracks = stream.getAudioTracks();
      console.info('[VOICE] stream received');
      console.info('[VOICE] audio tracks =', tracks.length);
      console.info('[VOICE] track kind =', tracks[0]?.kind);
      console.info('[VOICE] track enabled =', tracks[0]?.enabled);
      console.info('[VOICE] track readyState =', tracks[0]?.readyState);
      console.info('[VOICE] track settings =', JSON.stringify(tracks[0]?.getSettings() || {}));

      this.diagnostics.micStatus = 'connected';

      // 1. Create AudioContext and ensure it is resumed
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      this.audioContext = ctx;

      if (ctx.state === 'suspended') {
        console.info('[VOICE] AudioContext was suspended, resuming...');
        await ctx.resume();
      }

      console.info('[VOICE] AudioContext state =', ctx.state);
      console.info('[VOICE] native sample rate =', ctx.sampleRate);
      this.diagnostics.audioContextState = ctx.state as 'running' | 'suspended' | 'closed';
      this.diagnostics.audioContextSampleRate = ctx.sampleRate;

      // 2. Connect MediaStreamAudioSourceNode
      const source = ctx.createMediaStreamSource(stream);

      // 3. AnalyserNode for Real Time-Domain RMS & Waveform
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      this.analyser = analyser;
      source.connect(analyser);

      // 4. ScriptProcessorNode for live frame capture
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = processor;

      source.connect(processor);
      // Connect processor directly to destination so Chrome audio thread keeps it active
      processor.connect(ctx.destination);

      // Store in window global to prevent Chrome garbage collection
      (window as unknown as { _voiceShieldProcessor: ScriptProcessorNode; _voiceShieldCtx: AudioContext })._voiceShieldProcessor = processor;
      (window as unknown as { _voiceShieldCtx: AudioContext })._voiceShieldCtx = ctx;

      const nativeSr = ctx.sampleRate;
      // Target: Accumulate 1.0 second of audio at native sample rate
      const targetNativeChunkSize = Math.round(nativeSr * 1.0);

      processor.onaudioprocess = (e) => {
        if (!this.active) return;
        this.diagnostics.audioProcessCallbacks++;

        const inputData = e.inputBuffer.getChannelData(0);

        // Mute outputBuffer to prevent speaker feedback/echo
        const outputData = e.outputBuffer.getChannelData(0);
        outputData.fill(0);

        // If user muted microphone via UI, do not accumulate or send samples
        if (this.micMuted) {
          return;
        }

        // Copy raw microphone float32 samples
        for (let i = 0; i < inputData.length; i++) {
          this.rawSampleBuffer.push(inputData[i]);
        }

        const now = Date.now();
        if (now - this.lastCallbackLogTime > 1000) {
          console.info(`[AUDIO] callbacks = ${this.diagnostics.audioProcessCallbacks}`);
          this.lastCallbackLogTime = now;
        }

        if (this.rawSampleBuffer.length >= targetNativeChunkSize) {
          const rawChunk = this.rawSampleBuffer.splice(0, targetNativeChunkSize);

          // A. Downsample from native sample rate (e.g. 48000Hz) to 16,000 Hz
          const resampledFloat32 = downsampleTo16kHz(rawChunk, nativeSr);

          // B. Convert float32 [-1.0, 1.0] to 16-bit PCM
          const int16PCM = float32ToInt16PCM(resampledFloat32);

          // C. Count non-zero samples
          let nonZeroCount = 0;
          for (let i = 0; i < int16PCM.length; i++) {
            if (int16PCM[i] !== 0) nonZeroCount++;
          }
          const nonZeroPercent = (nonZeroCount / int16PCM.length) * 100;
          this.diagnostics.pcmNonZeroPercent = Math.round(nonZeroPercent);

          console.info(
            `[AUDIO] sampleRate = 16000 | channels = 1 | samples = ${int16PCM.length} | nonZeroSamples = ${nonZeroCount} (${nonZeroPercent.toFixed(1)}%) | bytes = ${int16PCM.byteLength}`
          );

          // D. Encode standard 16kHz WAV container with RIFF header
          const wavBuffer = encodeWAV(int16PCM, 16000);

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(wavBuffer);
            this.diagnostics.pcmFramesSent++;
            this.diagnostics.totalBytesSent += wavBuffer.byteLength;
            console.info(`[WS] PCM frames sent = ${this.diagnostics.pcmFramesSent} | bytes sent = ${this.diagnostics.totalBytesSent}`);
          }
        }
      };

      // Start continuous real-time RMS time-domain loop
      this.startRealRMSLoop();
    } catch (err) {
      console.error('[VOICE] Microphone initialization error:', err);
      this.diagnostics.micStatus = 'denied';
    }
  }

  // ── Step 3 & 4: Real Time-Domain RMS Calculation ───────────────────────────
  private startRealRMSLoop(): void {
    const updateLoop = () => {
      if (!this.active) return;

      if (this.analyser) {
        if (this.micMuted) {
          this.diagnostics.rms = 0;
          this.diagnostics.activityLevel = 0.04;
          const now = Date.now();
          if (now - this.lastWaveformEmitTime >= 80) {
            this.lastWaveformEmitTime = now;
            this.emit({
              type: 'waveform_update',
              timestamp: now,
              payload: { waveformActivity: 0.04 },
            });
          }
        } else {
          const timeData = new Float32Array(this.analyser.fftSize);
          this.analyser.getFloatTimeDomainData(timeData);

          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i++) {
            sumSquares += timeData[i] * timeData[i];
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          this.diagnostics.rms = rms;

          // Map RMS to normalized activity level (0.04 - 1.0)
          const normalizedActivity = Math.min(1.0, Math.max(0.04, rms * 5.0));
          this.diagnostics.activityLevel = normalizedActivity;

          const now = Date.now();
          if (now - this.lastRMSLogTime > 500) {
            console.info(`[VOICE] RMS = ${rms.toFixed(4)}`);
            this.lastRMSLogTime = now;
          }

          if (now - this.lastWaveformEmitTime >= 80) {
            this.lastWaveformEmitTime = now;
            this.emit({
              type: 'waveform_update',
              timestamp: now,
              payload: { waveformActivity: normalizedActivity },
            });
          }
        }
      }

      this.animFrameId = requestAnimationFrame(updateLoop);
    };

    this.animFrameId = requestAnimationFrame(updateLoop);
  }

  private stopMicrophone(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.rawSampleBuffer = [];
    (window as unknown as { _voiceShieldProcessor?: unknown; _voiceShieldCtx?: unknown })._voiceShieldProcessor = undefined;
    (window as unknown as { _voiceShieldCtx?: unknown })._voiceShieldCtx = undefined;
  }

  // ── Handle Backend ML Pipeline Responses ─────────────────────────────────────
  private handleRiskUpdate(data: BackendRiskUpdate): void {
    const { security, transcriptSegment } = mapBackendRiskUpdate(
      data,
      this.callStartTime,
      this.transcriptCache
    );

    // Keep the higher of simulated scenario attack score and real live mic risk
    const scenarioScore = this.lastScenarioScore || 0;
    const backendScore = security.score ?? 0;
    const finalScore = Math.max(scenarioScore, backendScore);
    const finalSeverity = scoreToSeverity(finalScore);

    const mergedSecurity: SecurityStatus = {
      ...(security as SecurityStatus),
      score: finalScore,
      severity: finalSeverity,
    };

    const partial: Partial<CallSession> = {
      security: mergedSecurity,
    };

    if (transcriptSegment) {
      this.transcriptCache.push(transcriptSegment);
      partial.transcript = [...this.transcriptCache];
    }

    this.emit({
      type: 'security_update',
      timestamp: Date.now(),
      payload: partial,
    });
  }

  private handleSecurityAlert(data: BackendUserSecurityAlert): void {
    const severity = mapRiskLevel(data.severity);
    const partial: Partial<CallSession> = {
      security: {
        score: data.risk_score,
        severity,
        message: data.warning_message || 'Suspicious voice communication detected.',
        signals: [],
        voiceAuthenticity: 'altered',
        callerIdentity: 'failed',
        securityTeamNotified: true,
        recommendation: data.recommended_action || 'Do not share sensitive information. Verify the caller.',
      },
    };
    this.emit({
      type: 'security_update',
      timestamp: Date.now(),
      payload: partial,
    });
  }

  private emit(event: CallEvent): void {
    this.handlers.forEach((h) => h(event));
  }
}

// ─── Initial Live Call State ─────────────────────────────────────────────────
function buildInitialSession(callId: string, scenarioId: ScenarioId): CallSession {
  const scenario = DEMO_SCENARIOS[scenarioId];
  const caller: CallerIdentity = scenario?.caller || {
    name: 'Inbound Call',
    claimedRole: 'Direct Voice Communication',
    organization: 'Protected Organization',
    status: 'checking',
    statusMessage: 'Analyzing caller voice pattern...',
  };

  const initialSeverity = scenario?.initialSeverity ?? 'SAFE';
  const initialScore = initialSeverity === 'CRITICAL' ? 88 : initialSeverity === 'HIGH' ? 72 : initialSeverity === 'MEDIUM' ? 45 : 0;

  const security: SecurityStatus = {
    score: initialScore,
    severity: initialSeverity,
    message: scenario
      ? `VoiceShield active: Monitoring ${scenario.name}`
      : 'VoiceShield connected — listening for speech and analyzing voice patterns...',
    signals: [],
    voiceAuthenticity: 'unknown',
    callerIdentity: 'checking',
    securityTeamNotified: false,
  };

  return {
    id: callId,
    source: 'browser',
    caller,
    startTime: new Date(),
    state: 'active',
    security,
    transcript: [],
    waveformActivity: 0.05,
    scenarioId,
  };
}