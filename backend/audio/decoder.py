"""
backend/audio/decoder.py
========================
Low-level audio decoder.

Responsibility
--------------
Accept an audio file path (WAV / WebM / Opus / anything FFmpeg supports),
decode it to a raw float32 PCM numpy array, and return the waveform together
with the sample rate at which it was decoded.

This module does NOT apply any further preprocessing (resampling, channel
mixing, normalisation).  All of that lives in preprocessing.py.

Public API
----------
    load_audio(path, target_sr=None) -> (np.ndarray, int)
    check_ffmpeg() -> bool

Design decisions
----------------
* We pipe raw f32le PCM out of FFmpeg via subprocess.  This is the most
  reliable strategy: it supports every container/codec FFmpeg knows (WAV,
  WebM, Opus, MP3, FLAC, …) without any additional Python library.
* When `target_sr` is given FFmpeg does the resampling internally, avoiding
  a second Python-side resample step.
* The `soundfile` library is used as a **fallback** for plain WAV files if
  the FFmpeg binary is absent (useful in CI environments that cannot install
  system packages).
* All error paths raise typed, descriptive exceptions so callers can react
  appropriately.
"""

from __future__ import annotations

import os
import shutil
import struct
import subprocess
import wave
from pathlib import Path
from typing import Optional

import numpy as np

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS: frozenset[str] = frozenset(
    {".wav", ".webm", ".opus", ".ogg", ".mp3", ".flac", ".mp4", ".m4a"}
)

# Maximum file size we are willing to decode in a single call (500 MB).
MAX_FILE_BYTES: int = 500 * 1024 * 1024


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class AudioDecodeError(RuntimeError):
    """Raised when FFmpeg or the fallback decoder cannot decode the file."""


class UnsupportedFormatError(ValueError):
    """Raised when the file extension is not in SUPPORTED_EXTENSIONS."""


class EmptyAudioError(ValueError):
    """Raised when the decoded waveform contains no samples."""


# ---------------------------------------------------------------------------
# FFmpeg availability
# ---------------------------------------------------------------------------

def check_ffmpeg() -> bool:
    """Return True if the `ffmpeg` binary is on PATH, False otherwise."""
    return shutil.which("ffmpeg") is not None


def _require_ffmpeg() -> str:
    """
    Return the path to the ffmpeg binary.

    Raises:
        EnvironmentError: if ffmpeg is not found on PATH.
    """
    path = shutil.which("ffmpeg")
    if path is None:
        raise EnvironmentError(
            "FFmpeg is not installed or not on PATH. "
            "Install it with:  brew install ffmpeg  (macOS) "
            "or  sudo apt install ffmpeg  (Ubuntu/Debian)."
        )
    return path


# ---------------------------------------------------------------------------
# File-level validation helpers
# ---------------------------------------------------------------------------

def _validate_path(path: str | Path) -> Path:
    """
    Resolve the path and run basic sanity checks before decoding.

    Raises:
        FileNotFoundError:    file does not exist.
        IsADirectoryError:    path points to a directory.
        ValueError:           file is empty or exceeds MAX_FILE_BYTES.
        UnsupportedFormatError: extension not in SUPPORTED_EXTENSIONS.
    """
    p = Path(path).expanduser().resolve()

    if not p.exists():
        raise FileNotFoundError(f"Audio file not found: {p}")

    if p.is_dir():
        raise IsADirectoryError(f"Expected a file, got a directory: {p}")

    size = p.stat().st_size
    if size == 0:
        raise ValueError(f"File is empty (0 bytes): {p}")

    if size > MAX_FILE_BYTES:
        raise ValueError(
            f"File is too large ({size / 1e6:.1f} MB > "
            f"{MAX_FILE_BYTES / 1e6:.0f} MB limit): {p}"
        )

    ext = p.suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(
            f"Unsupported file extension '{ext}'. "
            f"Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    return p


# ---------------------------------------------------------------------------
# FFmpeg-based decoder (primary)
# ---------------------------------------------------------------------------

def _decode_via_ffmpeg(
    path: Path,
    target_sr: int,
) -> tuple[np.ndarray, int]:
    """
    Decode `path` using FFmpeg, resampling to `target_sr` on the fly.

    FFmpeg command:
        ffmpeg -v error -i <path>
               -f f32le          # raw interleaved float32 little-endian PCM
               -acodec pcm_f32le
               -ar <target_sr>   # resample in FFmpeg (high quality SWR)
               pipe:1            # write to stdout

    Returns:
        (waveform, target_sr) — waveform is a 1-D float32 numpy array
        (channel mixing is done separately in preprocessing.py because we
        want to know the original channel count for logging; here we always
        ask FFmpeg for a single channel).

    Raises:
        AudioDecodeError: if FFmpeg exits with a non-zero status or stdout
                          is empty / cannot be interpreted as float32.
    """
    ffmpeg_bin = _require_ffmpeg()

    cmd = [
        ffmpeg_bin,
        "-v", "error",           # suppress banner, show only errors
        "-i", str(path),
        "-f", "f32le",
        "-acodec", "pcm_f32le",
        "-ar", str(target_sr),
        "-ac", "1",              # mono — channel mixing inside FFmpeg
        "pipe:1",
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,         # generous timeout for large files
        )
    except subprocess.TimeoutExpired as exc:
        raise AudioDecodeError(
            f"FFmpeg timed out decoding '{path}': {exc}"
        ) from exc
    except OSError as exc:
        raise AudioDecodeError(
            f"Failed to launch FFmpeg for '{path}': {exc}"
        ) from exc

    if result.returncode != 0:
        stderr_text = result.stderr.decode("utf-8", errors="replace").strip()
        raise AudioDecodeError(
            f"FFmpeg exited with code {result.returncode} "
            f"for '{path}'.\nFFmpeg stderr:\n{stderr_text}"
        )

    raw_bytes = result.stdout
    if len(raw_bytes) == 0:
        raise AudioDecodeError(
            f"FFmpeg produced no audio output for '{path}'. "
            "The file may be corrupted or contain only video/metadata streams."
        )

    # Each sample is 4 bytes (f32le)
    if len(raw_bytes) % 4 != 0:
        raise AudioDecodeError(
            f"FFmpeg output is {len(raw_bytes)} bytes — not a multiple of 4. "
            "Incomplete or corrupted PCM data."
        )

    waveform = np.frombuffer(raw_bytes, dtype=np.float32).copy()
    return waveform, target_sr


# ---------------------------------------------------------------------------
# Fallback: stdlib wave module (WAV only, no external deps)
# ---------------------------------------------------------------------------

def _decode_wav_stdlib(path: Path) -> tuple[np.ndarray, int]:
    """
    Decode a WAV file using Python's built-in `wave` module.

    This is the fallback path when FFmpeg is not available.
    Supports only WAV containers.  Always returns a float32 waveform
    (all integer PCM depths are converted).

    Raises:
        AudioDecodeError: if the file is not a valid WAV or decoding fails.
    """
    try:
        with wave.open(str(path), "rb") as wf:
            n_channels = wf.getnchannels()
            sampwidth  = wf.getsampwidth()   # bytes per sample
            framerate  = wf.getframerate()
            n_frames   = wf.getnframes()
            raw        = wf.readframes(n_frames)
    except wave.Error as exc:
        raise AudioDecodeError(
            f"stdlib wave module could not decode '{path}': {exc}"
        ) from exc

    # Map sample width → numpy dtype
    dtype_map = {1: np.uint8, 2: np.int16, 4: np.int32}
    if sampwidth not in dtype_map:
        raise AudioDecodeError(
            f"Unsupported WAV sample width {sampwidth} bytes in '{path}'."
        )

    samples = np.frombuffer(raw, dtype=dtype_map[sampwidth])

    # De-interleave channels → shape (n_frames, n_channels)
    samples = samples.reshape(-1, n_channels)

    # Mix down to mono
    samples = samples.mean(axis=1)

    # Convert to float32 in [-1, 1]
    if sampwidth == 1:
        # uint8: 0..255, centre at 128
        waveform = (samples.astype(np.float32) - 128.0) / 128.0
    elif sampwidth == 2:
        waveform = samples.astype(np.float32) / 32768.0
    else:  # int32
        waveform = samples.astype(np.float32) / 2147483648.0

    return waveform, framerate


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_audio(
    path: str | Path,
    target_sr: int = 16000,
) -> tuple[np.ndarray, int]:
    """
    Load and decode an audio file into a mono float32 numpy waveform.

    Decoding strategy (in order of priority):
        1. FFmpeg subprocess (preferred — supports WAV, WebM, Opus, …)
        2. stdlib `wave` module (WAV fallback when FFmpeg is absent)

    The returned waveform is always:
        - 1-D  (mono — channel mixing done in FFmpeg or fallback)
        - float32
        - sampled at `target_sr` Hz

    Args:
        path:      Path to the audio file (str or Path).
        target_sr: Target sample rate in Hz.  FFmpeg resamples internally.
                   Default: 16 000 Hz.

    Returns:
        (waveform, sample_rate)
            waveform    — np.ndarray shape (N,), dtype float32
            sample_rate — int, equals `target_sr`

    Raises:
        FileNotFoundError:     file does not exist.
        IsADirectoryError:     path is a directory.
        ValueError:            empty file or file too large.
        UnsupportedFormatError: file extension not supported.
        AudioDecodeError:      FFmpeg / stdlib decoder failed.
        EmptyAudioError:       decoded waveform has no samples.
        EnvironmentError:      FFmpeg binary missing and format is not WAV.
    """
    resolved = _validate_path(path)

    # --- Attempt FFmpeg first (handles all formats) ---
    if check_ffmpeg():
        waveform, sr = _decode_via_ffmpeg(resolved, target_sr)
    else:
        # FFmpeg unavailable: fall back to stdlib for WAV only
        if resolved.suffix.lower() != ".wav":
            raise EnvironmentError(
                f"FFmpeg is required to decode '{resolved.suffix}' files but "
                "is not installed.  Install it with: brew install ffmpeg"
            )
        waveform, native_sr = _decode_wav_stdlib(resolved)

        # Resample if needed (pure-Python linear resample — good enough for
        # the fallback path; real use should install FFmpeg)
        if native_sr != target_sr:
            waveform = _resample_linear(waveform, native_sr, target_sr)
        sr = target_sr

    # Guard: waveform must contain at least one sample
    if waveform.size == 0:
        raise EmptyAudioError(
            f"Decoded waveform for '{resolved}' is empty "
            "(zero samples).  The file may contain silence only or be "
            "corrupted."
        )

    # Ensure float32 (FFmpeg guarantees this, but be defensive)
    if waveform.dtype != np.float32:
        waveform = waveform.astype(np.float32)

    # Ensure 1-D
    waveform = waveform.squeeze()
    if waveform.ndim != 1:
        raise AudioDecodeError(
            f"Expected a 1-D waveform after decoding '{resolved}', "
            f"got shape {waveform.shape}."
        )

    return waveform, sr


def _resample_linear(
    waveform: np.ndarray,
    orig_sr: int,
    target_sr: int,
) -> np.ndarray:
    """
    Naive linear interpolation resample (fallback only — FFmpeg not available).

    This is intentionally simple.  For production use install FFmpeg which
    uses libswresample (sinc interpolation, much higher quality).

    Args:
        waveform:  1-D float32 array.
        orig_sr:   Original sample rate.
        target_sr: Desired sample rate.

    Returns:
        Resampled float32 array.
    """
    if orig_sr == target_sr:
        return waveform
    ratio = target_sr / orig_sr
    n_out = int(len(waveform) * ratio)
    x_old = np.linspace(0, len(waveform) - 1, len(waveform))
    x_new = np.linspace(0, len(waveform) - 1, n_out)
    return np.interp(x_new, x_old, waveform).astype(np.float32)
