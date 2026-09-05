# Module: AI Integration Adapter

**File**: [`backend/platform/services/ai_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py)  
**Package**: `backend.platform.services`

---

## 1. Module Purpose & Responsibilities

`ai_adapter.py` provides the integration bridge connecting the async platform server, WebSocket audio frames, and REST endpoints to Member 1's frozen AI components (`StreamingAudioPipeline`, `InferencePipeline`, and `RiskEngine`).

### Architectural Invariants
1. **Zero Modifications to Member 1**: Member 1 code under `backend/audio/`, `backend/models/`, `backend/pipeline/`, and `backend/intent/` is read-only.
2. **Single Model Load**: Neural networks (Silero VAD, DeepfakeCNN v2, SpeechBrain ECAPA-TDNN, Whisper) are loaded into RAM once upon server startup via a singleton pattern.
3. **In-Memory Audio Normalization**: Converts diverse inbound audio types (Base64 strings, raw 16-bit PCM binary, WAV/FLAC/OGG containers) into 16 kHz mono `float32` NumPy arrays before feeding the AI engine.

---

## 2. Classes & Data Structures

### 2.1 `ProcessedChunkTelemetry` (Dataclass)
Standardized DTO generated per audio chunk consumed by `SecurityOrchestrator`:
- `session_id: str`
- `chunk_id: int`
- `timestamp: str`
- `speech_detected: bool`
- `raw_synthetic_prob: Optional[float]`
- `smoothed_synthetic_prob: Optional[float]`
- `raw_speaker_sim: Optional[float]`
- `smoothed_speaker_sim: Optional[float]`
- `speaker_match: Optional[bool]`
- `identity_status: str` (`"MATCHED"`, `"MISMATCHED"`, `"UNENROLLED"`, `"INCONCLUSIVE"`)
- `transcript: str`
- `accumulated_transcript: str`
- `intent: str`
- `intent_confidence: float`
- `context_signals: List[str]`
- `verdict: str` (`"genuine"`, `"cloned"`, `"imposter"`, `"inconclusive"`)
- `is_alert: bool`
- `alert_reason: Optional[str]`
- `latency_ms: float`
- `real_time_factor: float`
- `stage_timings_ms: Dict[str, float]`
- `risk_decision: RiskDecision`

### 2.2 `AIAdapter` (Singleton Class)
Coordinates session lifecycles, audio pre-processing, chunk inference, and batch file analysis.

#### Constructor
```python
def __init__(self) -> None
```
- Instantiates `DatabaseSpeakerRepository()`.
- Instantiates `RiskEngine()`.
- Obtains `get_default_pipeline()`, binding `self.speaker_repo` as the repository.
- Configures `StreamingConfig(chunk_duration_ms=1000, max_buffer_duration_sec=4.0, fast_alert_threshold=0.85, smoothing_alpha=0.4, speaker_threshold=0.70)`.
- Instantiates `StreamingAudioPipeline`.

#### Class Method: `get_instance() -> AIAdapter`
Thread-safe singleton accessor using `_init_lock`.

#### Public Methods
- `start_session(session_id: str, claimed_speaker_id: Optional[str] = None) -> StreamingSession`:
  Resolves biometric reference embedding from `speaker_repo` if `claimed_speaker_id` is supplied, initializing an isolated streaming session.
- `get_session(session_id: str) -> Optional[StreamingSession]`: Returns existing active stream session.
- `end_session(session_id: str) -> SessionSummary`: Concludes stream and calculates summary metrics.
- `decode_input_audio(raw_data: Union[bytes, str, np.ndarray]) -> np.ndarray`:
  Decodes and normalizes incoming audio into a 16 kHz single-channel `float32` array clipped between `[-1.0, 1.0]`. Handles Base64 strings, soundfile containers, raw PCM integers, and NumPy arrays.
- `process_chunk(session_id: str, chunk_data: Union[bytes, str, np.ndarray], chunk_id: int, claimed_speaker_id: Optional[str] = None) -> ProcessedChunkTelemetry`:
  Executes Member 1's `StreamingAudioPipeline.process_chunk()`, resolves speaker identity match status, computes risk decision via `RiskEngine.evaluate()`, and returns unified telemetry.
- `analyze_batch_file(file_path_or_bytes: Union[str, bytes], claimed_speaker_id: Optional[str] = None) -> Tuple[InferenceResult, RiskDecision]`:
  Executes one-off batch analysis via Member 1's `InferencePipeline.run()`.

---

## 3. Test Traceability

- Automated Tests: [`backend/platform/tests/test_ai_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_ai_adapter.py)
- Live Server Validation: Checks 4, 5, 6, 7 of 11-point live validation.

---

## 4. Source Files Covered

- [`backend/platform/services/ai_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py)
