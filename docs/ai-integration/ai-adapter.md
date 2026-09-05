# AI Adapter: Architecture & Public Interface

## 1. File Location & Purpose
- **Source File**: `backend/platform/services/ai_adapter.py`
- **Purpose**: Implements a thread-safe singleton wrapper around Member 1's `StreamingAudioPipeline`, `InferencePipeline`, and `RiskEngine`. Provides audio decoding resilience and normalizes AI outputs into strongly-typed platform telemetry DTOs.

---

## 2. Telemetry Schema (`ProcessedChunkTelemetry`)

Located in `backend/platform/services/ai_adapter.py`:

```python
@dataclass(frozen=True)
class ProcessedChunkTelemetry:
    session_id: str
    chunk_id: int
    timestamp: str
    speech_detected: bool
    raw_synthetic_prob: float
    smoothed_synthetic_prob: float
    raw_speaker_sim: Optional[float]
    smoothed_speaker_sim: Optional[float]
    speaker_match: Optional[bool]
    identity_status: str
    transcript: str
    accumulated_transcript: str
    intent: str
    intent_confidence: float
    context_signals: List[str]
    verdict: str
    is_alert: bool
    alert_reason: Optional[str]
    latency_ms: float
    real_time_factor: float
    stage_timings_ms: Dict[str, float]
    risk_decision: RiskDecision
```

---

## 3. Class: `AIAdapter`

### 3.1 Singleton Pattern
```python
@classmethod
def get_instance(cls) -> AIAdapter:
    """Returns thread-safe singleton instance, initializing Member 1 models on first call."""
    if cls._instance is None:
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
    return cls._instance
```

### 3.2 Constructor (`__init__`)
- **Initializes**:
  - `self.inference_pipeline = InferencePipeline()`: Member 1's batch pipeline.
  - `self.streaming_pipeline = StreamingAudioPipeline(chunk_duration_ms=1000, max_buffer_duration_sec=4.0, alert_threshold=0.85)`: Member 1's streaming engine.
  - `self.risk_engine = RiskEngine()`: Member 1's decision matrix.

### 3.3 Methods

#### `decode_input_audio(audio_data: Union[bytes, np.ndarray, Path, str]) -> np.ndarray`
- **Purpose**: Converts arbitrary audio inputs into 16 kHz mono float32 array normalized to `[-1.0, 1.0]`.
- **Implementation**:
  - If `isinstance(audio_data, np.ndarray)`: returns float32 conversion.
  - If `isinstance(audio_data, bytes)`:
    - Checks if bytes begin with `b"RIFF"`: reads via `soundfile.read(io.BytesIO(audio_data))`.
    - If raw PCM: converts via `np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0`.
    - If other format: writes to temporary WAV file and loads via Member 1's `load_audio(temp_path)`.

#### `start_streaming_session(session_id: str, claimed_speaker_id: Optional[str] = None)`
- **Purpose**: Initializes a new session buffer in Member 1's `StreamingAudioPipeline`.
- **Parameters**:
  - `session_id`: Unique call session ID.
  - `claimed_speaker_id`: Optional enrolled speaker ID to compare against.

#### `process_chunk(session_id: str, chunk_data: Union[bytes, np.ndarray], chunk_id: int = 1, claimed_speaker_id: Optional[str] = None) -> ProcessedChunkTelemetry`
- **Purpose**: Ingests an audio chunk, executes Member 1 pipeline, and returns normalized telemetry.
- **Workflow**:
  1. Decodes audio via `self.decode_input_audio(chunk_data)`.
  2. Ensures streaming session exists in `StreamingAudioPipeline`.
  3. Invokes `res = self.streaming_pipeline.process_chunk(session_id=session_id, audio_chunk=chunk_arr, chunk_id=chunk_id, claimed_speaker_id=claimed_speaker_id)`.
  4. Returns mapped `ProcessedChunkTelemetry`.

#### `end_streaming_session(session_id: str) -> Optional[StreamingSessionSummary]`
- **Purpose**: Concludes streaming session in Member 1 pipeline and retrieves final statistics (`total_audio_seconds`, `mean_latency_ms`, `mean_rtf`).

#### `analyze_audio_file(file_path: Union[str, Path], claimed_speaker_id: Optional[str] = None) -> InferenceResult`
- **Purpose**: Executes Member 1's batch `InferencePipeline` on a complete audio file.

---

## 4. Source Files Covered
- `backend/platform/services/ai_adapter.py`
- `backend/pipeline/streaming_pipeline.py`
- `backend/pipeline/inference_pipeline.py`
