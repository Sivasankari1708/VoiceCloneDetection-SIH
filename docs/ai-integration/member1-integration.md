# Member 1 Integration: Contract & Public API Points

## 1. Interaction Points with Member 1

Member 2 integrates with Member 1 through five public classes across five modules:

| Component | Member 1 Module | Invocation Point in Member 2 | Role in Platform |
|---|---|---|---|
| `StreamingAudioPipeline` | `backend.pipeline.streaming_pipeline` | `AIAdapter.process_chunk()` | Per-chunk real-time audio analysis |
| `InferencePipeline` | `backend.pipeline.inference_pipeline` | `AIAdapter.analyze_audio_file()` | Complete file batch analysis |
| `RiskEngine` | `backend.pipeline.risk_engine` | `AIAdapter.__init__()` | Acoustic risk scoring baseline |
| `SpeakerEnrollmentService` | `backend.models.speaker_enrollment` | `SpeakerService.enroll_identity()` | Reference voice enrollment |
| `BaseSpeakerRepository` | `backend.models.speaker_repository` | `DatabaseSpeakerRepository` | Biometric persistence adapter |

---

## 2. Component-by-Component Ingestion Details

### 2.1 `StreamingAudioPipeline.process_chunk`
- **Signature**:
  ```python
  def process_chunk(
      self,
      session_id: str,
      audio_chunk: Union[np.ndarray, torch.Tensor],
      chunk_id: Optional[int] = None,
      claimed_speaker_id: Optional[str] = None,
  ) -> StreamingChunkResult
  ```
- **Execution Chain**:
  1. Appends chunk to session's internal FIFO rolling buffer (4.0s maximum).
  2. Runs `SileroVAD.detect()`. If `speech_detected is False`, sets `verdict="genuine"` and skips deepfake/ASR inference.
  3. Runs `DeepfakeV2Detector.detect()` on 4.0s buffered audio to extract `synthetic_probability`.
  4. Runs `SpeakerVerifier.verify_speaker()` if `claimed_speaker_id` provided.
  5. Runs `WhisperASR.transcribe()` to capture transcription text.
  6. Runs `IntentDetector.classify()` on transcribed text.
  7. Runs `RiskEngine.evaluate()` to produce `RiskDecision`.
  8. Returns unified `StreamingChunkResult`.

### 2.2 `SpeakerEnrollmentService.enroll_speaker`
- **Signature**:
  ```python
  def enroll_speaker(
      self,
      speaker_id: str,
      audio_files: List[Union[str, Path]],
      metadata: Optional[Dict[str, Any]] = None,
  ) -> EnrollmentResult
  ```
- **Validation**:
  - Requires minimum speech ratio $\ge 0.25$ and minimum speech duration $\ge 0.5$s per sample.
  - Generates ECAPA embeddings across all samples.
  - Requires pairwise cosine similarity consistency $\ge 0.50$.
  - Saves normalized average embedding vector via `repository.save_profile()`.

---

## 3. Source Files Covered
- `backend/pipeline/streaming_pipeline.py`
- `backend/pipeline/inference_pipeline.py`
- `backend/pipeline/risk_engine.py`
- `backend/models/speaker_enrollment.py`
- `backend/models/speaker_repository.py`
- `backend/platform/services/ai_adapter.py`
- `backend/platform/services/speaker_service.py`
