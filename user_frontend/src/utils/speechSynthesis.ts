/**
 * user_frontend/src/utils/speechSynthesis.ts
 * ==========================================
 * Browser Speech Synthesis utility for Attack Simulator caller voices.
 * Plays realistic synthesized audio through the computer speakers
 * whenever a simulated caller speaks during any scenario.
 */

import type { ScenarioId } from '../types';

let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    cachedVoices = voices;
  }
  return cachedVoices;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices();
    };
  }
}

function selectVoiceForScenario(scenarioId: ScenarioId, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const candidatePool = englishVoices.length > 0 ? englishVoices : voices;

  if (scenarioId === 'fake_government_official') {
    // Prefer Indian English or authoritative male voice
    const inVoice = candidatePool.find(
      (v) => v.lang.toLowerCase().includes('in') || /india|rishi|ravi/i.test(v.name)
    );
    if (inVoice) return inVoice;
    const maleVoice = candidatePool.find((v) => /male|daniel|david|alex/i.test(v.name));
    return maleVoice || candidatePool[0] || null;
  }

  if (scenarioId === 'normal_conversation') {
    // Anita Sharma (HR Manager) - prefer female voice
    const femaleVoice = candidatePool.find((v) =>
      /female|samantha|zira|karen|fiona|veena|victoria/i.test(v.name)
    );
    return femaleVoice || candidatePool[0] || null;
  }

  if (scenarioId === 'ai_cloned_cfo' || scenarioId === 'genuine_executive' || scenarioId === 'human_impersonator') {
    // Rajesh Kumar - prefer male voice
    const inVoice = candidatePool.find((v) => v.lang.toLowerCase().includes('in'));
    if (inVoice) return inVoice;
    const maleVoice = candidatePool.find((v) => /male|daniel|alex|george/i.test(v.name));
    return maleVoice || candidatePool[0] || null;
  }

  return candidatePool[0] || null;
}

export function speakCallerText(
  text: string,
  scenarioId: ScenarioId,
  callbacks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err: unknown) => void;
  }
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('[Speech] window.speechSynthesis is not supported on this platform.');
    return;
  }

  try {
    // Cancel any previous speech to avoid overlapping chatter
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = loadVoices();
    const chosenVoice = selectVoiceForScenario(scenarioId, voices);
    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }

    // Set scenario specific cadence & pitch
    switch (scenarioId) {
      case 'fake_government_official':
        utterance.rate = 1.04;
        utterance.pitch = 0.92;
        break;
      case 'ai_cloned_cfo':
        utterance.rate = 0.98;
        utterance.pitch = 1.0;
        break;
      case 'human_impersonator':
        utterance.rate = 1.1;
        utterance.pitch = 1.06;
        break;
      case 'genuine_executive':
        utterance.rate = 0.94;
        utterance.pitch = 0.95;
        break;
      case 'normal_conversation':
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        break;
      default:
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
    }

    utterance.onstart = () => {
      console.info(`[Speech] Caller speaking (${scenarioId}): "${text.slice(0, 40)}..."`);
      callbacks?.onStart?.();
    };

    utterance.onend = () => {
      console.info('[Speech] Caller finished speaking.');
      callbacks?.onEnd?.();
    };

    utterance.onerror = (e) => {
      // 'interrupted' is expected when caller changes lines
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('[Speech] Speech synthesis error:', e);
      }
      callbacks?.onError?.(e);
      callbacks?.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('[Speech] Failed to invoke speech synthesis:', err);
    callbacks?.onError?.(err);
  }
}

export function stopCallerSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
