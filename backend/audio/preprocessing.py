"""
backend/audio/preprocessing.py
===============================
High-level audio preprocessing layer.

Responsibility
--------------
Accept an audio file path (or a raw numpy waveform) and produce a
*standardised* waveform that every downstream pipeline stage can
consume without any additional conversion:

    • 1-D (mono)
    • 16 000 Hz sample rate
    • float32 dtype
    • peak-normalised to [-1, +1]  (with safe handling of silence)

Public API
----------
    preprocess_audio(path)              -> np.ndarray
    normalize_waveform(waveform)        -> np.ndarray
    validate_waveform(waveform, sr)     -> None   (raises on bad input)
    get_audio_info(path)                -> AudioInfo

This module deliberately does NOT do VAD, model inference, or any
downstream ML work.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from backend.audio.decoder import (
    AudioDecodeError,
    EmptyAudioError,
    UnsupportedFormatError,
    load_audio,
)
from backend.utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TARGET_SAMPLE_RATE: int   = 16_000    # Hz  — required by VAD, Whisper, ECAPA
TARGET_DTYPE: np.dtype    = np.dtype("float32")
MIN_DURATION_SECONDS: float = 0.05   # reject clips shorter than 50 ms
MAX_DURATION_SECONDS: float = 3600.0  # reject clips longer than 1 hour

# Amplitude below this is treated as silence (avoid div-by-zero in normalise)
SILENCE_THRESHOLD: float = 1e-7


# ---------------------------------------------------------------------------
# Custom exceptions (re-exported for caller convenience)
# ---------------------------------------------------------------------------

class PreprocessingError(RuntimeError):
    """Raised when preprocessing cannot produce a valid waveform."""


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AudioInfo:
    """Metadata returned by :func:`get_audio_info`."""
    path:             str
    duration_seconds: float
    sample_rate:      int
    num_samples:      int
    is_silent:        bool
    rms_amplitude:    float
    peak_amplitude:   float


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def validate_waveform(waveform: np.ndarray, sample_rate: int) -> None:
    """
    Assert that `waveform` meets the pipeline's invariants.

    Checks:
        - Must be a numpy ndarray with dtype float32.
        - Must be 1-D (mono).
        - Must not be empty.
        - Duration must be >= MIN_DURATION_SECONDS.
        - Duration must be <= MAX_DURATION_SECONDS.
        - Must not contain NaN or Inf values.
        - sample_rate must equal TARGET_SAMPLE_RATE.

    Raises:
        PreprocessingError: for any failed check.
    """
    if not isinstance(waveform, np.ndarray):
        raise PreprocessingError(
            f"waveform must be a numpy ndarray, got {type(waveform).__name__}."
        )

    if waveform.dtype != TARGET_DTYPE:
        raise PreprocessingError(
            f"waveform must be float32, got {waveform.dtype}."
        )

    if waveform.ndim != 1:
        raise PreprocessingError(
            f"waveform must be 1-D (mono), got shape {waveform.shape}."
        )

    if waveform.size == 0:
        raise PreprocessingError("waveform is empty (0 samples).")

    duration = waveform.size / sample_rate

    if duration < MIN_DURATION_SECONDS:
        raise PreprocessingError(
            f"Audio is too short ({duration * 1000:.1f} ms < "
            f"{MIN_DURATION_SECONDS * 1000:.0f} ms minimum)."
        )

    if duration > MAX_DURATION_SECONDS:
        raise PreprocessingError(
            f"Audio is too long ({duration / 60:.1f} min > "
            f"{MAX_DURATION_SECONDS / 3600:.0f} h maximum)."
        )

    if not np.isfinite(waveform).all():
        n_bad = int(np.sum(~np.isfinite(waveform)))
        raise PreprocessingError(
            f"waveform contains {n_bad} non-finite value(s) (NaN or Inf). "
            "The source audio may be corrupted."
        )

    if sample_rate != TARGET_SAMPLE_RATE:
        raise PreprocessingError(
            f"sample_rate must be {TARGET_SAMPLE_RATE} Hz after preprocessing, "
            f"got {sample_rate} Hz."
        )


def normalize_waveform(waveform: np.ndarray) -> np.ndarray:
    """
    Peak-normalise `waveform` so that max(|waveform|) == 1.0.

    Safety rules:
        - If the waveform is below SILENCE_THRESHOLD (effectively silent),
          it is returned unchanged (all-zeros).  Dividing a silent signal
          would amplify noise to full scale.
        - Input must be float32; returns float32.
        - Does not clip — the output range is [-1, +1].

    Args:
        waveform: 1-D float32 numpy array.

    Returns:
        Peak-normalised float32 numpy array of the same shape.

    Raises:
        TypeError: if waveform is not a numpy ndarray.
    """
    if not isinstance(waveform, np.ndarray):
        raise TypeError(
            f"Expected numpy ndarray, got {type(waveform).__name__}."
        )

    waveform = waveform.astype(np.float32, copy=False)
    peak = float(np.abs(waveform).max())

    if peak < SILENCE_THRESHOLD:
        log.warning(
            "normalize_waveform: peak amplitude %.2e is below silence "
            "threshold %.2e — returning waveform unchanged.",
            peak,
            SILENCE_THRESHOLD,
        )
        return waveform

    return (waveform / peak).astype(np.float32)


def _to_mono(waveform: np.ndarray) -> np.ndarray:
    """
    Convert a multi-channel waveform to mono by averaging channels.

    Args:
        waveform: ndarray of shape (N,) or (N, C) or (C, N).

    Returns:
        1-D float32 array of shape (N,).
    """
    if waveform.ndim == 1:
        return waveform.astype(np.float32, copy=False)

    # Determine layout: (samples, channels) vs (channels, samples)
    # Heuristic: the longer axis is samples
    if waveform.shape[0] > waveform.shape[1]:
        # (N, C)
        mono = waveform.mean(axis=1)
    else:
        # (C, N)
        mono = waveform.mean(axis=0)

    return mono.astype(np.float32)


# ---------------------------------------------------------------------------
# Main public functions
# ---------------------------------------------------------------------------

def preprocess_audio(
    path: str | Path,
    normalize: bool = True,
    target_sr: int = TARGET_SAMPLE_RATE,
) -> np.ndarray:
    """
    Load, decode, convert and optionally normalise an audio file.

    This is the **single entry point** every downstream pipeline stage
    should call.  The returned waveform is guaranteed to be:

        • np.ndarray, dtype=float32
        • 1-D (mono)
        • Sampled at `target_sr` Hz  (default 16 000 Hz)
        • Peak-normalised to [-1, +1] when `normalize=True`
        • Free of NaN / Inf values
        • Between MIN_DURATION_SECONDS and MAX_DURATION_SECONDS long

    Args:
        path:      Path to the audio file (WAV / WebM / Opus supported).
        normalize: Apply peak normalisation (default True).
        target_sr: Output sample rate in Hz (default 16 000).

    Returns:
        Standardised float32 mono waveform.

    Raises:
        FileNotFoundError:     file does not exist.
        UnsupportedFormatError: unsupported file extension.
        AudioDecodeError:      decoding failed (corrupted / invalid file).
        EmptyAudioError:       file decoded to zero samples.
        PreprocessingError:    waveform fails validation (too short/long, NaN…).
    """
    path = Path(path)
    log.info("preprocess_audio: loading '%s'", path.name)

    # --- 1. Decode (handles format detection, resampling to target_sr) ---
    waveform, sr = load_audio(path, target_sr=target_sr)

    log.debug(
        "Decoded: samples=%d  sr=%d Hz  duration=%.3f s  dtype=%s",
        waveform.size,
        sr,
        waveform.size / sr,
        waveform.dtype,
    )

    # --- 2. Ensure mono (load_audio already does this via FFmpeg -ac 1,
    #        but guard defensively for the stdlib fallback path) ---
    waveform = _to_mono(waveform)

    # --- 3. Ensure float32 ---
    waveform = waveform.astype(np.float32, copy=False)

    # --- 4. Normalise ---
    if normalize:
        waveform = normalize_waveform(waveform)
        log.debug("Normalised: peak=%.4f", float(np.abs(waveform).max()))

    # --- 5. Validate invariants before returning ---
    validate_waveform(waveform, sr)

    log.info(
        "preprocess_audio: done  duration=%.3f s  samples=%d  peak=%.4f",
        waveform.size / sr,
        waveform.size,
        float(np.abs(waveform).max()),
    )

    return waveform


def get_audio_info(path: str | Path) -> AudioInfo:
    """
    Probe an audio file and return metadata without retaining the waveform.

    Useful for quick validation or logging before a full pipeline run.

    Args:
        path: Path to the audio file.

    Returns:
        AudioInfo dataclass with duration, sample rate, amplitude stats, etc.

    Raises:
        Same exceptions as :func:`preprocess_audio`.
    """
    waveform = preprocess_audio(path, normalize=False)
    sr       = TARGET_SAMPLE_RATE
    peak     = float(np.abs(waveform).max())
    rms      = float(np.sqrt(np.mean(waveform ** 2)))

    return AudioInfo(
        path             = str(Path(path).resolve()),
        duration_seconds = waveform.size / sr,
        sample_rate      = sr,
        num_samples      = waveform.size,
        is_silent        = peak < SILENCE_THRESHOLD,
        rms_amplitude    = rms,
        peak_amplitude   = peak,
    )
