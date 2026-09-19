"""
backend/platform/services/warning_tts_service.py
================================================
Dynamic Google Cloud Text-to-Speech (TTS) service for VoiceShield.

Generates real-time localized spoken security warnings in the target user's
selected language. Supports 8 Indian languages:
  - English (India)
  - Tamil
  - Hindi
  - Telugu
  - Malayalam
  - Kannada
  - Bengali
  - Marathi

Credentials:
  Uses backend-only Google Cloud authentication (GOOGLE_APPLICATION_CREDENTIALS,
  GOOGLE_API_KEY, or Application Default Credentials ADC).
  Never exposes Google credentials to the client.
"""

from __future__ import annotations

import base64
import hashlib
import io
import math
import os
import struct
import wave
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from backend.utils.logger import get_logger

log = get_logger("warning_tts_service")


@dataclass(frozen=True)
class LanguageConfig:
    code: str                  # e.g., "ta-IN"
    name: str                  # e.g., "Tamil"
    native_name: str           # e.g., "தமிழ்"
    region: str                # e.g., "India"
    preferred_voice: str       # e.g., "ta-IN-Neural2-A" or "ta-IN-Standard-A"
    fallback_voice: str        # e.g., "ta-IN-Standard-A"
    ssml_gender: str           # "FEMALE" or "MALE"
    critical_warning: str      # Spoken & visual text for CRITICAL clone attack
    credential_warning: str    # Spoken & visual text for OTP/credential exposure
    high_risk_warning: str     # Spoken & visual text for HIGH risk urgency/anomaly


# ─────────────────────────────────────────────────────────────────────────────
# Centralized 8-Language Security Warning Catalog
# Visual text and spoken audio warning match in meaning for each language.
# ─────────────────────────────────────────────────────────────────────────────

LANGUAGE_CATALOG: Dict[str, LanguageConfig] = {
    "ta-IN": LanguageConfig(
        code="ta-IN",
        name="Tamil",
        native_name="தமிழ்",
        region="India",
        preferred_voice="ta-IN-Neural2-A",
        fallback_voice="ta-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "பாதுகாப்பு எச்சரிக்கை: செயற்கை நுண்ணறிவு குரல் நகல் ஆள்மாறாட்டம் கண்டறியப்பட்டுள்ளது. "
            "OTP, கடவுச்சொற்கள் அல்லது பணப் பரிவர்த்தனைகளை பகிர வேண்டாம். இந்த அழைப்பை உடனடியாக துண்டிக்கவும்."
        ),
        credential_warning=(
            "எச்சரிக்கை: ரகசிய விவரங்கள் வெளிப்படும் அபாயம் கண்டறியப்பட்டுள்ளது. "
            "இந்த அழைப்பில் உங்கள் OTP, PIN அல்லது வங்கி விவரங்களை கூற வேண்டாம்."
        ),
        high_risk_warning=(
            "எச்சரிக்கை: சரிபார்க்கப்படாத குரல் மாதிரிகளுடன் அதிக ஆபத்து கண்டறியப்பட்டுள்ளது. "
            "எந்தவொரு நடவடிக்கையும் எடுப்பதற்கு முன் அழைப்பாளரை அதிகாரப்பூர்வமாக சரிபார்க்கவும்."
        ),
    ),
    "hi-IN": LanguageConfig(
        code="hi-IN",
        name="Hindi",
        native_name="हिंदी",
        region="India",
        preferred_voice="hi-IN-Neural2-A",
        fallback_voice="hi-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "सुरक्षा चेतावनी: एआई वॉयस क्लोन प्रतिरूपण का पता चला है। "
            "ओटीपी, पासवर्ड या भुगतान साझा न करें। इस कॉल को तुरंत समाप्त करें।"
        ),
        credential_warning=(
            "चेतावनी: संभावित क्रेडेंशियल जोखिम का पता चला है। "
            "इस कॉल पर अपना ओटीपी, पिन या बैंकिंग विवरण न बताएं।"
        ),
        high_risk_warning=(
            "चेतावनी: असत्यापित आवाज पैटर्न के साथ उच्च जोखिम वाली बातचीत का पता चला है। "
            "कोई भी कार्रवाई करने से पहले फोन करने वाले की पुष्टि करें।"
        ),
    ),
    "en-IN": LanguageConfig(
        code="en-IN",
        name="English",
        native_name="English",
        region="India",
        preferred_voice="en-IN-Neural2-A",
        fallback_voice="en-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "Security Warning: AI voice clone impersonation detected. "
            "Do not share OTPs, passwords, or approve payments. Terminate this call immediately."
        ),
        credential_warning=(
            "Alert: Potential credential exposure detected. "
            "Do not speak or disclose your OTP, PIN, or banking credentials over this call."
        ),
        high_risk_warning=(
            "Warning: High risk conversation detected with unverified acoustic patterns. "
            "Verify the caller independently before taking any action."
        ),
    ),
    "te-IN": LanguageConfig(
        code="te-IN",
        name="Telugu",
        native_name="తెలుగు",
        region="India",
        preferred_voice="te-IN-Standard-A",
        fallback_voice="te-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "భద్రతా హెచ్చరిక: ఏఐ వాయిస్ క్లోన్ మోసం గుర్తించబడింది. "
            "ఓటీపీ, పాస్‌వర్డ్‌లు లేదా నగదు బదిలీలను పంచుకోవద్దు. వెంటనే ఈ కాల్‌ను ముగించండి."
        ),
        credential_warning=(
            "హెచ్చరిక: సంభావ్య ఆధారాల ప్రమాదం గుర్తించబడింది. "
            "ఈ కాల్‌లో మీ ఓటీపీ, పిన్ లేదా బ్యాంకింగ్ వివరాలను తెలియజేయవద్దు."
        ),
        high_risk_warning=(
            "హెచ్చరిక: ధృవీకరించబడని వాయిస్ నమూనాలతో అధిక రిస్క్ సంభాషణ గుర్తించబడింది. "
            "ఏదైనా చర్య తీసుకునే ముందు కాలర్‌ను ధృవీకరించుకోండి."
        ),
    ),
    "ml-IN": LanguageConfig(
        code="ml-IN",
        name="Malayalam",
        native_name="മലയാളം",
        region="India",
        preferred_voice="ml-IN-Standard-A",
        fallback_voice="ml-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "സുരക്ഷാ മുന്നറിയിപ്പ്: എഐ വോയ്സ് ക്ലോൺ ആൾമാറാട്ടം കണ്ടെത്തിയിരിക്കുന്നു. "
            "ഒടിപി, പാസ്‌വേഡ്, അല്ലെങ്കിൽ പേയ്‌മെന്റുകൾ പങ്കിടരുത്. ഉടൻ തന്നെ ഈ കോൾ അവസാനിപ്പിക്കുക."
        ),
        credential_warning=(
            "മുന്നറിയിപ്പ്: രഹസ്യ വിവരങ്ങൾ ചോരാൻ സാധ്യതയുണ്ട്. "
            "ഈ കോളിലൂടെ നിങ്ങളുടെ ഒടിപി, പിൻ അല്ലെങ്കിൽ ബാങ്കിംഗ് വിവരങ്ങൾ നൽകരുത്."
        ),
        high_risk_warning=(
            "മുന്നറിയിപ്പ്: സ്ഥിരീകരിക്കാത്ത ശബ്ദ പാറ്റേണുകളോടെ ഉയർന്ന അപകടസാധ്യത കണ്ടെത്തി. "
            "എന്തെങ്കിലും ചെയ്യുന്നതിന് മുമ്പ് വിളിക്കുന്നയാളെ സ്വതന്ത്രമായി സ്ഥിരീകരിക്കുക."
        ),
    ),
    "kn-IN": LanguageConfig(
        code="kn-IN",
        name="Kannada",
        native_name="ಕನ್ನಡ",
        region="India",
        preferred_voice="kn-IN-Standard-A",
        fallback_voice="kn-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "ಸುರಕ್ಷತಾ ಎಚ್ಚರಿಕೆ: ಎಐ ವಾಯ್ಸ್ ಕ್ಲೋನ್ ವಂಚನೆ ಪತ್ತೆಯಾಗಿದೆ. "
            "ಒಟಿಪಿ, ಪಾಸ್‌ವರ್ಡ್ ಅಥವಾ ಹಣ ವರ್ಗಾವಣೆಯನ್ನು ಹಂಚಿಕೊಳ್ಳಬೇಡಿ. ಈ ಕರೆಯನ್ನು ತಕ್ಷಣವೇ ಕೊನೆಗೊಳಿಸಿ."
        ),
        credential_warning=(
            "ಎಚ್ಚರಿಕೆ: ಸಂಭಾವ್ಯ ರುಜುವಾತು ಸೋರಿಕೆ ಪತ್ತೆಯಾಗಿದೆ. "
            "ಈ ಕರೆಯಲ್ಲಿ ನಿಮ್ಮ ಒಟಿಪಿ, ಪಿನ್ ಅಥವಾ ಬ್ಯಾಂಕಿಂಗ್ ವಿವರಗಳನ್ನು ಬಹಿರಂಗಪಡಿಸಬೇಡಿ."
        ),
        high_risk_warning=(
            "ಎಚ್ಚರಿಕೆ: ಪರಿಶೀಲಿಸದ ಧ್ವನಿ ಮಾದರಿಗಳೊಂದಿಗೆ ಹೆಚ್ಚಿನ ಅಪಾಯದ ಸಂಭಾಷಣೆ ಪತ್ತೆಯಾಗಿದೆ. "
            "ಯಾವುದೇ ಕ್ರಮ ಕೈಗೊಳ್ಳುವ ಮೊದಲು ಕರೆಯನ್ನು ಪರಿಶೀಲಿಸಿ."
        ),
    ),
    "bn-IN": LanguageConfig(
        code="bn-IN",
        name="Bengali",
        native_name="বাংলা",
        region="India",
        preferred_voice="bn-IN-Standard-A",
        fallback_voice="bn-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "নিরাপত্তা সতর্কতা: এআই ভয়েস ক্লোন প্রতারণা শনাক্ত হয়েছে। "
            "ওটিপি, পাসওয়ার্ড বা টাকা লেনদেন শেয়ার করবেন না। অবিলম্বে এই কলটি কেটে দিন।"
        ),
        credential_warning=(
            "সতর্কতা: সম্ভাব্য গোপনীয় তথ্য ফাঁসের ঝুঁকি শনাক্ত হয়েছে। "
            "এই কলে আপনার ওটিপি, পিন বা ব্যাঙ্কিং তথ্য প্রকাশ করবেন না।"
        ),
        high_risk_warning=(
            "সতর্কতা: অযাচাইকৃত ভয়েস প্যাটার্ন সহ উচ্চ ঝুঁকির কথোপকথন শনাক্ত হয়েছে। "
            "কোনো পদক্ষেপ নেওয়ার আগে কলারকে স্বাধীনভাবে যাচাই করুন।"
        ),
    ),
    "mr-IN": LanguageConfig(
        code="mr-IN",
        name="Marathi",
        native_name="मराठी",
        region="India",
        preferred_voice="mr-IN-Standard-A",
        fallback_voice="mr-IN-Standard-A",
        ssml_gender="FEMALE",
        critical_warning=(
            "सुरक्षा इशारा: एआय व्हॉइस क्लोन फसवणूक आढळली आहे. "
            "ओटीपी, पासवर्ड किंवा पैशांचे व्यवहार शेअर करू नका. हा कॉल त्वरित समाप्त करा."
        ),
        credential_warning=(
            "इशारा: गोपनीय माहिती उघड होण्याचा धोका आढळला आहे. "
            "या कॉलवर तुमचा ओटीपी, पिन किंवा बँकिंग तपशील देऊ नका."
        ),
        high_risk_warning=(
            "इशारा: असत्यापित आवाजाच्या पॅटर्नसह उच्च जोखमीचे संभाषण आढळले आहे. "
            "कोणतीही कृती करण्यापूर्वी कॉलरची स्वतंत्रपणे पडताळणी करा."
        ),
    ),
}

# Alias mapping from english name or alternate codes
LANGUAGE_ALIASES: Dict[str, str] = {
    "tamil": "ta-IN",
    "ta": "ta-IN",
    "hindi": "hi-IN",
    "hi": "hi-IN",
    "english": "en-IN",
    "en": "en-IN",
    "en-us": "en-IN",
    "telugu": "te-IN",
    "te": "te-IN",
    "malayalam": "ml-IN",
    "ml": "ml-IN",
    "kannada": "kn-IN",
    "kn": "kn-IN",
    "bengali": "bn-IN",
    "bn": "bn-IN",
    "marathi": "mr-IN",
    "mr": "mr-IN",
}


def normalize_language_code(code_or_name: str) -> str:
    """Normalize any language string (e.g. 'Tamil', 'ta', 'ta-IN') to canonical code."""
    if not code_or_name:
        return "en-IN"
    cleaned = code_or_name.strip()
    if cleaned in LANGUAGE_CATALOG:
        return cleaned
    cleaned_lower = cleaned.lower()
    if cleaned_lower in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[cleaned_lower]
    for key, cfg in LANGUAGE_CATALOG.items():
        if cfg.name.lower() == cleaned_lower:
            return key
    return "en-IN"


class WarningTTSService:
    """
    Singleton service that synthesizes warning audio using Google Cloud Text-to-Speech,
    with an in-memory & file cache to eliminate duplicate synthesis overhead.
    """

    _instance: Optional[WarningTTSService] = None

    def __init__(self):
        self._client: Optional[Any] = None
        self._is_available: Optional[bool] = None
        self._memory_cache: Dict[str, bytes] = {}

    @classmethod
    def get_instance(cls) -> WarningTTSService:
        if cls._instance is None:
            cls._instance = WarningTTSService()
        return cls._instance

    def _get_client(self) -> Optional[Any]:
        """Lazily initialize Google Cloud TextToSpeechClient."""
        if self._client is not None:
            return self._client
        if self._is_available is False:
            return None

        try:
            from google.cloud import texttospeech_v1 as texttospeech
            from google.api_core.client_options import ClientOptions

            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            api_key = (
                os.getenv("GOOGLE_API_KEY")
                or os.getenv("GOOGLE_CLOUD_API_KEY")
                or os.getenv("TTS_API_KEY")
            )

            if cred_path and os.path.isfile(cred_path):
                self._client = texttospeech.TextToSpeechClient.from_service_account_file(cred_path)
                log.info("[WarningTTS] Authenticated using service account: %s", cred_path)
            elif api_key:
                self._client = texttospeech.TextToSpeechClient(
                    client_options=ClientOptions(api_key=api_key)
                )
                log.info("[WarningTTS] Authenticated using Google API Key.")
            else:
                self._client = texttospeech.TextToSpeechClient()
                log.info("[WarningTTS] Authenticated using Application Default Credentials (ADC).")

            self._is_available = True
            return self._client
        except Exception as exc:
            self._is_available = False
            log.warning(
                "[WarningTTS] Google Cloud TextToSpeechClient unavailable (%s). "
                "Resilient synthetic audio fallback will be used.",
                exc,
            )
            return None

    def get_warning_text(self, language_code: str, event_type: str) -> str:
        """Get the authoritative localized script text for a security event."""
        norm_code = normalize_language_code(language_code)
        cfg = LANGUAGE_CATALOG.get(norm_code, LANGUAGE_CATALOG["en-IN"])

        ev = (event_type or "").upper()
        if "CREDENTIAL" in ev or "EXPOSURE" in ev or "OTP" in ev:
            return cfg.credential_warning
        elif "HIGH" in ev or "SUSPICIOUS" in ev or "URGENT" in ev:
            return cfg.high_risk_warning
        else:
            # Default to CRITICAL clone warning
            return cfg.critical_warning

    def synthesize_warning(
        self,
        language_code: str,
        event_type: str = "CRITICAL",
        custom_text: Optional[str] = None,
        audio_format: str = "MP3",
    ) -> Dict[str, Any]:
        """
        Synthesize security warning audio into MP3/WAV.
        Returns a dictionary with base64 audio, raw bytes, content type, and metadata.
        """
        norm_code = normalize_language_code(language_code)
        cfg = LANGUAGE_CATALOG.get(norm_code, LANGUAGE_CATALOG["en-IN"])
        text = custom_text.strip() if custom_text else self.get_warning_text(norm_code, event_type)

        # Cache key based on text, language, and voice
        cache_key = hashlib.md5(f"{norm_code}:{cfg.preferred_voice}:{audio_format}:{text}".encode()).hexdigest()
        if cache_key in self._memory_cache:
            audio_bytes = self._memory_cache[cache_key]
            content_type = "audio/mpeg" if audio_format.upper() == "MP3" else "audio/wav"
            return {
                "success": True,
                "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
                "audio_bytes": audio_bytes,
                "content_type": content_type,
                "language_code": norm_code,
                "language_name": cfg.name,
                "voice_name": cfg.preferred_voice,
                "text": text,
                "provider": "google-cloud-tts (cached)",
            }

        client = self._get_client()
        if client:
            try:
                from google.cloud import texttospeech_v1 as texttospeech

                input_text = texttospeech.SynthesisInput(text=text)
                ssml_gender = (
                    texttospeech.SsmlVoiceGender.FEMALE
                    if cfg.ssml_gender == "FEMALE"
                    else texttospeech.SsmlVoiceGender.MALE
                )

                voice = texttospeech.VoiceSelectionParams(
                    language_code=norm_code,
                    name=cfg.preferred_voice,
                    ssml_gender=ssml_gender,
                )

                encoding = (
                    texttospeech.AudioEncoding.MP3
                    if audio_format.upper() == "MP3"
                    else texttospeech.AudioEncoding.LINEAR16
                )

                audio_config = texttospeech.AudioConfig(
                    audio_encoding=encoding,
                    speaking_rate=0.96,  # Slightly clearer and authoritative pacing for security notices
                    pitch=0.0,
                )

                response = client.synthesize_speech(
                    input=input_text,
                    voice=voice,
                    audio_config=audio_config,
                    timeout=10.0,
                )

                audio_bytes = response.audio_content
                self._memory_cache[cache_key] = audio_bytes
                content_type = "audio/mpeg" if audio_format.upper() == "MP3" else "audio/wav"

                log.info(
                    "[WarningTTS] Synthesized %d bytes for '%s' using voice '%s'",
                    len(audio_bytes),
                    norm_code,
                    cfg.preferred_voice,
                )

                return {
                    "success": True,
                    "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
                    "audio_bytes": audio_bytes,
                    "content_type": content_type,
                    "language_code": norm_code,
                    "language_name": cfg.name,
                    "voice_name": cfg.preferred_voice,
                    "text": text,
                    "provider": "google-cloud-tts",
                }
            except Exception as exc:
                log.warning("[WarningTTS] Google Cloud TTS synthesis failed: %s; using resilient fallback.", exc)

        # Fallback: Generate an audible, valid security chime audio wave
        audio_bytes = self._generate_security_fallback_audio(duration_sec=3.0)
        self._memory_cache[cache_key] = audio_bytes

        return {
            "success": True,
            "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
            "audio_bytes": audio_bytes,
            "content_type": "audio/wav",
            "language_code": norm_code,
            "language_name": cfg.name,
            "voice_name": "fallback-tone-synthesizer",
            "text": text,
            "provider": "resilient-fallback-tone",
        }

    def _generate_security_fallback_audio(self, duration_sec: float = 2.5) -> bytes:
        """
        Generates an authoritative two-tone security alert chime in standard PCM 16kHz WAV format.
        Used as a zero-crash resilience fallback if the Google Cloud API is unreachable.
        """
        sample_rate = 16000
        total_samples = int(sample_rate * duration_sec)
        buf = io.BytesIO()

        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)

            samples = []
            for i in range(total_samples):
                t = float(i) / sample_rate
                # High-priority security two-tone pattern (880Hz / 660Hz alert chime)
                freq = 880.0 if (int(t * 3.5) % 2 == 0) else 660.0
                envelope = math.exp(-2.0 * (t % 0.28))
                val = 0.6 * math.sin(2.0 * math.pi * freq * t) * envelope
                val_clamped = max(-1.0, min(1.0, val))
                int_val = int(val_clamped * 32767.0)
                samples.append(struct.pack("<h", int_val))

            wf.writeframes(b"".join(samples))

        return buf.getvalue()
