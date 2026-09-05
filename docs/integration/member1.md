# Integration: Member 1 AI Subsystem Boundary

This document outlines the architectural interface and data contracts between Member 2 (Backend Platform & Security Orchestration) and Member 1 (AI & Voice Intelligence).

---

## 1. Golden Rule: Member 1 Code Freeze

**Member 1 AI code is strictly frozen and read-only.**  
Member 2 does not alter, refactor, retrain, rename, or modify any files in:
- `backend/audio/` (Audio pre-processing & decoding)
- `backend/models/` (DeepfakeCNN, ECAPA-TDNN, Silero VAD, Whisper)
- `backend/pipeline/` (InferencePipeline, StreamingAudioPipeline, RiskEngine)
- `backend/intent/` (IntentDetector, keywords)
- `backend/schemas/` (Member 1 inference DTOs)
- `backend/tests/` (Member 1 unit tests)

---

## 2. Integration Interface: `AIAdapter`

Member 2 interacts with Member 1 exclusively through the adapter layer in [`backend/platform/services/ai_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py).

```
┌────────────────────────────────────────────────────────┐
│                   Member 2 (Platform)                  │
│       FastAPI Routes / WebSockets / Orchestrator       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                 AIAdapter (Singleton)                  │
│  - In-memory 16 kHz audio normalization                │
│  - Session state tracking                              │
│  - Adapts DatabaseSpeakerRepository                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Member 1 (Frozen AI Core)                │
│  - StreamingAudioPipeline                              │
│  - InferencePipeline                                   │
│  - RiskEngine                                          │
└────────────────────────────────────────────────────────┘
```

---

## 3. Data Transformation & Normalization

Member 1's pipeline expects:
- Standard 16 kHz, single-channel (mono), `float32` NumPy arrays with amplitudes normalized to `[-1.0, 1.0]`.

Member 2's `AIAdapter.decode_input_audio(...)` automatically converts:
1. Base64 encoded audio strings.
2. Raw 16-bit PCM byte streams from browser microphones or WebSockets.
3. Audio container bytes (WAV, FLAC, OGG, WebM).
4. Raw NumPy arrays.

---

## 4. Biometric Repository Inversion

Member 1's `InferencePipeline` requires a `BaseSpeakerRepository` to resolve reference embeddings for claimed speakers.  
Member 2 provides `DatabaseSpeakerRepository`, which implements this interface by persisting and querying 192-dimensional floating-point vectors stored in PostgreSQL / SQLite without modifying Member 1 files.

---

## 5. Output Consumption

From Member 1's `StreamingInferenceResult` and `RiskDecision`, Member 2 extracts:
- `synthetic_probability`: Output of DeepfakeCNN v2.
- `speaker_similarity`: Cosine similarity from ECAPA-TDNN against enrolled reference embedding.
- `speaker_match`: Boolean match indicator ($> 0.70$).
- `intent`: Extracted intent (e.g. `OTP_REQUEST`, `PAYMENT_TRANSFER`).
- `verdict`: `genuine`, `cloned`, `imposter`, or `inconclusive`.
- `risk_score` & `risk_level`: Base risk calculations from Member 1's `RiskEngine`.

Member 2 then feeds these values into `PolicyEngine` and `SecurityOrchestrator` for real-time alerting and incident handling.
