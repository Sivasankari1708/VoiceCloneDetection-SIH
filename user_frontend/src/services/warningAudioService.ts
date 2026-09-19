/**
 * user_frontend/src/services/warningAudioService.ts
 * =================================================
 * Real-Time Dynamic Warning & Intervention Audio Service for VoiceShield.
 *
 * Features:
 *  1. Centralized 8-Language mapping (English, Tamil, Hindi, Telugu, Malayalam, Kannada, Bengali, Marathi).
 *  2. Localized warning scripts for CRITICAL, POSSIBLE CREDENTIAL EXPOSURE, and HIGH risk events.
 *  3. Dynamically requests audio from the secure backend Google Cloud TTS endpoint (/api/tts/generate).
 *  4. Audio unlock/initialization on user gesture (Call Accept) to guarantee bypass of browser autoplay policies.
 *  5. Duplicate warning deduplication with cooldown protection.
 *  6. Seamless browser SpeechSynthesis fallback if backend TTS is unreachable or offline.
 *  7. Manual "Play Warning" trigger support.
 */

import { getApiBaseUrl } from './config';

export interface SupportedLanguage {
  code: string;           // Canonical Google Cloud TTS language code, e.g. "ta-IN"
  name: string;           // "Tamil"
  nativeName: string;     // "தமிழ்"
  region: string;         // "India"
  label: string;          // "Tamil (தமிழ்) — India"
  preferredVoice: string; // "ta-IN-Neural2-A"
  criticalWarning: string;
  credentialWarning: string;
  highRiskWarning: string;
}

export type SecurityWarningEventType = 'CRITICAL' | 'CREDENTIAL_EXPOSURE' | 'HIGH';

export interface WarningAudioState {
  isSpeaking: boolean;
  activeLanguageCode: string;
  currentWarningText: string;
  provider: string;
  lastPlayedEventType: SecurityWarningEventType | null;
  lastPlayedTimestamp: number | null;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Centralized 8-Language Catalog
// Visual display and spoken audio warnings match in meaning.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  {
    code: 'ta-IN',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    region: 'India',
    label: 'Tamil (தமிழ்) — India',
    preferredVoice: 'ta-IN-Neural2-A',
    criticalWarning:
      'பாதுகாப்பு எச்சரிக்கை: செயற்கை நுண்ணறிவு குரல் நகல் ஆள்மாறாட்டம் கண்டறியப்பட்டுள்ளது. OTP, கடவுச்சொற்கள் அல்லது பணப் பரிவர்த்தனைகளை பகிர வேண்டாம். இந்த அழைப்பை உடனடியாக துண்டிக்கவும்.',
    credentialWarning:
      'எச்சரிக்கை: ரகசிய விவரங்கள் வெளிப்படும் அபாயம் கண்டறியப்பட்டுள்ளது. இந்த அழைப்பில் உங்கள் OTP, PIN அல்லது வங்கி விவரங்களை கூற வேண்டாம்.',
    highRiskWarning:
      'எச்சரிக்கை: சரிபார்க்கப்படாத குரல் மாதிரிகளுடன் அதிக ஆபத்து கண்டறியப்பட்டுள்ளது. எந்தவொரு நடவடிக்கையும் எடுப்பதற்கு முன் அழைப்பாளரை அதிகாரப்பூர்வமாக சரிபார்க்கவும்.',
  },
  {
    code: 'hi-IN',
    name: 'Hindi',
    nativeName: 'हिंदी',
    region: 'India',
    label: 'Hindi (हिंदी) — India',
    preferredVoice: 'hi-IN-Neural2-A',
    criticalWarning:
      'सुरक्षा चेतावनी: एआई वॉयस क्लोन प्रतिरूपण का पता चला है। ओटीपी, पासवर्ड या भुगतान साझा न करें। इस कॉल को तुरंत समाप्त करें।',
    credentialWarning:
      'चेतावनी: संभावित क्रेडेंशियल जोखिम का पता चला है। इस कॉल पर अपना ओटीपी, पिन या बैंकिंग विवरण न बताएं।',
    highRiskWarning:
      'चेतावनी: असत्यापित आवाज पैटर्न के साथ उच्च जोखिम वाली बातचीत का पता चला है। कोई भी कार्रवाई करने से पहले फोन करने वाले की पुष्टि करें।',
  },
  {
    code: 'en-IN',
    name: 'English',
    nativeName: 'English',
    region: 'India',
    label: 'English — India',
    preferredVoice: 'en-IN-Neural2-A',
    criticalWarning:
      'Security Warning: AI voice clone impersonation detected. Do not share OTPs, passwords, or approve payments. Terminate this call immediately.',
    credentialWarning:
      'Alert: Potential credential exposure detected. Do not speak or disclose your OTP, PIN, or banking credentials over this call.',
    highRiskWarning:
      'Warning: High risk conversation detected with unverified acoustic patterns. Verify the caller independently before taking any action.',
  },
  {
    code: 'te-IN',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    region: 'India',
    label: 'Telugu (తెలుగు) — India',
    preferredVoice: 'te-IN-Standard-A',
    criticalWarning:
      'భద్రతా హెచ్చరిక: ఏఐ వాయిస్ క్లోన్ మోసం గుర్తించబడింది. ఓటీపీ, పాస్‌వర్డ్‌లు లేదా నగదు బదిలీలను పంచుకోవద్దు. వెంటనే ఈ కాల్‌ను ముగించండి.',
    credentialWarning:
      'హెచ్చరిక: సంభావ్య ఆధారాల ప్రమాదం గుర్తించబడింది. ఈ కాల్‌లో మీ ఓటీపీ, పిన్ లేదా బ్యాంకింగ్ వివరాలను తెలియజేయవద్దు.',
    highRiskWarning:
      'హెచ్చరిక: ధృవీకరించబడని వాయిస్ నమూనాలతో అధిక రిస్క్ సంభాషణ గుర్తించబడింది. ఏదైనా చర్య తీసుకునే ముందు కాలర్‌ను ధృవీకరించుకోండి.',
  },
  {
    code: 'ml-IN',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    region: 'India',
    label: 'Malayalam (മലയാളം) — India',
    preferredVoice: 'ml-IN-Standard-A',
    criticalWarning:
      'സുരക്ഷാ മുന്നറിയിപ്പ്: എഐ വോയ്സ് ക്ലോൺ ആൾമാറാട്ടം കണ്ടെത്തിയിരിക്കുന്നു. ഒടിപി, പാസ്‌വേഡ്, അല്ലെങ്കിൽ പേയ്‌മെന്റുകൾ പങ്കിടരുത്. ഉടൻ തന്നെ ഈ കോൾ അവസാനിപ്പിക്കുക.',
    credentialWarning:
      'മുന്നറിയിപ്പ്: രഹസ്യ വിവരങ്ങൾ ചോരാൻ സാധ്യതയുണ്ട്. ഈ കോളിലൂടെ നിങ്ങളുടെ ഒടിപി, പിൻ അല്ലെങ്കിൽ ബാങ്കിംഗ് വിവരങ്ങൾ നൽകരുത്.',
    highRiskWarning:
      'മുന്നറിയിപ്പ്: സ്ഥിരീകരിക്കാത്ത ശബ്ദ പാറ്റേണുകളോടെ ഉയർന്ന അപകടസാധ്യത കണ്ടെത്തി. എന്തെങ്കിലും ചെയ്യുന്നതിന് മുമ്പ് വിളിക്കുന്നയാളെ സ്വതന്ത്രമായി സ്ഥിരീകരിക്കുക.',
  },
  {
    code: 'kn-IN',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    region: 'India',
    label: 'Kannada (ಕನ್ನಡ) — India',
    preferredVoice: 'kn-IN-Standard-A',
    criticalWarning:
      'ಸುರಕ್ಷತಾ ಎಚ್ಚರಿಕೆ: ಎಐ ವಾಯ್ಸ್ ಕ್ಲೋನ್ ವಂಚನೆ ಪತ್ತೆಯಾಗಿದೆ. ಒಟಿಪಿ, ಪಾಸ್‌ವರ್ಡ್ ಅಥವಾ ಹಣ ವರ್ಗಾವಣೆಯನ್ನು ಹಂಚಿಕೊಳ್ಳಬೇಡಿ. ಈ ಕರೆಯನ್ನು ತಕ್ಷಣವೇ ಕೊನೆಗೊಳಿಸಿ.',
    credentialWarning:
      'ಎಚ್ಚರಿಕೆ: ಸಂಭಾವ್ಯ ರುಜುವಾತು ಸೋರಿಕೆ ಪತ್ತೆಯಾಗಿದೆ. ಈ ಕರೆಯಲ್ಲಿ ನಿಮ್ಮ ಒಟಿಪಿ, ಪಿನ್ ಅಥವಾ ಬ್ಯಾಂಕಿಂಗ್ ವಿವರಗಳನ್ನು ಬಹಿರಂಗಪಡಿಸಬೇಡಿ.',
    highRiskWarning:
      'ಎಚ್ಚರಿಕೆ: ಪರಿಶೀಲಿಸದ ಧ್ವನಿ ಮಾದರಿಗಳೊಂದಿಗೆ ಹೆಚ್ಚಿನ ಅಪಾಯದ ಸಂಭಾಷಣೆ ಪತ್ತೆಯಾಗಿದೆ. ಯಾವುದೇ ಕ್ರಮ ಕೈಗೊಳ್ಳುವ ಮೊದಲು ಕರೆಯನ್ನು ಪರಿಶೀಲಿಸಿ.',
  },
  {
    code: 'bn-IN',
    name: 'Bengali',
    nativeName: 'বাংলা',
    region: 'India',
    label: 'Bengali (বাংলা) — India',
    preferredVoice: 'bn-IN-Standard-A',
    criticalWarning:
      'নিরাপত্তা সতর্কতা: এআই ভয়েস ক্লোন প্রতারণা শনাক্ত হয়েছে। ওটিপি, পাসওয়ার্ড বা টাকা লেনদেন শেয়ার করবেন না। অবিলম্বে এই কলটি কেটে দিন।',
    credentialWarning:
      'সতর্কতা: সম্ভাব্য গোপনীয় তথ্য ফাঁসের ঝুঁকি শনাক্ত হয়েছে। এই কলে আপনার ওটিপি, পিন বা ব্যাঙ্কিং তথ্য প্রকাশ করবেন না।',
    highRiskWarning:
      'সতর্কতা: অযাচাইকৃত ভয়েস প্যাটার্ন সহ উচ্চ ঝুঁকির কথোপকথন শনাক্ত হয়েছে। কোনো পদক্ষেপ নেওয়ার আগে কলারকে স্বাধীনভাবে যাচাই করুন।',
  },
  {
    code: 'mr-IN',
    name: 'Marathi',
    nativeName: 'मराठी',
    region: 'India',
    label: 'Marathi (मराठी) — India',
    preferredVoice: 'mr-IN-Standard-A',
    criticalWarning:
      'सुरक्षा इशारा: एआय व्हॉइस क्लोन फसवणूक आढळली आहे. ओटीपी, पासवर्ड किंवा पैशांचे व्यवहार शेअर करू नका. हा कॉल त्वरित समाप्त करा.',
    credentialWarning:
      'इशारा: गोपनीय माहिती उघड होण्याचा धोका आढळला आहे. या कॉलवर तुमचा ओटीपी, पिन किंवा बँकिंग तपशील देऊ नका.',
    highRiskWarning:
      'इशारा: असत्यापित आवाजाच्या पॅटर्नसह उच्च जोखमीचे संभाषण आढळले आहे. कोणतीही कृती करण्यापूर्वी कॉलरची स्वतंत्रपणे पडताळणी करा.',
  },
];

export function findLanguage(codeOrName: string): SupportedLanguage {
  const query = (codeOrName || 'en-IN').trim().toLowerCase();
  const match = SUPPORTED_LANGUAGES.find(
    (l) =>
      l.code.toLowerCase() === query ||
      l.name.toLowerCase() === query ||
      l.code.toLowerCase().startsWith(query)
  );
  return match || SUPPORTED_LANGUAGES[0]; // Default to Tamil or first
}

type StateListener = (state: WarningAudioState) => void;

class WarningAudioService {
  private static instance: WarningAudioService;

  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private isAudioUnlocked = false;

  private activeLanguageCode = 'ta-IN';
  private isSpeaking = false;
  private lastPlayedEventType: SecurityWarningEventType | null = null;
  private lastPlayedLanguageCode: string | null = null;
  private lastPlayedTimestamp: number | null = null;
  private currentWarningText = '';
  private provider = 'idle';
  private error: string | null = null;

  private listeners: Set<StateListener> = new Set();
  private duplicateCooldownMs = 12000; // 12 seconds cooldown per event type to prevent echoes

  private constructor() {
    // Restore saved language preference if present
    try {
      const savedLang = localStorage.getItem('voiceshield_user_language');
      if (savedLang) {
        this.activeLanguageCode = findLanguage(savedLang).code;
      }
    } catch {}
  }

  public static getInstance(): WarningAudioService {
    if (!WarningAudioService.instance) {
      WarningAudioService.instance = new WarningAudioService();
    }
    return WarningAudioService.instance;
  }

  /**
   * Initializes / unlocks the Web Audio Context and dummy audio playback on a user gesture
   * (such as clicking "Accept Call" or starting a call).
   */
  public initAudioPlayback(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
      }

      if (!this.isAudioUnlocked) {
        const silentAudio = new Audio();
        silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        silentAudio.volume = 0.01;
        const p = silentAudio.play();
        if (p !== undefined) {
          p.then(() => {
            this.isAudioUnlocked = true;
            console.info('[WarningAudio] Audio playback successfully unlocked for in-call warnings.');
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[WarningAudio] initAudioPlayback error:', err);
    }
  }

  public getActiveLanguage(): SupportedLanguage {
    return findLanguage(this.activeLanguageCode);
  }

  public setLanguage(codeOrName: string): void {
    const lang = findLanguage(codeOrName);
    const prevCode = this.activeLanguageCode;
    this.activeLanguageCode = lang.code;
    try {
      localStorage.setItem('voiceshield_user_language', lang.code);
    } catch {}
    this.emitState();
    console.info(`[WarningAudio] Language set to: ${lang.name} (${lang.code})`);

    // If currently speaking or warning active and language changed, immediately re-synthesize in new language
    if (prevCode !== lang.code && this.lastPlayedEventType) {
      this.playSecurityWarning(this.lastPlayedEventType, lang.code, true);
    }
  }

  public getWarningScript(eventType: SecurityWarningEventType, languageCode?: string): string {
    const lang = findLanguage(languageCode || this.activeLanguageCode);
    switch (eventType) {
      case 'CREDENTIAL_EXPOSURE':
        return lang.credentialWarning;
      case 'HIGH':
        return lang.highRiskWarning;
      case 'CRITICAL':
      default:
        return lang.criticalWarning;
    }
  }

  public getState(): WarningAudioState {
    return {
      isSpeaking: this.isSpeaking,
      activeLanguageCode: this.activeLanguageCode,
      currentWarningText: this.currentWarningText,
      provider: this.provider,
      lastPlayedEventType: this.lastPlayedEventType,
      lastPlayedTimestamp: this.lastPlayedTimestamp,
      error: this.error,
    };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitState(): void {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  /**
   * Plays the localized security warning during an active call.
   *
   * @param eventType 'CRITICAL' | 'CREDENTIAL_EXPOSURE' | 'HIGH'
   * @param languageCode Optional language code override (e.g. 'ta-IN')
   * @param forceReplay If true, ignores the duplicate cooldown (for manual "Play Warning" button)
   */
  public async playSecurityWarning(
    eventType: SecurityWarningEventType,
    languageCode?: string,
    forceReplay = false
  ): Promise<boolean> {
    const targetLang = findLanguage(languageCode || this.activeLanguageCode);
    const now = Date.now();
    const isSameLanguage = this.lastPlayedLanguageCode === targetLang.code;

    // 1. Deduplication & Cooldown Check
    // If the language changed, allow immediate playback in the newly selected language
    if (!forceReplay && isSameLanguage) {
      if (this.isSpeaking) {
        console.warn(`[WarningAudio] Duplicate warning suppressed: Audio already playing in ${targetLang.code}.`);
        return false;
      }
      if (
        this.lastPlayedEventType === eventType &&
        this.lastPlayedTimestamp &&
        now - this.lastPlayedTimestamp < this.duplicateCooldownMs
      ) {
        console.warn(`[WarningAudio] Duplicate warning suppressed: '${eventType}' in ${targetLang.code} played ${Math.round((now - this.lastPlayedTimestamp) / 1000)}s ago.`);
        return false;
      }
    }

    // Stop any current playback
    this.stopWarning();

    const scriptText = this.getWarningScript(eventType, targetLang.code);
    this.currentWarningText = scriptText;
    this.lastPlayedEventType = eventType;
    this.lastPlayedLanguageCode = targetLang.code;
    this.lastPlayedTimestamp = now;
    this.isSpeaking = true;
    this.error = null;
    this.provider = 'requesting-backend-tts';
    this.emitState();

    console.info(`[WarningAudio] Initiating dynamic warning in ${targetLang.name} (${targetLang.code}) for event ${eventType}...`);

    // 2. Fetch synthesized audio from secure backend Google Cloud TTS endpoint
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/tts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language_code: targetLang.code,
          event_type: eventType,
          custom_text: scriptText,
          audio_format: 'MP3',
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend TTS responded with status ${response.status}`);
      }

      const data = await response.json();
      if (!data.audio_base64) {
        throw new Error('Backend TTS returned empty audio payload');
      }

      this.provider = data.provider || 'google-cloud-tts';
      this.emitState();

      // 3. Play audio through browser Audio element
      const audioUrl = `data:${data.content_type || 'audio/mpeg'};base64,${data.audio_base64}`;
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;
      audio.volume = 1.0;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          this.isSpeaking = false;
          this.currentAudio = null;
          this.emitState();
          console.info('[WarningAudio] Spoken warning completed.');
          resolve();
        };
        audio.onerror = (e) => {
          console.warn('[WarningAudio] Audio element playback error:', e);
          reject(e);
        };
        audio.play().catch((playErr) => {
          console.warn('[WarningAudio] audio.play() rejected (autoplay lock?):', playErr);
          reject(playErr);
        });
      });

      return true;
    } catch (ttsError) {
      console.warn('[WarningAudio] Backend TTS playback failed; activating fallback speech synthesis:', ttsError);
      return this.playFallbackSpeechSynthesis(scriptText, targetLang);
    }
  }

  /**
   * Resilient fallback using browser Web Speech API (window.speechSynthesis)
   * if backend TTS is unreachable or offline.
   */
  private playFallbackSpeechSynthesis(text: string, lang: SupportedLanguage): Promise<boolean> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        this.playFallbackAlertChime();
        this.isSpeaking = false;
        this.provider = 'resilient-chime-fallback';
        this.error = 'Speech synthesis unsupported in this browser environment; security alert chime played.';
        this.emitState();
        resolve(true);
        return;
      }

      this.provider = 'browser-speech-fallback';
      this.emitState();

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang.code;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Find an Indian language voice if available in user's OS
      const voices = window.speechSynthesis.getVoices();
      const matchedVoice = voices.find(
        (v) => v.lang.toLowerCase().replace('_', '-') === lang.code.toLowerCase()
      );
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onend = () => {
        this.isSpeaking = false;
        this.emitState();
        console.info('[WarningAudio] Fallback spoken warning completed.');
        resolve(true);
      };

      utterance.onerror = (err) => {
        console.warn('[WarningAudio] Fallback speechSynthesis error:', err);
        this.playFallbackAlertChime();
        this.isSpeaking = false;
        this.provider = 'resilient-chime-fallback';
        this.error = 'Speech synthesis failed; security chime played.';
        this.emitState();
        resolve(true);
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Resilient Web Audio API two-tone alert chime fallback
   */
  public playFallbackAlertChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = this.audioContext || new AudioCtx();
      this.audioContext = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(660, now + 0.25);
      osc.frequency.setValueAtTime(880, now + 0.5);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.2);
    } catch (e) {
      console.warn('[WarningAudio] playFallbackAlertChime error:', e);
    }
  }

  /**
   * Immediately stops any currently playing audio warning.
   */
  public stopWarning(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.isSpeaking = false;
    this.emitState();
  }
}

export const warningAudioService = WarningAudioService.getInstance();
export default warningAudioService;
