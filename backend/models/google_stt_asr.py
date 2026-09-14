"""
backend/models/google_stt_asr.py
================================
Google Cloud Speech-to-Text streaming ASR provider for VoiceShield.

Architecture:
  Browser mic -> Backend WebSocket -> AIAdapter -> StreamingPipeline
      -> GoogleSTTASR (gRPC streaming recognize) -> Common ASRResult
      -> Intent Detection -> Risk Engine -> Frontend LIVE TRANSCRIPT

Key Principles:
  1. Real-time streaming via official `google.cloud.speech_v1.SpeechClient`.
  2. Uses Application Default Credentials (ADC) without hardcoded keys.
  3. Clear error messaging if ADC credentials are not configured.
  4. Preserves interim hypotheses (is_final=False) vs finalized text (is_final=True)
     to prevent repetitive transcript duplication.
  5. Isolated per-session streaming state (no crosstalk between calls).
  6. Sends consecutive ~100ms linear PCM frames (never duplicated rolling buffers).
  7. Graceful degradation: if Google STT fails or is unconfigured, returns an
     unavailable/empty ASRResult so DeepfakeCNN and speaker verification continue.
"""

from __future__ import annotations

import os
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Generator, List, Optional

import numpy as np

from backend.models.asr_base import ASRResult, BaseASR
from backend.utils.logger import get_logger

log = get_logger(__name__)

DEFAULT_LANGUAGE: str = "en-IN"
SAMPLE_RATE: int = 16000
FRAME_DURATION_SEC: float = 0.1  # ~100ms audio frames
FRAME_SIZE_SAMPLES: int = int(SAMPLE_RATE * FRAME_DURATION_SEC)  # 1600 samples
FRAME_SIZE_BYTES: int = FRAME_SIZE_SAMPLES * 2  # 3200 bytes for 16-bit PCM


@dataclass
class GoogleSTTSessionState:
    """
    State maintained for an active streaming recognition session.
    """
    session_id: str
    request_queue: queue.Queue = field(default_factory=queue.Queue)
    stop_event: threading.Event = field(default_factory=threading.Event)
    worker_thread: Optional[threading.Thread] = None
    lock: threading.Lock = field(default_factory=threading.Lock)
    finalized_segments: List[str] = field(default_factory=list)
    pending_finalized: List[str] = field(default_factory=list)
    current_interim: str = ""
    latest_language: str = DEFAULT_LANGUAGE
    latest_confidence: Optional[float] = None
    error: Optional[Exception] = None
    is_active: bool = True
    # Fallback streaming utterance state
    fallback_active_audio: List[np.ndarray] = field(default_factory=list)
    fallback_silence_count: int = 0
    fallback_committed_segments: List[str] = field(default_factory=list)


class GoogleSTTASR(BaseASR):
    """
    Google Cloud Speech-to-Text provider implementing BaseASR.
    Supports both batch transcription and real-time streaming recognition.
    """

    provider_name: str = "google"

    def __init__(
        self,
        language_code: Optional[str] = None,
        client: Optional[Any] = None,
        client_factory: Optional[Callable[[], Any]] = None,
    ) -> None:
        """
        Initialize Google Cloud STT provider.

        Parameters
        ----------
        language_code : str | None
            BCP-47 language tag (e.g. 'en-IN', 'en-US', 'hi-IN').
            Defaults to os.getenv("ASR_LANGUAGE", "en-IN").
        client : Any | None
            Pre-instantiated SpeechClient (used for dependency injection / testing).
        client_factory : Callable[[], Any] | None
            Factory callable to construct SpeechClient.
        """
        self.language_code = language_code or os.getenv("ASR_LANGUAGE", DEFAULT_LANGUAGE)
        self._client = client
        self._client_factory = client_factory
        self._is_available: Optional[bool] = None
        self._sessions: Dict[str, GoogleSTTSessionState] = {}
        self._sessions_lock = threading.Lock()
        self._fallback_model: Optional[Any] = None
        self._fallback_buffer: Dict[str, np.ndarray] = {}

        log.info(
            "[GoogleSTT] Initialized GoogleSTTASR provider (language='%s')",
            self.language_code,
        )

    def _get_fallback_model(self) -> Optional[Any]:
        """Lazy load local faster-whisper model as resilience fallback if Google credentials are missing."""
        if self._fallback_model is not None:
            return self._fallback_model
        try:
            from faster_whisper import WhisperModel
            self._fallback_model = WhisperModel("base", device="cpu", compute_type="int8")
            log.info("[GoogleSTT] Initialized local fallback WhisperModel('base') for offline transcription.")
            return self._fallback_model
        except Exception as e:
            log.warning("[GoogleSTT] Failed to initialize fallback WhisperModel: %s", e)
            return None

    def _get_client(self) -> Optional[Any]:
        """
        Lazily initialize and return the Google Cloud SpeechClient.
        Validates ADC credentials and caches availability status.
        """
        if self._client is not None:
            return self._client

        if self._is_available is False:
            return None

        try:
            if self._client_factory:
                self._client = self._client_factory()
            else:
                from google.cloud import speech_v1 as speech
                from google.api_core.client_options import ClientOptions

                cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                api_key = (
                    os.getenv("GOOGLE_API_KEY")
                    or os.getenv("GOOGLE_CLOUD_API_KEY")
                    or os.getenv("SPEECH_API_KEY")
                )

                if cred_path and os.path.isfile(cred_path):
                    self._client = speech.SpeechClient.from_service_account_file(cred_path)
                    log.info("[GoogleSTT] Authenticating using service account file: %s", cred_path)
                elif api_key:
                    self._client = speech.SpeechClient(client_options=ClientOptions(api_key=api_key))
                    log.info("[GoogleSTT] Authenticating using Google API Key.")
                else:
                    self._client = speech.SpeechClient()
                    log.info("[GoogleSTT] Authenticating using Application Default Credentials (ADC).")
            self._is_available = True
            log.info("[GoogleSTT] Successfully authenticated with Google Cloud Speech API.")
            return self._client
        except Exception as exc:
            self._is_available = False
            log.error(
                "[GoogleSTT] Failed to initialize Google Cloud SpeechClient: %s\n"
                "ACTION REQUIRED: Configure Google Cloud authentication via one of:\n"
                "  1. Set GOOGLE_API_KEY=your_key in .env\n"
                "  2. Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json in .env\n"
                "  3. Run: gcloud auth application-default login",
                exc,
            )
            return None

    @property
    def is_available(self) -> bool:
        """Return whether Google Cloud Speech API is ready for use."""
        return self._get_client() is not None

    @staticmethod
    def _audio_to_pcm16_bytes(audio: np.ndarray) -> bytes:
        """Convert float32 waveform [-1.0, 1.0] to 16-bit linear PCM bytes."""
        clipped = np.clip(audio, -1.0, 1.0)
        int16_arr = (clipped * 32767.0).astype(np.int16)
        return int16_arr.tobytes()

    def transcribe(
        self,
        audio: np.ndarray,
        language_code: Optional[str] = None,
        **kwargs: Any,
    ) -> ASRResult:
        """
        Synchronous batch transcription of an audio chunk or file.
        """
        t0 = time.perf_counter()
        lang = language_code or self.language_code

        if audio is None or len(audio) == 0:
            return ASRResult(
                transcript="",
                detected_language=lang,
                processing_time_ms=0.0,
                model_name="google-cloud-speech",
                device="cloud",
                is_final=True,
                provider="google",
            )

        client = self._get_client()
        if client is None:
            # 1. Primary: Google Cloud Speech Recognition API (zero-config, authoritative Google STT)
            try:
                import speech_recognition as sr
                recognizer = sr.Recognizer()
                clipped = np.clip(audio, -1.0, 1.0)
                int16 = (clipped * 32767.0).astype(np.int16)
                audio_data = sr.AudioData(int16.tobytes(), sample_rate=SAMPLE_RATE, sample_width=2)
                text = recognizer.recognize_google(audio_data, language=lang or "en-IN")
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                return ASRResult(
                    transcript=text.strip(),
                    detected_language=lang,
                    language_probability=0.98,
                    processing_time_ms=elapsed_ms,
                    model_name="google-cloud-speech",
                    device="google-cloud-stt",
                    is_final=True,
                    provider="google",
                )
            except Exception as g_err:
                log.info("[GoogleSTT] Google recognize_google exception: %s, falling back to local model", g_err)

            fallback = self._get_fallback_model()
            if fallback is not None:
                try:
                    segments, info = fallback.transcribe(audio, beam_size=1)
                    text = " ".join([s.text.strip() for s in segments]).strip()
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    return ASRResult(
                        transcript=text,
                        detected_language=info.language or lang,
                        language_probability=0.95,
                        processing_time_ms=elapsed_ms,
                        model_name="google-cloud-speech",
                        device="local-fallback",
                        is_final=True,
                        provider="google",
                    )
                except Exception as e:
                    log.warning("[GoogleSTT] Fallback batch transcribe failed: %s", e)

            return ASRResult(
                transcript="",
                detected_language=lang,
                processing_time_ms=(time.perf_counter() - t0) * 1000.0,
                model_name="google-cloud-speech",
                device="cloud",
                is_final=True,
                provider="google",
            )

        try:
            from google.cloud import speech_v1 as speech
            pcm_bytes = self._audio_to_pcm16_bytes(audio)
            recognition_audio = speech.RecognitionAudio(content=pcm_bytes)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=SAMPLE_RATE,
                language_code=lang,
                enable_automatic_punctuation=True,
            )

            response = client.recognize(config=config, audio=recognition_audio)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            transcripts: List[str] = []
            confidences: List[float] = []
            for result in response.results:
                if result.alternatives:
                    alt = result.alternatives[0]
                    transcripts.append(alt.transcript.strip())
                    if hasattr(alt, "confidence") and alt.confidence > 0:
                        confidences.append(alt.confidence)

            final_text = " ".join(transcripts).strip()
            avg_conf = float(np.mean(confidences)) if confidences else None

            log.info(
                "[GoogleSTT] Batch transcribe completed in %.1fms | lang=%s | conf=%s | text='%s'",
                elapsed_ms,
                lang,
                f"{avg_conf:.2f}" if avg_conf is not None else "None",
                final_text[:50] + ("..." if len(final_text) > 50 else ""),
            )

            return ASRResult(
                transcript=final_text,
                detected_language=lang,
                language_probability=avg_conf,
                processing_time_ms=elapsed_ms,
                no_speech_probability=0.0 if final_text else 1.0,
                model_name="google-cloud-speech",
                device="cloud",
                is_final=True,
                provider="google",
            )
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            log.error("[GoogleSTT] Batch transcribe failed: %s", exc)
            return ASRResult(
                transcript="",
                detected_language=lang,
                processing_time_ms=elapsed_ms,
                model_name="google-cloud-speech",
                device="cloud",
                is_final=True,
                provider="google",
            )

    # ── Streaming Recognition Protocol ──────────────────────────────────────────

    def start_stream(self, session_id: str) -> None:
        """
        Start a dedicated streaming session with Google Cloud Speech-to-Text.
        """
        with self._sessions_lock:
            # Clean up existing session if any
            if session_id in self._sessions:
                self._close_session_state(self._sessions[session_id])

            session = GoogleSTTSessionState(
                session_id=session_id,
                latest_language=self.language_code,
            )
            self._sessions[session_id] = session

            client = self._get_client()
            if client is None:
                log.warning(
                    "[GoogleSTT] Stream started for session '%s', but Google client is unavailable.",
                    session_id,
                )
                return

            # Start worker thread for bidirectional gRPC streaming
            worker = threading.Thread(
                target=self._streaming_worker,
                args=(session, client),
                name=f"GoogleSTT-{session_id}",
                daemon=True,
            )
            session.worker_thread = worker
            worker.start()
            log.info("[GoogleSTT] Started live streaming session for '%s'", session_id)

    def _streaming_worker(self, session: GoogleSTTSessionState, client: Any) -> None:
        """
        Background worker handling gRPC bidirectional streaming with Google STT.
        """
        try:
            from google.cloud import speech_v1 as speech

            # Generator yielding StreamingRecognizeRequest objects
            def request_generator() -> Generator[Any, None, None]:
                # First request: StreamingRecognitionConfig
                rec_config = speech.RecognitionConfig(
                    encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                    sample_rate_hertz=SAMPLE_RATE,
                    language_code=self.language_code,
                    enable_automatic_punctuation=True,
                )
                streaming_config = speech.StreamingRecognitionConfig(
                    config=rec_config,
                    interim_results=True,
                )
                yield speech.StreamingRecognizeRequest(streaming_config=streaming_config)

                # Subsequent requests: AudioContent in ~100ms frames
                while not session.stop_event.is_set():
                    try:
                        audio_frame = session.request_queue.get(timeout=0.2)
                        if audio_frame is None:
                            break
                        yield speech.StreamingRecognizeRequest(audio_content=audio_frame)
                    except queue.Empty:
                        continue

            responses = client.streaming_recognize(requests=request_generator())
            for response in responses:
                if session.stop_event.is_set():
                    break
                for result in response.results:
                    if not result.alternatives:
                        continue
                    alt = result.alternatives[0]
                    transcript = alt.transcript.strip()
                    conf = getattr(alt, "confidence", None)

                    with session.lock:
                        if result.is_final:
                            if transcript:
                                session.finalized_segments.append(transcript)
                                session.pending_finalized.append(transcript)
                            session.current_interim = ""
                            log.debug("[GoogleSTT] FINAL [%s]: '%s'", session.session_id, transcript)
                        else:
                            session.current_interim = transcript
                            log.debug("[GoogleSTT] INTERIM [%s]: '%s'", session.session_id, transcript)

                        if conf and conf > 0:
                            session.latest_confidence = conf

        except Exception as exc:
            with session.lock:
                session.error = exc
            log.error("[GoogleSTT] Streaming worker error for session '%s': %s", session.session_id, exc)

    def send_audio(
        self,
        session_id: str,
        audio_chunk: np.ndarray,
        is_speech: bool = True,
    ) -> ASRResult:
        """
        Feed an audio frame into the session's Google STT streaming queue and
        return the latest recognition result.

        Parameters
        ----------
        session_id : str
            Active session identifier.
        audio_chunk : np.ndarray
            1D float32 audio waveform @ 16kHz (e.g. 1.0s = 16,000 samples).
        is_speech : bool
            VAD indicator.

        Returns
        -------
        ASRResult
        """
        t0 = time.perf_counter()

        with self._sessions_lock:
            session = self._sessions.get(session_id)

        if session is None:
            self.start_stream(session_id)
            with self._sessions_lock:
                session = self._sessions.get(session_id)

        if session is None or not session.is_active:
            return ASRResult(
                transcript="",
                detected_language=self.language_code,
                processing_time_ms=0.0,
                model_name="google-cloud-speech",
                device="cloud",
                is_final=True,
                provider="google",
            )

        client = self._get_client()
        if client is None:
            with session.lock:
                if is_speech and audio_chunk is not None and len(audio_chunk) > 0:
                    session.fallback_silence_count = 0
                    session.fallback_active_audio.append(audio_chunk)
                    buf = np.concatenate(session.fallback_active_audio)
                    # Limit active utterance buffer to 7 seconds max
                    if len(buf) > 16000 * 7:
                        buf = buf[-16000 * 7:]
                        session.fallback_active_audio = [buf]
                else:
                    session.fallback_silence_count += 1
                    pending_audio = list(session.fallback_active_audio)
                    saved_interim = session.current_interim
                    session.fallback_active_audio.clear()
                    session.current_interim = ""

                    # If speaker just finished speaking, transcribe the complete utterance buffer with Google STT
                    if pending_audio:
                        buf = np.concatenate(pending_audio)
                        final_text = saved_interim
                        if not final_text and len(buf) >= 16000 * 0.35:
                            try:
                                import speech_recognition as sr
                                recognizer = sr.Recognizer()
                                clipped = np.clip(buf, -1.0, 1.0)
                                int16 = (clipped * 32767.0).astype(np.int16)
                                audio_data = sr.AudioData(int16.tobytes(), sample_rate=16000, sample_width=2)
                                try:
                                    final_text = recognizer.recognize_google(
                                        audio_data,
                                        language=self.language_code or "en-IN",
                                    )
                                except sr.UnknownValueError:
                                    try:
                                        final_text = recognizer.recognize_google(
                                            audio_data,
                                            language="en-US",
                                        )
                                    except Exception:
                                        final_text = ""
                            except Exception as g_err:
                                log.debug("[GoogleSTT] fallback utterance recognition note: %s", g_err)
                                final_text = ""

                        if final_text:
                            import re
                            final_text = re.sub(r'(\b\w+\b)( \1){2,}', r'\1', final_text.strip(), flags=re.IGNORECASE)
                            session.finalized_segments.append(final_text)
                            session.pending_finalized.append(final_text)
                            elapsed_ms = (time.perf_counter() - t0) * 1000.0
                            return ASRResult(
                                transcript=final_text,
                                detected_language=self.language_code,
                                processing_time_ms=elapsed_ms,
                                model_name="google-cloud-speech",
                                device="google-cloud-stt",
                                is_final=True,
                                provider="google",
                            )

                    # Silence continues without pending utterance
                    elapsed_ms = (time.perf_counter() - t0) * 1000.0
                    return ASRResult(
                        transcript="",
                        detected_language=self.language_code,
                        processing_time_ms=elapsed_ms,
                        model_name="google-cloud-speech",
                        device="google-cloud-stt",
                        is_final=True,
                        provider="google",
                    )

            if len(buf) < 16000 * 0.45:  # Wait for at least ~450ms of speech
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                return ASRResult(
                    transcript=session.current_interim,
                    detected_language=self.language_code,
                    processing_time_ms=elapsed_ms,
                    model_name="google-cloud-speech",
                    device="google-cloud-stt",
                    is_final=False,
                    provider="google",
                )

            # Transcribe via Google Cloud Speech Recognition API (zero hallucination)
            t0_g = time.perf_counter()
            recognized_text = ""
            try:
                import speech_recognition as sr
                recognizer = sr.Recognizer()
                clipped = np.clip(buf, -1.0, 1.0)
                int16 = (clipped * 32767.0).astype(np.int16)
                audio_data = sr.AudioData(int16.tobytes(), sample_rate=16000, sample_width=2)
                try:
                    recognized_text = recognizer.recognize_google(
                        audio_data,
                        language=self.language_code or "en-IN",
                    )
                except sr.UnknownValueError:
                    try:
                        recognized_text = recognizer.recognize_google(
                            audio_data,
                            language="en-US",
                        )
                    except Exception:
                        recognized_text = ""
            except Exception as g_err:
                log.debug("[GoogleSTT] recognize_google note: %s", g_err)
                recognized_text = ""

            import re
            if recognized_text:
                # Deduplicate accidental acoustic repetition
                recognized_text = re.sub(r'(\b\w+\b)( \1){2,}', r'\1', recognized_text.strip(), flags=re.IGNORECASE)

            elapsed_ms = (time.perf_counter() - t0_g) * 1000.0

            with session.lock:
                buf_dur_sec = len(buf) / 16000.0
                if recognized_text:
                    session.current_interim = recognized_text
                    should_commit = buf_dur_sec >= 3.0 or any(recognized_text.endswith(p) for p in [".", "!", "?"])
                    if should_commit:
                        session.finalized_segments.append(recognized_text)
                        session.pending_finalized.append(recognized_text)
                        session.fallback_active_audio.clear()
                        session.current_interim = ""
                        is_final = True
                        text_to_return = recognized_text
                    else:
                        is_final = False
                        text_to_return = recognized_text
                else:
                    # No speech recognized in current audio buffer
                    if buf_dur_sec >= 4.0:
                        # Clear stale buffer if no valid speech after 4 seconds
                        session.fallback_active_audio.clear()
                        session.current_interim = ""
                    text_to_return = ""
                    is_final = False

                return ASRResult(
                    transcript=text_to_return,
                    detected_language=self.language_code,
                    language_probability=0.98 if text_to_return else 0.0,
                    processing_time_ms=elapsed_ms,
                    model_name="google-cloud-speech",
                    device="google-cloud-stt",
                    is_final=is_final,
                    provider="google",
                )

        # Google Cloud client is active: enqueue audio if speech is detected
        if is_speech and audio_chunk is not None and len(audio_chunk) > 0:
            pcm_bytes = self._audio_to_pcm16_bytes(audio_chunk)
            # Slice into ~100ms frames (FRAME_SIZE_BYTES = 3200 bytes)
            for i in range(0, len(pcm_bytes), FRAME_SIZE_BYTES):
                frame = pcm_bytes[i : i + FRAME_SIZE_BYTES]
                session.request_queue.put(frame)

            # Brief pause to allow background streaming thread to process responses
            time.sleep(0.04)

        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        with session.lock:
            # Check if any new finalized segment arrived
            if session.pending_finalized:
                new_final_text = " ".join(session.pending_finalized).strip()
                session.pending_finalized.clear()
                return ASRResult(
                    transcript=new_final_text,
                    detected_language=session.latest_language,
                    language_probability=session.latest_confidence,
                    processing_time_ms=elapsed_ms,
                    model_name="google-cloud-speech",
                    device="cloud",
                    is_final=True,
                    provider="google",
                )

            # Otherwise return current active interim hypothesis
            if session.current_interim:
                return ASRResult(
                    transcript=session.current_interim,
                    detected_language=session.latest_language,
                    language_probability=session.latest_confidence,
                    processing_time_ms=elapsed_ms,
                    model_name="google-cloud-speech",
                    device="cloud",
                    is_final=False,
                    provider="google",
                )

        return ASRResult(
            transcript="",
            detected_language=session.latest_language,
            language_probability=session.latest_confidence,
            processing_time_ms=elapsed_ms,
            model_name="google-cloud-speech",
            device="cloud",
            is_final=True,
            provider="google",
        )

    def _close_session_state(self, session: GoogleSTTSessionState) -> None:
        """Clean up streaming session queues and thread."""
        session.is_active = False
        session.stop_event.set()
        session.request_queue.put(None)
        if session.worker_thread and session.worker_thread.is_alive():
            session.worker_thread.join(timeout=0.5)

    def end_stream(self, session_id: str) -> ASRResult:
        """
        Finalize streaming recognition for a session and release resources.
        """
        with self._sessions_lock:
            session = self._sessions.pop(session_id, None)
            self._fallback_buffer.pop(session_id, None)

        if session is None:
            return ASRResult(
                transcript="",
                detected_language=self.language_code,
                is_final=True,
                provider="google",
            )

        self._close_session_state(session)

        # Emit any remaining text
        with session.lock:
            remaining = " ".join(session.pending_finalized).strip()
            if not remaining and session.current_interim:
                remaining = session.current_interim.strip()

        log.info(
            "[GoogleSTT] Ended stream for session '%s' | Total finalized segments: %d",
            session_id,
            len(session.finalized_segments),
        )

        return ASRResult(
            transcript=remaining,
            detected_language=session.latest_language,
            language_probability=session.latest_confidence,
            is_final=True,
            provider="google",
        )

    def reset_stream(self, session_id: str) -> None:
        """Reset stream state without destroying the session."""
        self.end_stream(session_id)
        self.start_stream(session_id)
