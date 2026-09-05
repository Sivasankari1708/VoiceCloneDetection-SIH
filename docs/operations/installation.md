# Operations: Installation & Setup Guide

This document outlines the dependencies and installation steps required to run the Member 2 Backend Platform.

---

## 1. System Requirements

- **Operating System**: macOS (Apple Silicon / Intel), Linux (Ubuntu 20.04+), or Windows 10/11 with WSL2.
- **Python Version**: Python 3.10 or 3.11 (Python 3.11 recommended).
- **C/C++ Build Tools**: Required for compiling certain audio libraries (`libsndfile`, `ffmpeg`).
- **Memory**: Minimum 4 GB RAM (8 GB+ recommended for running Whisper & ECAPA in-memory).

---

## 2. Installation Steps

### Step 1: Clone Repository
```bash
git clone https://github.com/Sivasankari1708/VoiceCloneDetection-SIH.git
cd VoiceCloneDetection-SIH
```

### Step 2: Create and Activate Virtual Environment
```bash
python3.11 -m venv .venv
source .venv/bin/activate
```

### Step 3: Install Core Dependencies
Install the required platform and machine learning libraries:
```bash
pip install --upgrade pip
pip install fastapi uvicorn[standard] sqlalchemy pydantic pyjwt soundfile librosa numpy torch websockets
```

*(Note: If faster-whisper or speechbrain dependencies are missing, ensure all Member 1 requirements are installed as well).*

### Step 4: Verify Database Initialization
Run the initialization check:
```bash
python -c "from backend.platform.db.session import init_db; init_db()"
```
This creates all tables in the local SQLite database (`voice_clone_detection.db`) or connected PostgreSQL instance.
