// user_frontend/src/services/calls/googleSpeechService.ts
// Ultra-low latency Google Web Speech Recognition (STT) engine
// Provides instant, real-time speech-to-text with interim and final tokens,
// automated intent risk elevation, and seamless cross-tab / WebSocket broadcasting.

import { callBridge } from './callBridge';
import { analyzeSensitiveSolicitation } from '../../utils/sensitiveDataDetector';

export type SpeakerRole = 'caller' | 'employee';

export interface SpeechTranscriptCallback {
  onInterim?: (text: string, speaker: SpeakerRole) => void;
  onFinal?: (text: string, speaker: SpeakerRole, riskLevel: 'Safe' | 'Caution' | 'High' | 'Critical') => void;
  onError?: (error: string) => void;
  onStatusChange?: (listening: boolean) => void;
}

class GoogleSpeechService {
  private recognition: any = null;
  private isListening = false;
  private shouldBeListening = false;
  private isMuted = false;
  private speakerRole: SpeakerRole = 'caller';
  private speakerName = 'Caller';
  private sessionId: string | null = null;
  private callbacks: Set<SpeechTranscriptCallback> = new Set();
  private restartTimeout: number | null = null;
  private webSocketSender: ((data: any) => void) | null = null;
  private sessionStartTime = 0;
  private consecutiveErrors = 0;
  private micPermissionGranted = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          // Pause recognition in background tab so it does not collide with foreground tab
          if (this.isListening && this.recognition) {
            try {
              this.recognition.stop();
            } catch (_) {}
          }
        } else {
          // Tab became active: resume if call is active
          if (this.shouldBeListening && !this.isMuted && !this.isListening) {
            this.consecutiveErrors = 0;
            this.safeStart();
          }
        }
      });
    }
    this.initRecognizer();
  }

  private isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  private async requestMicPermission(): Promise<boolean> {
    if (this.micPermissionGranted) return true;
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        this.micPermissionGranted = true;
        return true;
      }
    } catch (err) {
      console.warn('[GoogleSpeech] Microphone permission not yet granted:', err);
      return false;
    }
    return true;
  }

  private initRecognizer(): void {
    if (!this.isSupported()) {
      console.warn('[GoogleSpeech] Web Speech API is not supported in this browser.');
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      // Best fit for Indian English / standard English
      recognition.lang =
        typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('en')
          ? navigator.language
          : 'en-IN';

      recognition.onstart = () => {
        this.isListening = true;
        this.sessionStartTime = Date.now();
        this.consecutiveErrors = 0;
        console.info(`[GoogleSpeech] Active listening started for ${this.speakerRole} (${this.speakerName})`);
        this.notifyStatus(true);
      };

      recognition.onresult = (event: any) => {
        if (this.isMuted || !this.isListening) return;

        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcriptSnippet = res[0]?.transcript || '';
          if (res.isFinal) {
            finalText += ' ' + transcriptSnippet;
          } else {
            interimText += ' ' + transcriptSnippet;
          }
        }

        finalText = finalText.trim();
        interimText = interimText.trim();

        // 1. Instant Interim Token Emission (< 15ms display latency)
        if (interimText) {
          this.handleInterim(interimText);
        }

        // 2. Finalized Utterance Emission
        if (finalText) {
          this.handleFinal(finalText);
        }
      };

      recognition.onerror = (event: any) => {
        const error = event?.error || 'unknown_error';
        if (error === 'no-speech') {
          return; // Normal pause during conversation
        }
        if (error === 'aborted') {
          this.consecutiveErrors++;
          return;
        }
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          console.warn('[GoogleSpeech] Permanent permission/service error:', error);
          this.shouldBeListening = false;
          this.isListening = false;
          this.notifyStatus(false);
          this.callbacks.forEach((cb) => cb.onError?.(error));
          return;
        }
        this.consecutiveErrors++;
        console.warn('[GoogleSpeech] Recognition error:', error);
        this.callbacks.forEach((cb) => cb.onError?.(error));
      };

      recognition.onend = () => {
        this.isListening = false;
        this.notifyStatus(false);

        // Do not auto-restart if we shouldn't be listening or tab is hidden
        if (
          !this.shouldBeListening ||
          this.isMuted ||
          (typeof document !== 'undefined' && document.hidden)
        ) {
          return;
        }

        const duration = Date.now() - this.sessionStartTime;
        // Back off if recognition aborted immediately (< 800ms)
        const delay = duration < 800 ? Math.min(1000 * (this.consecutiveErrors + 1), 5000) : 300;

        if (this.restartTimeout) window.clearTimeout(this.restartTimeout);
        this.restartTimeout = window.setTimeout(() => {
          if (
            this.shouldBeListening &&
            !this.isMuted &&
            (typeof document === 'undefined' || !document.hidden)
          ) {
            this.safeStart();
          }
        }, delay);
      };

      this.recognition = recognition;
    } catch (err) {
      console.error('[GoogleSpeech] Failed to initialize SpeechRecognition:', err);
    }
  }

  private async safeStart(): Promise<void> {
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    if (!this.recognition) {
      this.initRecognizer();
    }
    if (!this.recognition) return;

    // Ensure mic permission before starting speech recognition
    await this.requestMicPermission();

    try {
      this.recognition.start();
    } catch (e: any) {
      if (e?.name !== 'InvalidStateError') {
        console.debug('[GoogleSpeech] Safe start exception:', e);
      }
    }
  }

  public start(
    role: SpeakerRole,
    name: string,
    sessionId?: string,
    wsSender?: (data: any) => void
  ): void {
    this.speakerRole = role;
    this.speakerName = name;
    this.sessionId = sessionId || null;
    this.webSocketSender = wsSender || null;
    this.shouldBeListening = true;
    this.isMuted = false;

    this.safeStart();
  }

  public stop(): void {
    this.shouldBeListening = false;
    this.isListening = false;
    if (this.restartTimeout) {
      window.clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
    }
    this.notifyStatus(false);
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.isListening) {
      try {
        this.recognition.stop();
      } catch (_) {}
    } else if (!muted && this.shouldBeListening && !this.isListening) {
      this.safeStart();
    }
  }

  public getIsListening(): boolean {
    return this.isListening && !this.isMuted;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public subscribe(cb: SpeechTranscriptCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  private notifyStatus(listening: boolean): void {
    this.callbacks.forEach((cb) => cb.onStatusChange?.(listening && !this.isMuted));
  }

  /**
   * Fast rule-based intent and risk evaluation on real-time transcripts
   */
  private evaluateRisk(text: string, speaker: SpeakerRole): 'Safe' | 'Caution' | 'High' | 'Critical' {
    const analysis = analyzeSensitiveSolicitation(text, speaker);
    if (analysis.isSensitive) {
      return analysis.severity;
    }

    const lower = text.toLowerCase();
    if (speaker === 'caller') {
      // Urgent financial / account threat
      if (
        /transfer|wire|clearance|payment|blocked|suspend|arrest|kyc|aadhaar/i.test(lower)
      ) {
        return 'High';
      }
      // Urgency pacing
      if (
        /urgent|immediately|hurry|now|asap|fast|emergency|mandatory/i.test(lower)
      ) {
        return 'Caution';
      }
    }

    return 'Safe';
  }

  private handleInterim(text: string): void {
    // 1. Notify local callbacks immediately
    this.callbacks.forEach((cb) => cb.onInterim?.(text, this.speakerRole));

    // 2. Broadcast interim dialogue cross-tab via callBridge (< 5ms)
    callBridge.sendInterimDialogue(this.speakerRole, text);
  }

  private handleFinal(text: string): void {
    const riskLevel = this.evaluateRisk(text, this.speakerRole);
    const isAttack = riskLevel === 'High' || riskLevel === 'Critical';

    // 1. Notify local callbacks
    this.callbacks.forEach((cb) => cb.onFinal?.(text, this.speakerRole, riskLevel));

    // 2. Broadcast finalized dialogue cross-tab via callBridge
    callBridge.sendDialogue(this.speakerRole, this.speakerName, text, riskLevel, isAttack);

    // 3. Forward over WebSocket to backend ML pipeline if attached
    if (this.webSocketSender) {
      try {
        this.webSocketSender({
          type: 'client_transcript',
          text,
          is_final: true,
          speaker: this.speakerRole,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('[GoogleSpeech] WebSocket dispatch error:', err);
      }
    }
  }
}

export const googleSpeechService = new GoogleSpeechService();
