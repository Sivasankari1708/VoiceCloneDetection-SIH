# AI Integration Overview: The Member 1 & 2 Boundary

## 1. Golden Invariant: Member 1 Code is Frozen

The AI intelligence pipeline authored by Member 1 is **read-only** and **immutable**. Member 2 builds the application platform around it without refactoring or modifying Member 1 files:

```
┌────────────────────────────────────────────────────────┐
│             MEMBER 2 PLATFORM LAYER                    │
│                                                        │
│  FastAPI Routes  •  SecurityOrchestrator  •  Database  │
│                           │                            │
│                           ▼                            │
│                   AIAdapter (Bridge)                   │
└───────────────────────────┬────────────────────────────┘
                            │
               Public Python API Invocations
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             MEMBER 1 AI CORE (FROZEN)                  │
│                                                        │
│   StreamingAudioPipeline  •  InferencePipeline         │
│   Silero VAD              •  DeepfakeCNN v2            │
│   SpeechBrain ECAPA-TDNN  •  Faster-Whisper            │
│   IntentDetector          •  RiskEngine                │
└────────────────────────────────────────────────────────┘
```

---

## 2. Integrated AI Components

Member 2 interacts with six core AI components developed by Member 1:

1. **Silero VAD (`backend/audio/vad.py`)**:
   - Detects human voice activity in audio chunks.
   - Gating mechanism: Bypasses heavy deepfake/ASR computation on silence.

2. **DeepfakeCNN v2 (`backend/models/deepfake_v2/`)**:
   - Evaluates log-mel spectrogram features against 4-block Conv2D architecture trained on ASVspoof 2019 LA.
   - Outputs: `synthetic_probability` ($[0.0, 1.0]$) and binary `is_synthetic` flag.

3. **SpeechBrain ECAPA-TDNN (`backend/models/speaker_verifier.py`)**:
   - Generates 192-dimensional speaker embeddings.
   - Computes cosine similarity against enrolled VIP reference embedding.

4. **Faster-Whisper (`backend/models/whisper_asr.py`)**:
   - Quantized int8 CPU speech recognition engine.
   - Outputs chunk transcription text and word-level timing metrics.

5. **IntentDetector (`backend/intent/intent_detector.py`)**:
   - Keyword and regex pattern matcher identifying social engineering threats:
     - `OTP_REQUEST`
     - `PAYMENT_TRANSFER`
     - `CREDENTIAL_REQUEST`
     - `URGENT_REQUEST`
     - `NORMAL_CONVERSATION`

6. **RiskEngine (`backend/pipeline/risk_engine.py`)**:
   - Multi-factor transparent rule engine synthesizing synthetic probability, speaker match/similarity, and intent into a composite risk score $[0.0, 100.0]$ and `RiskDecision`.

---

## 3. The Bridge: `AIAdapter`

The `AIAdapter` singleton (`backend/platform/services/ai_adapter.py`) acts as the sole point of contact between Member 2 and Member 1. It:
- Accepts raw browser audio buffers (PCM bytes, WAV slices, float32 arrays).
- Normalizes audio in-memory to 16 kHz mono float32 without hitting filesystem path errors.
- Dispatches audio to `StreamingAudioPipeline.process_chunk()`.
- Maps Member 1's `StreamingChunkResult` into the platform's `ProcessedChunkTelemetry` DTO.

---

## 4. Source Files Covered
- `backend/platform/services/ai_adapter.py`
- `backend/pipeline/streaming_pipeline.py`
- `backend/pipeline/inference_pipeline.py`
- `backend/pipeline/risk_engine.py`
