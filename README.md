# VoiceCloneDetection-SIH

**Smart India Hackathon (SIH) Project — AI + Audio Pipeline**

> Member 1 scope: Audio preprocessing, Voice Clone Detection, Speaker Verification, ASR, Intent Detection.

---

## Pipeline Architecture

```
Audio File
   │
   ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. FFmpeg Decoding          backend/audio/decoder.py            │
│     • Any format → mono float32 PCM @ 16 kHz                    │
│     • Peak normalisation                                         │
├──────────────────────────────────────────────────────────────────┤
│  2. Silero VAD               backend/audio/vad.py                │
│     • Detects speech segments, strips silence                    │
├──────────────────────────────────────────────────────────────────┤
│  3. Deepfake Detection       backend/models/deepfake_detector.py │
│     • Pretrained anti-spoofing model (RawNet2 / AASIST)         │
│     • Returns: score (0–1), label: "genuine" | "cloned"         │
├──────────────────────────────────────────────────────────────────┤
│  4. Speaker Verification     backend/models/speaker_verifier.py  │
│     • SpeechBrain ECAPA-TDNN (spkrec-ecapa-voxceleb)            │
│     • Returns: embedding, cosine similarity, same_speaker bool   │
├──────────────────────────────────────────────────────────────────┤
│  5. ASR Transcription        backend/models/transcriber.py       │
│     • faster-whisper (CTranslate2, CPU int8 quantised)          │
│     • Returns: text, language, word-level segments               │
├──────────────────────────────────────────────────────────────────┤
│  6. Intent Detection         backend/intent/detector.py          │
│     • Keyword / rule-based (no ML model needed)                  │
│     • Intents: verify_identity, financial_request, emergency, …  │
├──────────────────────────────────────────────────────────────────┤
│  7. InferenceResult          backend/schemas/inference_result.py │
│     • Standardised JSON-serialisable output contract             │
│     • Verdict: genuine | cloned | imposter | inconclusive        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
VoiceCloneDetection-SIH/
├── backend/
│   ├── __init__.py
│   ├── audio/
│   │   ├── __init__.py
│   │   ├── decoder.py          # FFmpeg decode + normalization
│   │   └── vad.py              # Silero VAD
│   ├── models/
│   │   ├── __init__.py
│   │   ├── deepfake_detector.py   # Anti-spoofing model
│   │   ├── speaker_verifier.py    # ECAPA-TDNN
│   │   └── transcriber.py         # faster-whisper
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── inference_result.py    # InferenceResult dataclass
│   ├── pipeline/
│   │   ├── __init__.py
│   │   └── runner.py              # End-to-end orchestrator
│   ├── intent/
│   │   ├── __init__.py
│   │   └── detector.py            # Keyword-based intent detection
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── logger.py              # Centralised logging (IMPLEMENTED)
│   │   └── config.py              # PipelineConfig (IMPLEMENTED)
│   └── tests/
│       ├── __init__.py
│       └── test_imports.py        # Import smoke tests (IMPLEMENTED)
│
├── samples/
│   ├── genuine/                # Real human voice samples
│   ├── cloned/                 # AI/TTS-generated clone samples
│   └── imposter/               # Human impersonation samples
│
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Prerequisites

### System Dependencies

| Dependency | Status | Install |
|------------|--------|---------|
| Python 3.11–3.12 | ✅ (3.14 on dev) | [python.org](https://python.org) |
| pip | ✅ | bundled with Python |
| **FFmpeg** | ⚠️ **NOT INSTALLED** | `brew install ffmpeg` (macOS) |

> **⚠️ FFmpeg must be installed before any audio processing.**
> ```bash
> # macOS
> brew install ffmpeg
>
> # Ubuntu / Debian
> sudo apt update && sudo apt install ffmpeg
>
> # Verify
> ffmpeg -version
> ```

### Python Environment Setup

```bash
# 1. Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# 2. Upgrade pip
pip install --upgrade pip

# 3. Install dependencies
pip install -r requirements.txt
```

---

## Running Tests

```bash
# From project root
python backend/tests/test_imports.py

# Or with pytest
python -m pytest backend/tests/test_imports.py -v
```

---

## ASVspoof 5 Dataset Setup & Deepfake v2 Training

> **IMPORTANT**: Deepfake v2 currently has uninitialized/random weights. No trained Deepfake v2 checkpoint exists yet.
> Deepfake v2 remains **UNTRAINED** until the real ASVspoof 5 dataset is downloaded and the training script is executed on real data.
> Note that `data/asvspoof2019/LA.zip` is ASVspoof 2019 and **cannot** be used for Deepfake v2 training.

### 1. Where to Obtain ASVspoof 5
ASVspoof 5 Track 1 is hosted on Zenodo:
- **Zenodo Record**: [https://zenodo.org/records/14498691](https://zenodo.org/records/14498691)
- **Official Portal**: [ASVspoof 5 Challenge (CodaLab / asvspoof.org)](https://www.asvspoof.org/)

### 2. Partitions Required
To train and validate Deepfake v2, you need both Track 1 partitions:
- **Training Partition**:
  - Protocol: `ASVspoof5.train.tsv` (10-column TSV format)
  - Audio: `flac_T.tar` (contains training FLAC audio files)
- **Validation / Development Partition**:
  - Protocol: `ASVspoof5.dev.track_1.tsv` (or `ASVspoof5.dev.tsv`)
  - Audio: `flac_D.tar` (contains development FLAC audio files)

### 3. Expected Directory Structure
Unpack the downloaded files into `data/asvspoof5/` following this exact layout:

```
data/asvspoof5/
├── protocols/
│   ├── ASVspoof5.train.tsv         # Training protocol
│   └── ASVspoof5.dev.track_1.tsv   # Development / validation protocol
├── flac_T/                         # Training audio files (.flac)
│   ├── T_1000000001.flac
│   ├── T_1000000002.flac
│   └── ...
└── flac_D/                         # Development audio files (.flac)
    ├── D_1000000001.flac
    ├── D_1000000002.flac
    └── ...
```

### 4. How to Verify Dataset Integrity
Before starting training, run the verification script:

```bash
python scripts/verify_asvspoof5.py
```

The script verifies:
- Dataset root, protocol files, and audio directories exist.
- Protocol records resolve to real FLAC files on disk.
- Bonafide and spoof sample counts and percentages.
- Audio properties (16 kHz, mono float32).
- Returns exit code `0` only if the dataset is 100% complete, or exits `1` with exact missing references.

### 5. Training Command (Once Dataset is Verified)
Once `verify_asvspoof5.py` reports `SUCCESS`, run training:

```bash
# Full training run
python scripts/train_deepfake_v2.py --data-dir data/asvspoof5 --epochs 10 --batch-size 32

# Debug / smoke training on a small subset of real samples
python scripts/train_deepfake_v2.py --data-dir data/asvspoof5 --limit-train 100 --limit-dev 50 --epochs 1
```

---

## Models Used (Pretrained — No Training Required)

| Stage | Model | Source | CPU-Compatible |
|-------|-------|--------|----------------|
| VAD | Silero VAD v4 | `torch.hub` | ✅ |
| Deepfake Detection | RawNet2 / AASIST | HuggingFace | ✅ |
| Speaker Verification | ECAPA-TDNN | `speechbrain/spkrec-ecapa-voxceleb` | ✅ |
| ASR | Whisper (base/small) | `faster-whisper` + CTranslate2 | ✅ (int8) |

All models download automatically on first run to `~/.cache/huggingface/` or `~/.cache/torch/`.

---

## InferenceResult Contract

The pipeline always returns a single `InferenceResult` object:

```python
from backend.schemas.inference_result import InferenceResult

# Fields:
result.verdict           # "genuine" | "cloned" | "imposter" | "inconclusive"
result.deepfake.score    # float 0–1 (1 = genuine)
result.deepfake.label    # "genuine" | "cloned"
result.speaker.cosine_score   # cosine similarity to reference speaker
result.transcription.text     # full transcript string
result.intent.intent          # detected intent string
result.to_dict()         # JSON-serialisable dict
```

---

## Implementation Status

| Component | File | Status |
|-----------|------|--------|
| Logger | `utils/logger.py` | ✅ Implemented |
| Config | `utils/config.py` | ✅ Implemented |
| Schema | `schemas/inference_result.py` | ✅ Implemented |
| Smoke Tests | `tests/test_imports.py` | ✅ Implemented |
| FFmpeg decoder | `audio/decoder.py` | 🔲 Stub |
| Silero VAD | `audio/vad.py` | 🔲 Stub |
| Deepfake Detector | `models/deepfake_detector.py` | 🔲 Stub |
| Speaker Verifier | `models/speaker_verifier.py` | 🔲 Stub |
| Transcriber | `models/transcriber.py` | 🔲 Stub |
| Pipeline Runner | `pipeline/runner.py` | 🔲 Stub |
| Intent Detector | `intent/detector.py` | 🔲 Stub |

---

## Team Responsibility Split

> This repository covers **Member 1 scope only**.

| Member | Responsibility |
|--------|---------------|
| **Member 1 (this repo)** | AI + Audio Pipeline (Python) |
| Member 2 | Spring Boot REST API |
| Member 3 | Frontend (React / Flutter) |
| Member 4 | PostgreSQL + Redis |
| Member 5 | WebRTC / Real-time streaming |
| Member 6 | DevOps / Deployment |

Integration point: Member 2's Spring Boot service calls `PipelineRunner.run()` (or its future REST wrapper) and receives a serialised `InferenceResult` JSON.

---

## License

SIH Hackathon Project — Internal use only.
