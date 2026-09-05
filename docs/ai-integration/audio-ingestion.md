# Audio Ingestion & Normalization Architecture

## 1. Browser Microphone to Backend Ingestion

The audio ingestion layer bridges WebRTC / Web Audio API microphone streams in the browser to PyTorch neural network inputs.

```
Browser Microphone (MediaStream)
       │
       ▼ (AudioWorkletNode / ScriptProcessorNode)
16 kHz Mono 16-bit PCM Chunks (ArrayBuffer)
       │
       ▼ (WebSocket ws.send(binary))
FastAPI /ws/stream/{session_id}
       │
       ▼ (bytes payload)
AIAdapter.decode_input_audio(audio_data)
       │
       ▼
Numpy float32 array in [-1.0, 1.0] (16,000 samples)
       │
       ▼
Silero VAD / DeepfakeCNN / ECAPA-TDNN
```

---

## 2. In-Memory Normalization (`decode_input_audio`)

Located in `backend/platform/services/ai_adapter.py`:

```python
def decode_input_audio(self, audio_data: Union[bytes, np.ndarray, Path, str]) -> np.ndarray:
    if isinstance(audio_data, np.ndarray):
        if audio_data.dtype != np.float32:
            return audio_data.astype(np.float32)
        return audio_data

    if isinstance(audio_data, (str, Path)):
        wav, sr = load_audio(audio_data, target_sr=16000)
        return wav.astype(np.float32)

    if isinstance(audio_data, bytes):
        # 1. Inspect header for standard WAV container
        if audio_data[:4] == b"RIFF" and audio_data[8:12] == b"WAVE":
            try:
                wav, sr = sf.read(io.BytesIO(audio_data), dtype="float32")
                if wav.ndim > 1:
                    wav = wav.mean(axis=1)
                return wav
            except Exception as e:
                log.warning("[AIAdapter] soundfile failed to parse WAV: %s", e)

        # 2. Treat as raw 16-bit signed PCM (Little-Endian)
        try:
            pcm16 = np.frombuffer(audio_data, dtype=np.int16)
            float32_pcm = pcm16.astype(np.float32) / 32768.0
            return float32_pcm
        except Exception:
            pass

        # 3. Fallback: Write transient file and decode via Member 1 load_audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_data)
            tmp_path = Path(tmp.name)
        try:
            wav, sr = load_audio(tmp_path, target_sr=16000)
            return wav.astype(np.float32)
        finally:
            if tmp_path.exists():
                tmp_path.unlink()
```

### Why This Architecture was Chosen:
Member 1's `load_audio()` in `backend/audio/decoder.py` called `_validate_path(path)`, which strictly expects a filesystem path string or `Path` object and throws an error when passed a `BytesIO` buffer. Rather than violating the read-only rule on Member 1 code, `AIAdapter.decode_input_audio()` intercepts bytes in the Member 2 layer, decodes standard PCM/WAV in-memory via `soundfile` and `numpy`, and only uses a temporary file as a last resort.

---

## 3. Source Files Covered
- `backend/platform/services/ai_adapter.py`
- `backend/audio/decoder.py`
