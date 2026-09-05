# Member 1 — AI + Audio Engineer: Final Sign-Off Report

**Project**: VoiceCloneDetection-SIH  
**Role**: Member 1 — AI + Audio Engineer  
**Date**: September 2026  
**Status**: **READY — MEMBER 1 COMPLETE**

---

## 1. Responsibility Checklist

| Item | Area | Status | Verification Detail |
|---|---|---|---|
| 1 | ML environment & PyTorch configuration | **PASS** | PyTorch 2.x CPU/MPS, faster-whisper int8, SpeechBrain, Torchaudio |
| 2 | Audio decoding (multi-format via FFmpeg & fallback) | **PASS** | `load_audio()` in `backend/audio/decoder.py` handles WAV, FLAC, MP3, OGG, WebM |
| 3 | 16 kHz mono preprocessing & validation | **PASS** | `backend/audio/preprocessing.py` standardizes to float32 mono @ 16 kHz |
| 4 | Silero VAD speech activity detection & gating | **PASS** | `SileroVAD` in `backend/audio/vad.py` provides segment timestamps & early gating |
| 5 | Trained Deepfake Audio Detector (DeepfakeCNN v2) | **PASS** | Trained & audited on ASVspoof 2019 LA; checkpoint `checkpoints/deepfake_v2_asvspoof2019_la.pt` |
| 6 | ECAPA-TDNN speaker embeddings (192-D) | **PASS** | Pretrained SpeechBrain ECAPA-TDNN with L2 unit-norm embedding extraction |
| 7 | Multi-sample speaker enrollment service | **PASS** | Multi-sample quality validation, consistency checks, and profile persistence |
| 8 | Cosine-similarity speaker verification | **PASS** | Cosine similarity scoring against enrolled reference profiles |
| 9 | faster-whisper automatic speech recognition | **PASS** | Single-load model instance, int8 quantization, speech-gated transcription |
| 10 | Intent extraction & risk analysis | **PASS** | `IntentDetector` keyword & indicator classification over accumulated transcripts |
| 11 | Multi-factor security verdict synthesis | **PASS** | Hierarchical security logic: synthetic detection strictly dominates speaker similarity |
| 12 | Real-time / chunked streaming pipeline | **PASS** | `StreamingAudioPipeline` with continuous session ingestion |
| 13 | Temporal score smoothing (EMA) | **PASS** | Exponential Moving Average ($S_t = \alpha X_t + (1 - \alpha) S_{t-1}$) |
| 14 | Fast alert escalation for critical deepfakes | **PASS** | Immediate alert raised when raw synthetic probability $\ge 0.85$, eliminating smoothing lag |
| 15 | Multi-session state isolation | **PASS** | Independent `StreamingSession` instances per stream with thread-safe locking |
| 16 | Strictly bounded rolling memory buffer | **PASS** | Maximum 4.0s (64,000 samples @ 16 kHz) rolling audio buffer per session |
| 17 | Standardized `InferenceResult` contract | **PASS** | Typed dataclass contract returned by unified `InferencePipeline` |
| 18 | Extended `StreamingInferenceResult` contract | **PASS** | Subclasses `InferenceResult` with RTF, smoothed scores, and alert flags |
| 19 | Backend / frontend API handoff specification | **PASS** | Full input/output schema with JSON example documented for team handoff |
| 20 | Comprehensive automated test suite | **PASS** | 400 tests passing with 0 regressions across all components |
| 21 | Technical & architectural documentation | **PASS** | Detailed reports, docstrings, and complete audit trail |

---

## 2. Final Architecture

```
                                    Incoming Audio Chunk (WebRTC / WebSocket / File)
                                                        │
                                                        ▼
                                       ┌──────────────────────────────────┐
                                       │    Standardize & Decode Audio    │
                                       │   (16 kHz Mono float32 [-1, 1])  │
                                       └──────────────────────────────────┘
                                                        │
                                                        ▼
                                       ┌──────────────────────────────────┐
                                       │        Silero VAD Gating         │
                                       │    Speech Activity Detection     │
                                       └──────────────────┬───────────────┘
                                                          │
                              ┌───────────────────────────┴───────────────────────────┐
                              │ Silence (ratio <= 0.0)                                │ Speech Detected
                              ▼                                                       ▼
               ┌─────────────────────────────┐                         ┌─────────────────────────────┐
               │    Fast Early-Exit (~5ms)   │                         │  Append to Bounded Rolling  │
               │   Downstream Models Skipped │                         │   Audio Buffer (Max 4.0s)   │
               └──────────────┬──────────────┘                         └──────────────┬──────────────┘
                              │                                                       │
                              │                               ┌───────────────────────┼───────────────────────┐
                              │                               ▼                       ▼                       ▼
                              │                     ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
                              │                     │  DeepfakeCNN v2  │    │  ECAPA-TDNN SPK  │    │  faster-whisper  │
                              │                     │  Log-Mel (80x401)│    │ 192-D Embedding  │    │ ASR on Speech    │
                              │                     └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
                              │                              │                       │                       │
                              │                              │                       ▼                       ▼
                              │                              │              ┌──────────────────┐    ┌──────────────────┐
                              │                              │              │Cosine Similarity │    │  IntentDetector  │
                              │                              │              │ vs Enrolled Ref  │    │ on Dialogue Text │
                              │                              │              └────────┬─────────┘    └────────┬─────────┘
                              │                              │                       │                       │
                              │                              └───────────────────────┼───────────────────────┘
                              │                                                      │
                              │                                                      ▼
                              │                                     ┌──────────────────────────────────┐
                              │                                     │  Temporal Smoothing & Fast Alert │
                              │                                     │   EMA Update + Alert Escalation  │
                              │                                     └────────────────┬─────────────────┘
                              │                                                      │
                              │                                                      ▼
                              │                                     ┌──────────────────────────────────┐
                              │                                     │ Multi-Factor Verdict Synthesis   │
                              │                                     │   cloned > imposter > genuine    │
                              │                                     └────────────────┬─────────────────┘
                              │                                                      │
                              └───────────────────────────────┬──────────────────────┘
                                                              ▼
                                               ┌─────────────────────────────┐
                                               │  StreamingInferenceResult   │
                                               │ (Telemetry, Scores, Verdict)│
                                               └─────────────────────────────┘
```

---

## 3. Deepfake Model Audit

### Model Specifications
- **Architecture**: `DeepfakeCNN` v2 — 4 Convolutional Residual Blocks (Conv2d, BatchNorm2d, ReLU, MaxPool2d) + Global Adaptive Average Pooling `nn.AdaptiveAvgPool2d((1, 1))` + 3-layer MLP classification head with Dropout(0.3).
- **Verified Parameter Count**: **585,826 total parameters** (585,826 trainable).
  - *Discrepancy Resolution*: The figure of 1,763,650 parameters belonged to a non-pooled variant flattening feature maps ($256 \times 4 \times 10 = 10,240$ dims) directly into dense layers. The production model uses global adaptive average pooling into 256 dimensions, resulting in exactly 585,826 parameters. This was verified by inspecting all 30 tensors in `checkpoints/deepfake_v2_asvspoof2019_la.pt`.
- **Training Dataset**: Official ASVspoof 2019 Logical Access (LA) training set (25,380 FLAC files; 2,580 bona fide, 22,800 spoof).
- **Validation Dataset**: Official ASVspoof 2019 LA development set (24,844 FLAC files; 2,548 bona fide, 22,296 spoof).
- **Official Evaluation Dataset**: Completely untouched (71,933 files held in reserve, zero data leakage).
- **Production Checkpoint**: `checkpoints/deepfake_v2_asvspoof2019_la.pt` (7,061,365 bytes, epoch 7).
- **Verification Metrics on Full ASVspoof 2019 LA DEV Set**:
  - Accuracy: **99.175%**
  - ROC-AUC: **99.942%**
  - EER: **0.975%**
  - Spoof Recall: **99.255%**
  - Bona Fide Recall: **98.469%**
- **Decision Threshold**: Default decision threshold is `0.50`. Fast alert escalation threshold is `0.85`.
- **Inference Mode**: Evaluated in strict `model.eval()` mode under `@torch.no_grad()`. Class mapping: `bonafide: 0`, `spoof: 1`.

---

## 4. Speaker Verification Audit

- **Backbone**: Pretrained ECAPA-TDNN (`speechbrain/spkrec-ecapa-voxceleb`).
- **Embedding Dimension**: 192-dimensional vector.
- **Normalization**: Strict L2 normalization ($\|e\|_2 = 1.0$).
- **Enrollment Repository**: Filesystem-backed `LocalSpeakerRepository` storing `profile.json` metadata and binary `reference_embedding.npy`.
- **Speaker Similarity Threshold**: **`0.70`**.
  - *Threshold Calibration Status*: **Provisional / Demo Threshold**. While empirical separation between genuine speakers (~0.74 – 0.90) and imposter speakers (~0.05 – 0.25) is verified on test pairs, this threshold has not yet been subjected to a formal DET/EER calibration over an independent multi-thousand trial evaluation set.
- **Biometric Security**: Raw 192-D embeddings are strictly excluded from string representations, logs, and API serialization.

---

## 5. Root Cause Analysis: Streaming Chunk 2 False Alert

### Incident Description
During early real-audio streaming tests with genuine speaker `LA_0069` (`LA_D_1403371.flac`):
- Chunk 1: Silence (VAD ratio = 0.00%)
- Chunk 2: RawSynth = 0.520 (temporary false alarm crossing the 0.50 threshold)
- Chunk 3: RawSynth = 0.050
- Chunk 4: RawSynth = 0.032
- Final Verdict: Genuine

### Root Cause Discovery
The investigation revealed a genuine preprocessing defect in the streaming pipeline:
1. `_decode_chunk` applied peak normalization (`normalize_waveform`) to **each 1-second chunk individually** before appending it to the rolling session buffer.
2. In Chunk 1 (initial pause), the audio contained quiet room background noise with a peak amplitude of only `0.031`. Peak normalization divided by 0.031, amplifying the quiet ambient room noise by **32.8× (3,280%)** up to full scale (1.0).
3. In Chunk 2, actual speech arrived with natural peak amplitude `0.999`.
4. When concatenated in the rolling buffer, an artificial gain cliff was created at sample 16,000: 1.0 full-scale amplified room hiss suddenly transitioning into speech. This sharp mathematical edge contaminated the Mel spectrogram, causing `DeepfakeCNN` to output `0.520`.

### The Fix
Removed per-chunk peak normalization in `StreamingAudioPipeline.process_chunk`, retaining the natural float32 PCM scaling within `[-1.0, 1.0]`.

### Verification After Fix
- Chunk 1: Silence (early exit in 24.6 ms)
- Chunk 2: RawSynth = **0.002** (0.2% synthetic / 99.8% genuine)
- Chunk 3: RawSynth = **0.001** (0.1% synthetic / 99.9% genuine)
- Chunk 4: RawSynth = **0.001** (0.1% synthetic / 99.9% genuine)
- Final Security Verdict: **GENUINE** (Alert: False)

The false alert is completely eliminated.

---

## 6. Multi-Factor Security Scenarios Verification

| Scenario | Input Profile | Synthetic Prob | Speaker Match | Expected Verdict | Verified Result | Security Rule Enforced |
|---|---|---|---|---|---|---|
| **A. Genuine Enrolled Speaker** | Enrolled (`LA_0069`) | Low (`0.001`) | Match (`sim=0.75 > 0.70`) | `genuine` | **`genuine`** | Authentic speaker confirmed |
| **B. Imposter Speaker** | Enrolled (`LA_0069`) | Low (`0.002`) | Mismatch (`sim=0.03 < 0.70`) | `imposter` | **`imposter`** | Genuine voice, wrong identity |
| **C. AI Clone of Enrolled Speaker** | Enrolled (`LA_0069`) | High (`1.000`) | Match or Mismatch | `cloned` | **`cloned`** | **Deepfake strictly overrides speaker similarity** |
| **D. Unknown Synthetic Speaker** | None | High (`0.999`) | N/A | `cloned` | **`cloned`** | High-risk synthetic voice detected |
| **E. Digital Silence / Noise** | Any | N/A | N/A | `inconclusive` | **`inconclusive`** | VAD early-gated; no false accusation |
| **F. Unenrolled Natural Speaker** | None | Low (`0.001`) | N/A | `inconclusive` | **`inconclusive`** | Not synthetic, but identity unverified |

---

## 7. Performance & Latency Telemetry

Measured on tested hardware: **Apple Silicon Mac (CPU execution)** under Python 3.14.3.

| Stage | Silence Chunk (1000 ms) | Speech Chunk (1000 ms) | Operational Notes |
|---|---|---|---|
| Audio Decode & Standardization | 0.2 ms | 0.3 ms | Float32 mono conversion |
| Silero VAD | 2.5 ms | 2.7 ms | Speech boundary detection |
| DeepfakeCNN v2 | *Bypassed (0 ms)* | 6.5 ms | Evaluated over 4.0s rolling buffer |
| ECAPA-TDNN Speaker Verifier | *Bypassed (0 ms)* | 25.0 ms | 192-D embedding extraction & cosine scoring |
| faster-whisper (tiny/int8) | *Bypassed (0 ms)* | 215.0 ms | Quantized CPU speech recognition |
| IntentDetector | *Bypassed (0 ms)* | 0.1 ms | Regex & indicator keyword scanning |
| **Total Chunk Processing Latency** | **~5.5 ms** | **~250.0 ms** | **End-to-end per 1000 ms chunk** |
| **Real-Time Factor (RTF)** | **~0.005** | **~0.250** | **4x to 40x faster than real-time** |

---

## 8. Test Suite Verification

Full test suite execution:
```bash
pytest backend/tests/ -v
```
- **Total Tests**: **401**
- **Passed**: **400**
- **Skipped**: **1** (optional GPU/CUDA test on macOS)
- **Failed**: **0**
- **Regressions**: **0**

---

## 9. API & Team Handoff Specification

### Input Contract
- **Audio Format**: Float32 mono numpy array, raw PCM bytes, or file path.
- **Target Sample Rate**: `16000` Hz.
- **Chunk Duration**: Recommended `1000` ms (supported: 250 ms – 4000 ms).
- **Session Identification**: `session_id: str` (e.g. `"call_user123_sess01"`).
- **Speaker Context**: Optional `speaker_id: str` (e.g. `"user_alice"`).

### Output Contract (`StreamingInferenceResult`)
```json
{
  "session_id": "stream_call_42",
  "chunk_id": "3",
  "request_id": "stream_call_42_3",
  "timestamp": "2026-09-05T04:15:30.123456+00:00",
  "pipeline_version": "0.1.0",
  "speech_detected": true,
  "synthetic_probability": 0.0012,
  "smoothed_synthetic_probability": 0.0014,
  "speaker_similarity": 0.754,
  "smoothed_speaker_similarity": 0.658,
  "speaker_match": true,
  "transcript": "can bring back this.",
  "intent": "NORMAL",
  "intent_confidence": 0.70,
  "verdict": "genuine",
  "is_alert": false,
  "alert_reason": null,
  "processing_time_ms": 258.1,
  "real_time_factor": 0.258,
  "chunk_duration_ms": 1000.0,
  "stage_timings_ms": {
    "audio_decode_ms": 0.2,
    "vad_ms": 2.7,
    "deepfake_ms": 6.8,
    "speaker_verifier_ms": 26.1,
    "whisper_asr_ms": 221.5,
    "intent_detector_ms": 0.1,
    "total_pipeline_ms": 258.1
  }
}
```

---

## 10. Known Limitations

1. **Telephony Ingestion Sandbox**: The system processes ingested audio frames. It cannot directly intercept cellular audio from arbitrary phone calls due to mobile OS sandbox restrictions.
2. **Provisional Speaker Threshold**: The speaker similarity threshold of `0.70` is provisional and calibrated on empirical test pairs. A formal DET/EER evaluation on a dedicated multi-thousand speaker trial set is recommended before banking-grade biometric deployment.
3. **Sub-Second Utterances**: When speech chunks are shorter than 0.5s, speaker verification similarity is naturally lower due to minimal phonetic variability. The rolling 4.0s buffer mitigates this as conversation progresses.
4. **Whisper Language Auto-Detection**: In very short (< 0.5s) noisy speech fragments, Whisper language auto-detection can occasionally fluctuate before stabilizing on multi-second speech.

---

## 11. Final Status

# **READY — MEMBER 1 COMPLETE**
