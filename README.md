# VoiceCloneDetection-SIH

**Smart India Hackathon (SIH) — Real-Time Voice Clone Detection & Acoustic Forensics Pipeline**

[![Python 3.11+](https://img.shields.io/badge/python-3.11%20%7C%203.12%20%7C%203.14-blue.svg)](https://www.python.org/downloads/)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.x%20CPU%20%2F%20MPS-EE4C2C.svg)](https://pytorch.org/)
[![Tests](https://img.shields.io/badge/tests-400%2B%20passing-brightgreen.svg)](backend/tests/)
[![Status](https://img.shields.io/badge/member_1_pipeline-production_ready-success.svg)](docs/MEMBER1_COMPLETION_REPORT.md)

> **Member 1 Scope**: AI + Audio Intelligence Pipeline — Audio Preprocessing, Voice Clone / Deepfake Detection, Speaker Verification, ASR Transcription, Intent & Social Engineering Detection, Multidimensional Risk Engine, and Real-Time Streaming Ingestion.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Key Modules & Capabilities](#key-modules--capabilities)
- [Deepfake Detection Model Audit](#deepfake-detection-model-audit)
- [Multi-Factor Security Decision Matrix](#multi-factor-security-decision-matrix)
- [Project Directory Structure](#project-directory-structure)
- [Prerequisites & Installation](#prerequisites--installation)
- [Quickstart & Usage](#quickstart--usage)
  - [1. Batch Audio Inference](#1-batch-audio-inference)
  - [2. Speaker Enrollment & Verification](#2-speaker-enrollment--verification)
  - [3. Real-Time Streaming Pipeline](#3-real-time-streaming-pipeline)
  - [4. Streaming CLI Simulation](#4-streaming-cli-simulation)
- [Performance & Latency Telemetry](#performance--latency-telemetry)
- [API Output Contract](#api-output-contract)
- [Dataset Setup & Model Training](#dataset-setup--model-training)
- [Running Automated Tests](#running-automated-tests)
- [Team Integration & Responsibilities](#team-integration--responsibilities)
- [License & Operational Notice](#license--operational-notice)

---

## Overview

VoiceCloneDetection-SIH provides an end-to-end artificial intelligence and digital signal processing system engineered to detect voice clones, synthetic speech deepfakes, and social engineering fraud in telephony and audio streams. 

Unlike naive acoustic classifiers that rely on a single score, this pipeline combines:
1. **Silero Voice Activity Gating** to bypass silence with ~5ms latency.
2. **DeepfakeCNN v2** trained on ASVspoof 2019 LA achieving **99.18% accuracy** and **0.975% Equal Error Rate (EER)**.
3. **SpeechBrain ECAPA-TDNN** 192-dimensional speaker biometric embeddings for identity verification.
4. **faster-whisper (CTranslate2)** CPU-quantized automatic speech recognition.
5. **Rule-Based Intent Analysis** flagging OTP extraction, urgent monetary transfers, and credential harvesting.
6. **Unified Security Risk Engine** evaluating joint biometric, acoustic, and behavioral indicators.
7. **Real-Time Streaming Engine** supporting bounded rolling buffers, exponential moving average (EMA) smoothing, and instantaneous alert escalation.

---

## System Architecture

### Real-Time Streaming & Inference Architecture

```
                    Incoming Audio Stream (WebRTC / WebSocket / File)
                                          │
                                          ▼
                         ┌──────────────────────────────────┐
                         │    Audio Decoding & Resampling   │  backend/audio/decoder.py
                         │   16 kHz Mono float32 [-1.0, 1.0]│  backend/audio/preprocessing.py
                         └──────────────────────────────────┘
                                          │
                                          ▼
                         ┌──────────────────────────────────┐
                         │        Silero VAD Gating         │  backend/audio/vad.py
                         │    Speech Activity Detection     │
                         └────────────────┬─────────────────┘
                                          │
              ┌───────────────────────────┴───────────────────────────┐
              │ Silence (ratio == 0.0)                                │ Speech Detected
              ▼                                                       ▼
┌─────────────────────────────┐                         ┌─────────────────────────────┐
│    Fast Early-Exit (~5ms)   │                         │ Bounded Rolling Audio Buffer│ (Max 4.0s / 64k samples)
│  Downstream Models Bypassed │                         └──────────────┬──────────────┘
└─────────────┬───────────────┘                                        │
              │                                ┌───────────────────────┼───────────────────────┐
              │                                ▼                       ▼                       ▼
              │                     ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
              │                     │  DeepfakeCNN v2  │    │  ECAPA-TDNN SPK  │    │  faster-whisper  │
              │                     │ 80-bin Log-Mel   │    │ 192-D Biometric  │    │ CTranslate2 int8 │
              │                     │ 585k params      │    │  Unit Vector     │    │ Speech to Text   │
              │                     └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
              │                              │                       │                       │
              │                              │                       ▼                       ▼
              │                              │              ┌──────────────────┐    ┌──────────────────┐
              │                              │              │Cosine Similarity │    │  IntentDetector  │
              │                              │              │ vs Enrolled Ref  │    │ Fraud / OTP /    │
              │                              │              └────────┬─────────┘    │ Wire Transfer    │
              │                              │                       │              └────────┬─────────┘
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
              │                                     │  Multidimensional Risk Engine    │
              │                                     │  SAFE / LOW / MED / HIGH / CRIT  │
              │                                     └────────────────┬─────────────────┘
              │                                                      │
              └───────────────────────────────┬──────────────────────┘
                                              ▼
                               ┌─────────────────────────────┐
                               │  StreamingInferenceResult   │
                               │  Standard JSON Output API   │
                               └─────────────────────────────┘
```

---

## Key Modules & Capabilities

| Stage | Module | Key Technology | Role & Performance |
|---|---|---|---|
| **Audio Decoding** | `backend/audio/decoder.py` | FFmpeg subprocess + SoundFile fallback | Decodes WAV, FLAC, MP3, WebM, OGG to raw PCM float32 with peak clipping protection. |
| **Preprocessing** | `backend/audio/preprocessing.py` | NumPy / SciPy | Channel folding to mono, resample to 16 kHz, validation, natural gain preservation. |
| **VAD Gating** | `backend/audio/vad.py` | Silero VAD v4/v5 (`torch.hub`) | Fast speech activity gating. Silence chunks early-exit in **~2.5 ms**, skipping heavy neural models. |
| **Deepfake Detection** | `backend/models/deepfake_v2/` | `DeepfakeCNN` (80-bin Log-Mel) | **99.18% accuracy, 0.975% EER** on ASVspoof 2019 LA. Model checkpoint: `checkpoints/deepfake_v2_asvspoof2019_la.pt`. |
| **Alternative Deepfake** | `backend/models/deepfake_detector.py` | HuggingFace Wav2Vec2 | Pretrained transformer anti-spoofing backbone (`Vansh180/deepfake-audio-wav2vec2`). |
| **Speaker Biometrics** | `backend/models/speaker_verifier.py` | SpeechBrain ECAPA-TDNN | Extracts 192-dimensional unit-norm embeddings. Computes cosine similarity against enrolled profile. |
| **Speaker Enrollment** | `backend/models/speaker_enrollment.py` | Mean-aggregation + L2 norm | Multi-sample enrollment engine with internal variance checking and filesystem/in-memory persistence. |
| **Speech-to-Text** | `backend/models/asr_base.py`, `whisper_asr.py`, `google_stt_asr.py` | `faster-whisper` (local int8) OR Google Cloud STT | Swappable ASR provider architecture (`ASR_PROVIDER=whisper` or `ASR_PROVIDER=google`) outputting standardized `ASRResult`. |
| **Intent Detection** | `backend/intent/intent_detector.py` | Regex & Keyword Classifier | Flags `PAYMENT_TRANSFER`, `OTP_REQUEST`, `CREDENTIAL_REQUEST`, and `URGENT_REQUEST` threats. |
| **Security Risk Engine** | `backend/pipeline/risk_engine.py` | Multi-criteria Security Matrix | Synthesizes acoustic synthesis probability, biometric similarity, and intent into actionable decisions. |
| **Streaming Pipeline** | `backend/pipeline/streaming_pipeline.py` | Chunked Engine + Rolling Buffer | Sub-second chunk processing (RTF ~0.25 on CPU), EMA score smoothing, fast alert escalation ($\ge 0.85$). |


---

## Deepfake Detection Model Audit

The primary deepfake detector (`DeepfakeCNN` v2) was trained and evaluated on official partitions:

- **Architecture**: 4 Residual Convolutional Blocks (Conv2d, BatchNorm2d, ReLU, MaxPool2d) + Global Adaptive Average Pooling `AdaptiveAvgPool2d((1, 1))` + 3-layer MLP classifier head with Dropout(0.3).
- **Parameter Count**: **585,826 parameters** (all trainable, verified via tensor inspection).
- **Feature Space**: 80-channel Log-Mel Spectrograms ($f_{\min}=20$ Hz, $f_{\max}=8000$ Hz, $n_{\text{fft}}=400$, hop length = 160 samples).
- **Training Set**: Official ASVspoof 2019 Logical Access (LA) train partition (25,380 FLAC files; 2,580 bona fide, 22,800 spoof).
- **Validation Set**: Official ASVspoof 2019 LA dev partition (24,844 FLAC files; 2,548 bona fide, 22,296 spoof).
- **Official Evaluation Set**: Completely untouched (71,933 files held in reserve, zero leakage).
- **Metrics on Full ASVspoof 2019 LA Dev Set**:
  - **Accuracy**: **99.175%**
  - **ROC-AUC**: **99.942%**
  - **Equal Error Rate (EER)**: **0.975%** (at threshold 0.649)
  - **Spoof Recall**: **99.255%**
  - **Bona Fide Recall**: **98.469%**
- **Production Checkpoint**: `checkpoints/deepfake_v2_asvspoof2019_la.pt` (epoch 7 best model).

---

## Multi-Factor Security Decision Matrix

The pipeline follows a strict security invariant: **Deepfake synthesis detection strictly overrides speaker similarity.** (Because a high-quality voice clone can produce high biometric similarity, speaker match alone can never validate identity).

| Scenario | Enrolled Match | Synthetic Prob | Intent Trigger | Verdict | Risk Tier | Action |
|---|---|---|---|---|---|---|
| **Genuine Enrolled Speaker** | Yes ($\text{sim} \ge 0.70$) | Low ($< 0.50$) | Normal | `genuine` | `SAFE` | `ALLOW` |
| **Suspicious Enrolled Speaker** | Yes ($\text{sim} \ge 0.70$) | Low ($< 0.50$) | OTP / Wire Fraud | `genuine` | `MEDIUM` | `REQUIRE_ADDITIONAL_VERIFICATION` |
| **Imposter (Human Impersonator)**| No ($\text{sim} < 0.70$) | Low ($< 0.50$) | Any | `imposter` | `HIGH` | `VERIFY_SPEAKER` |
| **AI Clone of Enrolled Speaker** | Yes or No | High ($\ge 0.50$) | Any | `cloned` | `CRITICAL` | `BLOCK_OR_ESCALATE` |
| **Unknown Synthetic Audio** | Unenrolled / No Ref | High ($\ge 0.50$) | Any | `cloned` | `CRITICAL` | `BLOCK_OR_ESCALATE` |
| **Unenrolled Natural Speaker** | Unenrolled / No Ref | Low ($< 0.50$) | Normal | `inconclusive` | `LOW` | `MONITOR` |
| **Silent or Corrupted Stream** | N/A | N/A | None | `inconclusive` | `SAFE` | `MONITOR` |

---

## Project Directory Structure

```
VoiceCloneDetection-SIH/
├── backend/
│   ├── audio/
│   │   ├── __init__.py
│   │   ├── decoder.py              # Low-level FFmpeg & SoundFile audio loader
│   │   ├── preprocessing.py        # 16 kHz mono resampling, normalization & guards
│   │   └── vad.py                  # Silero VAD v4/v5 speech boundary gating
│   ├── models/
│   │   ├── __init__.py
│   │   ├── deepfake_v2/            # DeepfakeCNN v2 implementation
│   │   │   ├── model.py            # 585k-param ResNet-style CNN architecture
│   │   │   ├── features.py         # 80-bin Log-Mel spectrogram extractor
│   │   │   ├── dataset.py          # ASVspoof PyTorch Dataset loader
│   │   │   ├── inference.py        # DeepfakeV2Detector inference wrapper
│   │   │   └── trainer.py          # Training loop with EER / AUC calculation
│   │   ├── deepfake_detector.py    # Pretrained HuggingFace Wav2Vec2 detector
│   │   ├── speaker_verifier.py     # SpeechBrain ECAPA-TDNN 192-D embeddings
│   │   ├── speaker_enrollment.py   # Multi-sample speaker enrollment service
│   │   ├── speaker_repository.py   # In-memory & local filesystem profile stores
│   │   ├── whisper_asr.py          # faster-whisper CTranslate2 CPU ASR
│   │   └── transcriber.py          # ASR adapter interface
│   ├── intent/
│   │   ├── __init__.py
│   │   ├── intent_detector.py      # Production fraud, OTP & coercion intent engine
│   │   └── detector.py             # Keyword mapping adapter
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── inference_pipeline.py   # Unified batch end-to-end pipeline
│   │   ├── streaming_pipeline.py   # Real-time chunked streaming pipeline (WebRTC/WS)
│   │   ├── risk_engine.py          # Multidimensional security decision engine
│   │   └── runner.py               # Pipeline runner wrapper
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── inference_result.py     # Typed InferenceResult & telemetry dataclasses
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── config.py               # Central PipelineConfig & thresholds
│   │   └── logger.py               # Structured logging setup
│   └── tests/                      # 400+ automated pytest test suite
│       ├── test_imports.py
│       ├── test_vad.py
│       ├── test_whisper_asr.py
│       ├── test_deepfake_v2_smoke.py
│       ├── test_deepfake_v2_asvspoof2019.py
│       ├── test_speaker_verifier.py
│       ├── test_speaker_enrollment.py
│       ├── test_intent_detector.py
│       ├── test_risk_engine.py
│       ├── test_inference_pipeline.py
│       ├── test_streaming_pipeline.py
│       └── test_streaming_real_audio.py
├── checkpoints/
│   ├── deepfake_v2_asvspoof2019_la.pt      # Production trained checkpoint (Epoch 7)
│   ├── deepfake_v2_asvspoof2019_la.metadata.json
│   └── best_model.pt
├── data/                                   # Datasets (ASVspoof protocols and audio)
├── docs/
│   └── MEMBER1_COMPLETION_REPORT.md        # Comprehensive verification report
├── samples/                                # Demo WAV/FLAC audio samples
├── scripts/
│   ├── simulate_streaming.py               # CLI tool simulating streaming chunks
│   ├── train_deepfake_v2.py                # Deepfake training harness
│   └── verify_asvspoof5.py                 # Dataset integrity & protocol validator
├── pyproject.toml
├── requirements.txt
└── README.md
```

---

## Prerequisites & Installation

### 1. System Requirements

- **Python**: 3.11, 3.12, or 3.14 (tested on macOS and Linux).
- **FFmpeg**: Required for decoding compressed audio formats (MP3, WebM, OGG, Opus).

```bash
# macOS (Homebrew)
brew install ffmpeg

# Ubuntu / Debian
sudo apt update && sudo apt install -y ffmpeg

# Verify installation
ffmpeg -version
```

### 2. Python Environment Setup

```bash
# 1. Clone the repository
git clone https://github.com/Sivasankari1708/VoiceCloneDetection-SIH.git
cd VoiceCloneDetection-SIH

# 2. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 3. Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Install local package in editable mode
pip install -e .
```

---

## Quickstart & Usage

### 1. Batch Audio Inference

Process any audio file end-to-end with a single call:

```python
from backend.pipeline.inference_pipeline import InferencePipeline

# Initialize pipeline (loads models once into memory)
pipeline = InferencePipeline()

# Process an audio file
result = pipeline.process(
    audio_path="samples/genuine/sample1.wav",
    speaker_id="user_alice",  # Optional: compares with enrolled speaker profile
)

# Output summary
print(f"Verdict: {result.verdict}")
print(f"Synthetic Probability: {result.deepfake.synthetic_probability:.4f}")
print(f"Speaker Similarity: {result.speaker.speaker_similarity}")
print(f"Transcript: {result.transcription.transcript}")
print(f"Intent: {result.intent.intent} (Confidence: {result.intent.confidence})")

# Export as JSON-serializable dictionary
result_dict = result.to_dict()
```

---

### 2. Speaker Enrollment & Verification

Enroll authorized speakers using reference voice samples:

```python
from backend.models.speaker_enrollment import SpeakerEnrollmentService
from backend.models.speaker_repository import LocalSpeakerRepository
from backend.models.speaker_verifier import SpeakerVerifier

# Initialize repository and enrollment service
verifier = SpeakerVerifier.load()
repository = LocalSpeakerRepository(base_dir="data/enrolled_speakers")
enrollment_service = SpeakerEnrollmentService(verifier=verifier, repository=repository)

# Enroll a speaker with one or more audio files
profile = enrollment_service.enroll(
    speaker_id="employee_042",
    audio_paths=[
        "samples/genuine/alice_enroll_1.wav",
        "samples/genuine/alice_enroll_2.wav",
        "samples/genuine/alice_enroll_3.wav",
    ],
    metadata={"department": "Finance", "role": "Authorized Approver"}
)

print(f"Enrolled {profile.speaker_id} with {profile.num_samples} samples.")
```

---

### 3. Real-Time Streaming Pipeline

The `StreamingAudioPipeline` ingests live chunks (e.g. from WebRTC or WebSocket adapters) maintaining session state and temporal EMA smoothing:

```python
import numpy as np
from backend.pipeline.streaming_pipeline import StreamingAudioPipeline, StreamingConfig

# Configure streaming parameters
config = StreamingConfig(
    chunk_duration_ms=1000,
    rolling_buffer_seconds=4.0,  # Bounded receptive field
    ema_alpha=0.35,              # Temporal smoothing factor
    fast_alert_threshold=0.85,   # Instant escalation threshold
)

streaming_pipeline = StreamingAudioPipeline(config=config)
session_id = "call_session_98765"

# Process ingested 1-second audio chunk (16,000 float32 samples @ 16 kHz)
audio_chunk = np.zeros(16000, dtype=np.float32)

chunk_result = streaming_pipeline.process_chunk(
    session_id=session_id,
    chunk_data=audio_chunk,
    speaker_id="employee_042",
)

if chunk_result.is_alert:
    print(f"🚨 ALERT RAISED: {chunk_result.alert_reason}")
    print(f"Raw Synthetic Score: {chunk_result.synthetic_probability:.4f}")
    print(f"Smoothed Score: {chunk_result.smoothed_synthetic_probability:.4f}")
```

---

### 4. Streaming CLI Simulation

Simulate streaming an audio file chunk-by-chunk to observe near-real-time telemetry, VAD gating, and detector output:

```bash
# Stream an audio file in 1000ms chunks with real-time playback pace
python scripts/simulate_streaming.py --audio samples/genuine/test.wav

# Stream against an enrolled speaker identity
python scripts/simulate_streaming.py --audio samples/cloned/spoof.wav --speaker-id employee_042

# Fast benchmark mode (500ms chunks, no sleep delay)
python scripts/simulate_streaming.py --audio samples/genuine/test.wav --chunk-ms 500 --no-sleep
```

---

## ASR Provider Configuration (Whisper vs. Google Cloud STT)

VoiceShield features a clean, pluggable ASR provider abstraction (`backend/models/asr_base.py`) allowing seamless toggling between local offline transcription and real-time cloud streaming speech-to-text.

### Provider Comparison & Privacy Boundaries

| Capability / Attribute | `ASR_PROVIDER=whisper` (Local Default) | `ASR_PROVIDER=google` (Optional Cloud) |
|---|---|---|
| **Execution Environment** | **100% Local (On-Device / CPU)** | **Google Cloud Speech-to-Text API** |
| **Network Requirement** | Zero network required (fully offline) | Outbound HTTPS/gRPC network required |
| **Audio Privacy** | Audio never leaves the local machine | Raw speech chunks transmitted to Google Cloud STT |
| **Quantization & Speed** | CTranslate2 `int8` CPU inference (~200ms) | Low-latency bidirectional gRPC streaming |
| **Interim Hypotheses** | Segmented rolling-window diffing | Native Google streaming `is_final` handling |
| **Supported Languages** | English (or multilingual Whisper models) | Configurable BCP-47 (`en-IN`, `hi-IN`, `ta-IN`, etc.) |
| **Remaining Pipeline** | DeepfakeCNN & ECAPA remain 100% local | DeepfakeCNN & ECAPA remain 100% local |

> [!IMPORTANT]
> **Strict Security Isolation**: Only speech audio chunks are transmitted to Google Cloud STT. Deepfake detection (DeepfakeCNN v2), speaker verification (SpeechBrain ECAPA-TDNN), Intent Extraction, Risk Scoring, Security Policies, Incidents, and SOC feeds remain strictly executed locally inside the VoiceShield backend.

---

### Configuring Google Cloud STT

#### 1. Authenticate with Google Cloud Application Default Credentials (ADC)
Ensure the Google Cloud CLI (`gcloud`) is installed and authenticated locally:

```bash
# Authenticate local development environment
gcloud auth application-default login

# Ensure the Speech-to-Text API is enabled in your active GCP project:
gcloud services enable speech.googleapis.com
```

> [!NOTE]
> VoiceShield uses Application Default Credentials (ADC). **Never commit service account JSON files or API keys** to source control.

#### 2. Configure Environment Variables
Set the active provider in `.env` (or via environment variables):

```bash
# Enable Google Cloud Speech-to-Text as active provider
ASR_PROVIDER=google

# Set target language (default is Indian English: en-IN)
ASR_LANGUAGE=en-IN
```

Supported language codes include `en-IN`, `en-US`, `hi-IN`, `ta-IN`, `te-IN`, `kn-IN`, and `ml-IN`.

---

### Switching Back to Local Whisper
To switch back to offline local Whisper inference at any time:

```bash
ASR_PROVIDER=whisper
```
No code changes are required.

---

### Running the Live Microphone Test in the User Frontend

1. **Start the VoiceShield Backend**:
   ```bash
   cd backend
   uvicorn backend.platform.server.app:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Start the Frontend**:
   ```bash
   cd user_frontend
   npm run dev
   ```

3. **Open the Frontend**:
   - Navigate to `http://localhost:5174` (or your Vite dev server port).
   - Click **Live Call / Call Simulation**.
   - Speak naturally into the browser microphone:
     - *"Hello, I am testing the VoiceShield system using my real human voice."*
     - *"Okay, thank you. Bye."*
   - Watch the live speech appear instantaneously in the **LIVE TRANSCRIPT** panel without duplication.

---

## Performance & Latency Telemetry


Benchmark measured on **Apple Silicon (M-series / CPU execution)** under Python 3.14:

| Pipeline Stage | Silence Chunk (1000 ms) | Speech Chunk (1000 ms) | Architectural Role |
|---|---|---|---|
| Audio Decode & Validation | 0.2 ms | 0.3 ms | Mono 16 kHz conversion |
| Silero VAD | 2.5 ms | 2.7 ms | Speech detection & gating |
| DeepfakeCNN v2 | *Bypassed (0 ms)* | 6.5 ms | 80-bin Mel CNN feature extraction |
| ECAPA-TDNN Speaker Verifier | *Bypassed (0 ms)* | 25.0 ms | 192-D embedding extraction |
| faster-whisper (tiny int8) | *Bypassed (0 ms)* | 215.0 ms | Quantized CPU ASR |
| Intent Detection | *Bypassed (0 ms)* | 0.1 ms | Regex indicator scanner |
| **Total Chunk Latency** | **~5.5 ms** | **~250.0 ms** | **Per 1-second audio frame** |
| **Real-Time Factor (RTF)** | **~0.005** | **~0.250** | **4x to 40x faster than real-time** |

---

## API Output Contract

Every pipeline execution returns a structured, JSON-serializable `StreamingInferenceResult` / `InferenceResult`:

```json
{
  "session_id": "call_sess_89123",
  "chunk_id": "3",
  "request_id": "call_sess_89123_chunk_3",
  "timestamp": "2026-09-05T06:14:22.105432+00:00",
  "pipeline_version": "0.1.0",
  "speech_detected": true,
  "synthetic_probability": 0.0012,
  "smoothed_synthetic_probability": 0.0015,
  "speaker_similarity": 0.884,
  "smoothed_speaker_similarity": 0.852,
  "speaker_match": true,
  "transcript": "Hello, please authorize the wire transfer immediately.",
  "intent": "PAYMENT_TRANSFER",
  "intent_confidence": 0.90,
  "verdict": "genuine",
  "risk_tier": "MEDIUM",
  "recommended_action": "REQUIRE_ADDITIONAL_VERIFICATION",
  "is_alert": false,
  "alert_reason": null,
  "processing_time_ms": 254.2,
  "real_time_factor": 0.254,
  "chunk_duration_ms": 1000.0,
  "stage_timings_ms": {
    "audio_decode_ms": 0.2,
    "vad_ms": 2.6,
    "deepfake_ms": 6.7,
    "speaker_verifier_ms": 24.8,
    "whisper_asr_ms": 219.8,
    "intent_detector_ms": 0.1,
    "total_pipeline_ms": 254.2
  }
}
```

---

## Dataset Setup & Model Training

### ASVspoof 2019 Logical Access (LA)

The production checkpoint `checkpoints/deepfake_v2_asvspoof2019_la.pt` is already pre-trained and ready to use. If you wish to retrain or fine-tune:

1. Download the ASVspoof 2019 LA partition from [Zenodo / ASVspoof](https://www.asvspoof.org/).
2. Extract to `data/asvspoof2019/LA/`.
3. Train using `scripts/train_deepfake_v2.py`:

```bash
python scripts/train_deepfake_v2.py \
    --data-dir data/asvspoof2019/LA \
    --epochs 10 \
    --batch-size 32 \
    --lr 0.0001
```

### ASVspoof 5 Setup

To evaluate or train on ASVspoof 5 Track 1:

1. Download Track 1 from [Zenodo Record 14498691](https://zenodo.org/records/14498691).
2. Unpack into `data/asvspoof5/`:
   - `data/asvspoof5/protocols/ASVspoof5.train.tsv`
   - `data/asvspoof5/protocols/ASVspoof5.dev.track_1.tsv`
   - `data/asvspoof5/flac_T/`
   - `data/asvspoof5/flac_D/`
3. Verify integrity:
```bash
python scripts/verify_asvspoof5.py
```

---

## Running Automated Tests

The repository contains a test suite covering unit operations, real audio integration, streaming concurrency, and risk engine logic:

```bash
# Run all tests
pytest backend/tests/ -v

# Run risk engine tests
pytest backend/tests/test_risk_engine.py -v

# Run streaming pipeline tests
pytest backend/tests/test_streaming_pipeline.py backend/tests/test_streaming_real_audio.py -v

# Run with test coverage report
pytest --cov=backend backend/tests/
```

**Status**: **401 tests collected, 400 passed, 1 skipped** (optional CUDA GPU check on macOS), **0 failed**.

---

## Team Integration & Responsibilities

| Team Member | Domain | Interface Point with Member 1 |
|---|---|---|
| **Member 1 (This Repo)** | **AI + Audio Pipeline** | Produces `InferencePipeline`, `StreamingAudioPipeline`, `InferenceResult` contract. |
| **Member 2** | Spring Boot REST / WS API | Wraps `process_audio()` or WebSocket streaming bridge; deserializes `InferenceResult` JSON. |
| **Member 3** | Frontend (React / Flutter) | Displays live biometric gauge, deepfake waveform alert, transcript, and risk actions. |
| **Member 4** | PostgreSQL + Redis | Stores enrolled speaker profile metadata, session logs, and fraud incident telemetry. |
| **Member 5** | WebRTC / Audio Ingestion | Forwards ingested 16 kHz audio frames into the streaming session queue. |
| **Member 6** | DevOps & Deployment | Containerizes Python pipeline via Docker; orchestrates CPU/GPU workers. |

---

## License & Operational Notice

- **Project**: Smart India Hackathon (SIH) Voice Clone Detection.
- **License**: Internal Hackathon and Educational Use.
- **Operational Sandbox Notice**: This pipeline processes audio streams delivered via authorized APIs, WebRTC, or uploaded files. In compliance with mobile operating system security models, it does not intercept cellular baseband hardware or arbitrary third-party phone calls.
