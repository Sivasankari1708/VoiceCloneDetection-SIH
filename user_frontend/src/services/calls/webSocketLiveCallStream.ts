import type {
  CallEvent,
  CallSession,
  SecurityStatus,
  TranscriptSegment,
  BackendRiskUpdate,
  BackendUserSecurityAlert,
} from '../../types';
import type { LiveCallStream } from './liveCallStream';
import { config } from '../config';
import { authService } from '../auth/authService';
import { mapBackendRiskUpdate, mapRiskLevel } from '../../utils/dataMapper';
import { downsampleTo16kHz, float32ToInt16PCM, encodeWAV } from '../../utils/audioUtils';
import { AudioFileStreamer } from './audioFileStreamer';

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

export interface StartCallParams {
  callId?: string;
  sessionId?: string;
  recipientUserId?: string;
  callerName?: string;
  claimedSpeakerId?: string;
  claimedOrgId?: string;
  claimedOrgName?: string;
  testAudioUrl?: string; // If provided, streams real WAV file chunks instead of mic
  receiveOnly?: boolean;  // If true (e.g. recipient monitoring), do not capture mic or stream audio
  waitForAcceptance?: boolean; // If true, wait for CALL_ACCEPTED before streaming audio
}

// Persistent shared playback audio context across navigation and component mounts
let sharedPlaybackAudioContext: AudioContext | null = null;

export function getSharedPlaybackAudioContext(): AudioContext {
  if (!sharedPlaybackAudioContext || sharedPlaybackAudioContext.state === 'closed') {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedPlaybackAudioContext = new AudioCtx();
  }
  return sharedPlaybackAudioContext;
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
  private audioFileStreamer: AudioFileStreamer = new AudioFileStreamer();
  private onAcceptCallback: (() => void) | null = null;
  private canStreamAudio = false;

  // Web Audio Graph & Buffering
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private rawSampleBuffer: number[] = [];
  private animFrameId: number | null = null;
  private lastCallbackLogTime = 0;

  // Incoming audio playback queue (for recipient to hear caller voice)
  private nextPlayTime = 0;

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
    lastRiskLevel: 'SAFE',
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

  getSessionId(): string | null {
    return this.sessionId;
  }



  resumePlaybackAudio(): void {
    try {
      const ctx = getSharedPlaybackAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch((e) => console.warn('[WS] resumePlaybackAudio failed:', e));
      }
    } catch (e) {
      console.warn('[WS] resumePlaybackAudio failed:', e);
    }
  }

  notifyCallAccepted(sessionData?: any): void {
    console.info('[WS] notifyCallAccepted invoked — transitioning to active');
    this.canStreamAudio = true;
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    this.resumePlaybackAudio();
    this.emit({ type: 'call_accepted', timestamp: Date.now(), payload: sessionData || {} });
    if (this.onAcceptCallback) {
      this.onAcceptCallback();
    }
  }

  setMicEnabled(enabled: boolean): void {
    this.micMuted = !enabled;
    this.diagnostics.micStatus = enabled ? 'connected' : 'requesting';
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
    }
  }

  async start(
    scenarioOrParams: string | StartCallParams = 'genuine_executive',
    callIdFallback: string = `call-${Date.now()}`
  ): Promise<void> {
    this.stop(false);
    this.active = true;
    this.micMuted = false;
    this.callStartTime = new Date();
    this.transcriptCache = [];
    this.rawSampleBuffer = [];
    this.onAcceptCallback = null;
    const params: StartCallParams =
      typeof scenarioOrParams === 'string'
        ? { callId: callIdFallback }
        : scenarioOrParams;

    const callId = params.callId || callIdFallback;

    this.canStreamAudio = !params.waitForAcceptance;

    // Immediately initialize microphone if caller is using live mic (ensures user gesture unlocks mic)
    if (!params.receiveOnly && !params.testAudioUrl) {
      this.startMicrophone().catch((err) => {
        console.warn('[WS] Early microphone initialization notice:', err);
      });
    }

    this.diagnostics = {
      micStatus: params.testAudioUrl ? 'connected' : 'requesting',
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
      lastRiskLevel: 'SAFE',
      lastSpeechDetected: null,
      lastUpdateTime: Date.now(),
    };

    // 1. Initial Call Session — zero mock scores
    const initialSession: CallSession = {
      id: callId,
      source: 'browser',
      caller: {
        name: params.callerName || 'Inbound Call',
        claimedRole: '',
        organization: '',
        status: 'unverified',
        statusMessage: 'VoiceShield active: Listening for speech...',
      },
      startTime: this.callStartTime,
      state: 'active',
      security: {
        score: 0,
        severity: 'SAFE',
        message: 'VoiceShield connected. Listening for speech...',
        signals: [],
        voiceAuthenticity: 'unknown',
        callerIdentity: 'checking',
        securityTeamNotified: false,
      },
      transcript: [],
      waveformActivity: 0.05,
      scenarioId: params.claimedSpeakerId ? 'claimed_vip' : 'natural_call',
    };

    this.emit({
      type: 'call_started',
      timestamp: Date.now(),
      payload: initialSession,
    });

    // 2. If existing session ID provided (e.g. recipient accepted incoming call), connect directly
    if (params.sessionId) {
      this.sessionId = params.sessionId;
      this.connectWebSocket(params.sessionId, params);
      return;
    }

    // 3. Otherwise create backend session via FastAPI /api/calls/start
    try {
      const token = authService.getToken();
      console.info(`[WS] Creating backend session via ${config.apiBaseUrl}/api/calls/start...`);
      const res = await fetch(`${config.apiBaseUrl}/api/calls/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          caller_name: params.callerName || 'External Caller',
          caller_number: 'browser_stream',
          claimed_speaker_id: params.claimedSpeakerId || null,
          claimed_org_id: params.claimedOrgId || null,
          claimed_org_name: params.claimedOrgName || null,
          recipient_user_id: params.recipientUserId || null,
        }),
      });

      if (!res.ok) {
        throw new Error(`/api/calls/start returned HTTP ${res.status}`);
      }

      const data: StartCallResponse = await res.json();
      this.sessionId = data.session_id;
      console.info(`[WS] Backend session created: ${data.session_id}`);

      // 4. Open WebSocket connection
      this.connectWebSocket(data.session_id, params);
    } catch (err) {
      console.error('[WS] Failed to initialize backend session, falling back to direct channel:', err);
      this.diagnostics.wsStatus = 'error';
      this.connectWebSocket(callId, params);
    }
  }

  private connectWebSocket(sessionId: string, params: StartCallParams): void {
    const wsUrl = `${config.wsBaseUrl}/ws/stream/${sessionId}`;
    console.info(`[WS] CONNECTING to ${wsUrl}...`);
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    let audioStreamingStarted = false;
    const startAudioSource = async () => {
      if (audioStreamingStarted) return;
      audioStreamingStarted = true;

      if (params.receiveOnly) {
        // Monitoring Mode (Recipient View): receive-only, no microphone or file streaming
        console.info('[WS] Receive-only mode active (recipient monitoring). Microphone stream is disabled.');
        this.diagnostics.micStatus = 'connected';
      } else if (params.testAudioUrl) {
        // Test Audio Mode: stream real WAV file chunks
        console.info('[WS] Starting AudioFileStreamer with sample:', params.testAudioUrl);
        this.audioFileStreamer
          .startStreaming(
            params.testAudioUrl,
            ws,
            (progress) => {
              this.diagnostics.pcmFramesSent = progress.chunkIndex;
              this.diagnostics.totalBytesSent = progress.bytesSent;
              this.diagnostics.rms = progress.rms;
              this.emit({
                type: 'waveform_update',
                timestamp: Date.now(),
                payload: { waveformActivity: progress.rms },
              });
            },
            () => {
              console.info('[WS] AudioFileStreamer completed sending all chunks.');
            }
          )
          .catch((err) => {
            console.error('[WS] Error streaming audio file:', err);
          });
      } else {
        // Live Microphone Mode: capture actual browser mic
        await this.startMicrophone();
      }
    };

    this.onAcceptCallback = () => {
      startAudioSource();
    };

    ws.onopen = async () => {
      console.info('[WS] OPEN — WebSocket stream connected successfully');
      this.diagnostics.wsStatus = 'connected';
      this.diagnostics.lastEvent = 'WS_CONNECTED';

      if (!params.waitForAcceptance) {
        await startAudioSource();
      } else {
        console.info('[WS] Waiting for recipient to accept before starting audio stream...');
      }
    };

    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        this.handleIncomingAudio(evt.data);
        return;
      }
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
            `[WS RX] RISK_UPDATE | score=${update.risk_score} | level=${update.risk_level} | verdict=${update.verdict} | speech=${update.speech_detected} | text="${update.transcript || ''}"`
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
          console.warn(`[WS RX] USER_SECURITY_ALERT | severity=${alertData.severity} | score=${alertData.risk_score}`);
          this.handleSecurityAlert(alertData);
        } else if (eventName === 'CALL_ACCEPTED') {
          console.info('[WS RX] CALL_ACCEPTED received from backend');
          this.canStreamAudio = true;
          if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
          }
          this.emit({ type: 'call_accepted', timestamp: Date.now(), payload: (data as any) || {} });
          if (params.waitForAcceptance) {
            console.info('[WS] Recipient accepted call! Commencing audio stream now...');
            startAudioSource();
          }
        } else if (eventName === 'CALL_ENDED') {
          console.info('[WS RX] CALL_ENDED');
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

  stop(terminateBackendSession: boolean = false, reason: string = 'NORMAL_HANGUP'): void {
    this.active = false;
    this.audioFileStreamer.stop();
    this.stopMicrophone();

    this.nextPlayTime = 0;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (terminateBackendSession && this.sessionId) {
      const token = authService.getToken();
      const endUrl = `${config.apiBaseUrl}/api/calls/${this.sessionId}/end`;
      fetch(endUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason }),
      }).catch(() => {});
      this.sessionId = null;
    }
  }

  private async handleIncomingAudio(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.active) return;
    try {
      const ctx = getSharedPlaybackAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      // decodeAudioData detaches the buffer, pass a copy
      const copy = arrayBuffer.slice(0);
      const audioBuffer = await ctx.decodeAudioData(copy);

      // Compute RMS for recipient energy level meter and waveform animation
      const channelData = audioBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < channelData.length; i++) {
        sumSq += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSq / (channelData.length || 1));
      this.diagnostics.rms = rms;
      const normalizedActivity = Math.min(1.0, Math.max(0.04, rms * 4.5));
      this.diagnostics.activityLevel = normalizedActivity;

      const now = Date.now();
      if (now - this.lastWaveformEmitTime >= 80) {
        this.lastWaveformEmitTime = now;
        this.emit({
          type: 'waveform_update',
          timestamp: now,
          payload: { waveformActivity: normalizedActivity },
        });
      }

      // Seamless buffer scheduling on timeline
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      // Resynchronize if buffer schedule fell behind or drifted too far ahead
      if (this.nextPlayTime < currentTime || this.nextPlayTime > currentTime + 1.5) {
        this.nextPlayTime = currentTime;
      }
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;
    } catch (err) {
      console.warn('[WS] Error decoding/playing incoming audio chunk:', err);
    }
  }

  terminate(reason: string = 'NORMAL_HANGUP'): void {
    this.stop(true, reason);
  }

  isActive(): boolean {
    return this.active;
  }

  // ── Real Chrome Microphone Capture, WebAudio Graph & Resampling ──
  private async startMicrophone(): Promise<void> {
    try {
      if (this.mediaStream && this.audioContext && this.processor) {
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        this.diagnostics.micStatus = 'connected';
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('[VOICE] navigator.mediaDevices.getUserMedia is unavailable on this browser/origin.');
        this.diagnostics.micStatus = 'denied';
        return;
      }
      console.info('[VOICE] Requesting microphone access from browser...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.mediaStream = stream;
      this.diagnostics.micStatus = 'connected';

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      this.audioContext = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      this.diagnostics.audioContextState = ctx.state as 'running' | 'suspended' | 'closed';
      this.diagnostics.audioContextSampleRate = ctx.sampleRate;

      const source = ctx.createMediaStreamSource(stream);

      // Natural 1:1 gain allowing browser echoCancellation and noiseSuppression to operate cleanly
      const gainNode = ctx.createGain();
      gainNode.gain.value = 1.0;
      source.connect(gainNode);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      this.analyser = analyser;
      gainNode.connect(analyser);

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      this.processor = processor;

      gainNode.connect(processor);
      processor.connect(ctx.destination);

      (window as unknown as { _voiceShieldProcessor: ScriptProcessorNode; _voiceShieldCtx: AudioContext })._voiceShieldProcessor = processor;
      (window as unknown as { _voiceShieldCtx: AudioContext })._voiceShieldCtx = ctx;

      const nativeSr = ctx.sampleRate;
      const targetNativeChunkSize = Math.round(nativeSr * 1.0); // 1.0 second

      processor.onaudioprocess = (e) => {
        if (!this.active || !this.canStreamAudio) return;
        this.diagnostics.audioProcessCallbacks++;

        const inputData = e.inputBuffer.getChannelData(0);

        // Mute outputBuffer to prevent feedback echo
        const outputData = e.outputBuffer.getChannelData(0);
        outputData.fill(0);

        if (this.micMuted) return;

        for (let i = 0; i < inputData.length; i++) {
          this.rawSampleBuffer.push(inputData[i]);
        }

        const now = Date.now();
        if (now - this.lastCallbackLogTime > 1000) {
          this.lastCallbackLogTime = now;
        }

        if (this.rawSampleBuffer.length >= targetNativeChunkSize) {
          const rawChunk = this.rawSampleBuffer.splice(0, targetNativeChunkSize);

          // 1. Downsample from native rate to 16,000 Hz
          const resampledFloat32 = downsampleTo16kHz(rawChunk, nativeSr);

          // 2. Convert float32 to 16-bit PCM
          const int16PCM = float32ToInt16PCM(resampledFloat32);

          // 3. Check non-zero percent
          let nonZeroCount = 0;
          for (let i = 0; i < int16PCM.length; i++) {
            if (int16PCM[i] !== 0) nonZeroCount++;
          }
          const nonZeroPercent = (nonZeroCount / int16PCM.length) * 100;
          this.diagnostics.pcmNonZeroPercent = Math.round(nonZeroPercent);

          // 4. Encode standard 16kHz WAV container
          const wavBuffer = encodeWAV(int16PCM, 16000);

          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(wavBuffer);
            this.diagnostics.pcmFramesSent++;
            this.diagnostics.totalBytesSent += wavBuffer.byteLength;
          }
        }
      };

      this.startRealRMSLoop();
    } catch (err) {
      console.error('[VOICE] Microphone initialization error:', err);
      this.diagnostics.micStatus = 'denied';
    }
  }

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

          const normalizedActivity = Math.min(1.0, Math.max(0.04, rms * 5.0));
          this.diagnostics.activityLevel = normalizedActivity;

          const now = Date.now();
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
      this.processor.onaudioprocess = null;
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
  }

  // ── Authoritative Backend Responses (Zero Frontend Risk Simulation) ──
  private handleRiskUpdate(data: BackendRiskUpdate): void {
    const { security, transcriptSegment } = mapBackendRiskUpdate(
      data,
      this.callStartTime,
      this.transcriptCache
    );

    const partial: Partial<CallSession> = {
      security: security as SecurityStatus,
    };

    // Stable transcript update using deterministic chunk ID
    if (transcriptSegment) {
      const existingIdx = this.transcriptCache.findIndex((t) => t.id === transcriptSegment.id);
      if (existingIdx >= 0) {
        this.transcriptCache[existingIdx] = transcriptSegment;
      } else {
        this.transcriptCache.push(transcriptSegment);
      }
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
        message: data.warning_message || 'Voice cloning threat detected!',
        signals: [],
        voiceAuthenticity: 'altered',
        callerIdentity: 'failed',
        securityTeamNotified: true,
        recommendation: data.recommended_action || 'Do not share sensitive information. Verify caller identity.',
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