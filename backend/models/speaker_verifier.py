"""
backend/models/speaker_verifier.py
====================================
Pretrained speaker verification module using SpeechBrain ECAPA-TDNN.

Model
-----
  Name   : speechbrain/spkrec-ecapa-voxceleb
  Arch   : ECAPA-TDNN (Emphasized Channel Attention, Propagation and Aggregation)
  Train  : VoxCeleb1 + VoxCeleb2 (~7 000 speakers, ~1.3 M utterances)
  Task   : Speaker embedding extraction for text-independent verification
  Size   : ~22 MB (ECAPA weights only)
  CPU    : ✅  float32, no CUDA required
  License: Apache-2.0

Embedding Space (Empirically Verified 2026-09-04)
--------------------------------------------------
  Output  : 192-D float32 vector  (shape: (192,) after squeeze)
  Raw norm: ~414  →  NOT L2-normalised by the model itself
  After normalisation: L2-norm = 1.000000  ✅

  Cosine Similarities Measured:
    same speaker (ref1↔ref2, ref1↔ref3, ref2↔ref3) : 0.87–0.89
    mean-reference vs same-speaker test              : 0.902
    mean-reference vs different speaker              : 0.238
    separation gap                                   : ~0.66
  Default threshold: 0.70  (midpoint ≈ 0.57; biased toward precision)

Input Requirements
------------------
  • Sample rate : 16 000 Hz
  • Channels    : mono
  • dtype        : float32 numpy array
  • Length       : ≥ 0.5 s (model uses full-sequence TDNN)
  • Our pipeline : waveform from preprocessing.py satisfies all constraints

Public API
----------
  SpeakerVerifier                 — main class
    .load()                       → SpeakerVerifier  (downloads model)
    .generate_embedding(audio)    → np.ndarray (192,)
    .enroll_reference(audio_list) → np.ndarray (192,)  (mean + L2-norm)
    .save_reference_embedding(emb, path)  → Path
    .load_reference_embedding(path)       → np.ndarray (192,)
    .verify_speaker(audio, ref_emb)       → SpeakerResult

  SpeakerResult                   — frozen dataclass
    .speaker_similarity           → float  cosine similarity ∈ [-1, 1]
    .speaker_match                → bool   similarity >= threshold
    .threshold_used               → float
    .embedding_dim                → int    (192)
    .inference_time_ms            → float

  verify_speaker(audio, ref_emb)  — module-level convenience function

Enrollment Flow
---------------
  1. Collect N audio files (≥1, ≥3 recommended)
  2. generate_embedding() for each file → list of 192-D L2-normed vectors
  3. Compute element-wise mean
  4. L2-normalise the mean → final reference embedding
  5. Optionally save to .npy file with save_reference_embedding()

  "Mean of unit vectors, then re-normalise" is standard in the speaker
  diarisation literature and is robust to utterance length differences.

Verification Flow
-----------------
  1. generate_embedding(test_audio) → test_emb  (192-D, L2-normed)
  2. cosine_similarity(test_emb, reference_emb)
     = dot(test_emb, ref_emb)  [both L2-normed → dot = cosine]
  3. speaker_match = similarity >= threshold

  Raw audio is NEVER stored — only the 192-D float32 embedding.

Pipeline Integration
--------------------
  Stage before: Deepfake Detection (models/deepfake_detector.py)
  This stage  : backend/models/speaker_verifier.py
  Stage after : Transcription (models/transcriber.py) [not yet]
"""

from __future__ import annotations

import time
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Union

import numpy as np
import torch
from speechbrain.utils.fetching import LocalStrategy
from backend.utils.logger import get_logger

log = get_logger(__name__)

# Suppress torch FutureWarning on Python 3.14
warnings.filterwarnings("ignore", category=FutureWarning)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MODEL_SOURCE:     str   = "speechbrain/spkrec-ecapa-voxceleb"
MODEL_CACHE_DIR:  str   = "data/pretrained/ecapa-voxceleb"
SAMPLE_RATE:      int   = 16_000
EMBEDDING_DIM:    int   = 192
DEFAULT_THRESHOLD: float = 0.70   # Calibrated: same≈0.90  diff≈0.24

# Tolerance when checking L2-norm ≈ 1
_NORM_TOLERANCE: float = 1e-4


# ─────────────────────────────────────────────────────────────────────────────
# Data types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SpeakerResult:
    """
    Complete output of the speaker verification stage.

    Attributes
    ----------
    speaker_similarity:
        Cosine similarity between the test embedding and the reference embedding.
        Range [-1.0, 1.0]; higher means more similar.
        Empirically: same speaker ≈ 0.87–0.90, different speaker ≈ 0.24.

    speaker_match:
        True if speaker_similarity >= threshold_used.

    threshold_used:
        The decision threshold that was applied.

    embedding_dim:
        Dimensionality of the speaker embedding (192 for ECAPA-TDNN).

    inference_time_ms:
        Wall-clock time for embedding generation + cosine similarity.
    """
    speaker_similarity: float
    speaker_match:      bool
    threshold_used:     float
    embedding_dim:      int
    inference_time_ms:  float

    def summary(self) -> str:
        verdict = "MATCH" if self.speaker_match else "MISMATCH"
        return (
            f"{verdict}  "
            f"similarity={self.speaker_similarity:.4f}  "
            f"threshold={self.threshold_used:.2f}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Custom exceptions
# ─────────────────────────────────────────────────────────────────────────────

class SpeakerVerifierInputError(ValueError):
    """Raised when waveform or embedding input is invalid."""


class SpeakerVerifierError(RuntimeError):
    """Raised when model inference or I/O fails."""


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _validate_waveform(waveform: np.ndarray) -> None:
    if not isinstance(waveform, np.ndarray):
        raise SpeakerVerifierInputError(
            f"waveform must be numpy ndarray, got {type(waveform).__name__}."
        )
    if waveform.ndim != 1:
        raise SpeakerVerifierInputError(
            f"waveform must be 1-D (mono), got shape {waveform.shape}. "
            "Run preprocess_audio() first."
        )
    if waveform.dtype != np.float32:
        raise SpeakerVerifierInputError(
            f"waveform must be float32, got {waveform.dtype}."
        )
    if waveform.size == 0:
        raise SpeakerVerifierInputError("waveform is empty (0 samples).")
    if not np.isfinite(waveform).all():
        raise SpeakerVerifierInputError("waveform contains NaN or Inf values.")
    min_samples = int(SAMPLE_RATE * 0.5)
    if waveform.size < min_samples:
        raise SpeakerVerifierInputError(
            f"waveform too short: {waveform.size} samples "
            f"({waveform.size / SAMPLE_RATE:.2f} s). "
            f"Minimum is {min_samples} samples (0.5 s)."
        )


def _validate_embedding(emb: np.ndarray, name: str = "embedding") -> None:
    if not isinstance(emb, np.ndarray):
        raise SpeakerVerifierInputError(
            f"{name} must be numpy ndarray, got {type(emb).__name__}."
        )
    if emb.shape != (EMBEDDING_DIM,):
        raise SpeakerVerifierInputError(
            f"{name} must have shape ({EMBEDDING_DIM},), got {emb.shape}."
        )
    if emb.dtype != np.float32:
        raise SpeakerVerifierInputError(
            f"{name} must be float32, got {emb.dtype}."
        )
    norm = float(np.linalg.norm(emb))
    if abs(norm - 1.0) > _NORM_TOLERANCE:
        raise SpeakerVerifierInputError(
            f"{name} must be L2-normalised (norm=1.0), got norm={norm:.6f}. "
            "Use generate_embedding() which normalises automatically."
        )


def _l2_normalize_tensor(vec: torch.Tensor) -> torch.Tensor:
    norm = torch.norm(vec, p=2)
    if norm < 1e-12:
        raise SpeakerVerifierError(
            "Cannot L2-normalise a near-zero embedding. "
            "Input audio may be silent or corrupt."
        )
    return vec / norm


# ─────────────────────────────────────────────────────────────────────────────
# SpeakerVerifier
# ─────────────────────────────────────────────────────────────────────────────

class SpeakerVerifier:
    """
    ECAPA-TDNN speaker verification wrapper.

    All public methods accept/return numpy arrays.
    Internal computation uses PyTorch tensors (CPU only).

    Lifecycle
    ---------
        verifier = SpeakerVerifier.load()

        # Enrollment (offline, one-time per speaker)
        ref_emb = verifier.enroll_reference([wav1_path, wav2_path, wav3_path])
        verifier.save_reference_embedding(ref_emb, "data/refs/alice.npy")

        # Verification (real-time)
        ref_emb = verifier.load_reference_embedding("data/refs/alice.npy")
        result  = verifier.verify_speaker(test_wav, ref_emb)
        print(result.speaker_match, result.speaker_similarity)
    """

    def __init__(self, encoder) -> None:
        """Internal — use SpeakerVerifier.load() instead."""
        self._encoder = encoder

    # ─────────────────────────────────────────────────────────────────────────
    # Factory
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def load(
        cls,
        source:    str = MODEL_SOURCE,
        cache_dir: str = MODEL_CACHE_DIR,
    ) -> "SpeakerVerifier":
        """
        Download (or reuse cached) pretrained ECAPA-TDNN model.

        Args:
            source:    HuggingFace model ID or local path.
            cache_dir: Directory where SpeechBrain will cache weights.

        Returns:
            Ready-to-use SpeakerVerifier instance.

        Raises:
            ImportError:          if speechbrain is not installed.
            SpeakerVerifierError: if model loading fails.
        """
        try:
            from speechbrain.inference.speaker import EncoderClassifier
        except ImportError as exc:
            raise ImportError(
                "speechbrain is not installed. Run: pip install speechbrain"
            ) from exc

        log.info("SpeakerVerifier.load: loading '%s' …", source)
        t0 = time.perf_counter()

        try:
            encoder = EncoderClassifier.from_hparams(
                source=source,
                savedir=cache_dir,
                run_opts={"device": "cpu"},
                local_strategy=LocalStrategy.COPY,
            )
        except Exception as exc:
            raise SpeakerVerifierError(
                f"Failed to load speaker verification model '{source}': {exc}"
            ) from exc

        elapsed = (time.perf_counter() - t0) * 1000
        log.info(
            "SpeakerVerifier.load: model ready in %.0f ms  "
            "(ECAPA-TDNN, embedding_dim=%d, threshold=%.2f)",
            elapsed, EMBEDDING_DIM, DEFAULT_THRESHOLD,
        )
        return cls(encoder=encoder)

    # ─────────────────────────────────────────────────────────────────────────
    # Core: embedding generation
    # ─────────────────────────────────────────────────────────────────────────

    def generate_embedding(self, waveform: np.ndarray) -> np.ndarray:
        """
        Generate an L2-normalised 192-D speaker embedding from a waveform.

        Building block for both enrollment and verification.
        The raw ECAPA output is NOT L2-normalised (empirical norm ≈ 414);
        this method normalises it to unit length.

        Args:
            waveform: 1-D float32 mono array at 16 000 Hz.
                      Must come from preprocessing.preprocess_audio().

        Returns:
            np.ndarray of shape (192,), dtype float32, L2-norm = 1.0.

        Raises:
            SpeakerVerifierInputError: waveform fails validation.
            SpeakerVerifierError:      model inference fails.

        Notes
        -----
        Raw audio is NEVER stored — only the 192-D float32 embedding.
        """
        _validate_waveform(waveform)

        log.debug(
            "generate_embedding: %d samples (%.2f s)",
            waveform.size, waveform.size / SAMPLE_RATE,
        )

        # numpy float32 → torch (1, N)
        wav_tensor = torch.from_numpy(waveform).unsqueeze(0)

        t0 = time.perf_counter()
        try:
            with torch.no_grad():
                emb = self._encoder.encode_batch(wav_tensor)  # (1, 1, 192)
        except Exception as exc:
            raise SpeakerVerifierError(
                f"ECAPA-TDNN encode_batch failed: {exc}"
            ) from exc
        elapsed = (time.perf_counter() - t0) * 1000

        # (1, 1, 192) → (192,)
        emb = emb.squeeze()
        # L2-normalise (raw norm ≈ 414)
        emb = _l2_normalize_tensor(emb)

        result = emb.detach().numpy().astype(np.float32)

        log.debug(
            "generate_embedding: done %.0f ms  norm=%.6f",
            elapsed, float(np.linalg.norm(result)),
        )
        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Enrollment
    # ─────────────────────────────────────────────────────────────────────────

    def enroll_reference(
        self,
        audio_inputs: List[Union[np.ndarray, str, Path]],
    ) -> np.ndarray:
        """
        Enroll a speaker from one or more audio samples.

        Enrollment Strategy
        --------------------
        1. generate_embedding() for each input → (192,) L2-normed vectors.
        2. Element-wise mean of all embeddings.
        3. L2-normalise the mean → final 192-D reference embedding.

        "Mean of unit vectors, then re-normalise" is the standard approach
        in speaker diarisation and is robust to utterance length variation.

        Args:
            audio_inputs: List of one or more items, each of which is:
              • np.ndarray  : preprocessed 1-D float32 waveform, OR
              • str | Path  : audio file path (preprocess_audio is called)
              ≥1 item required; ≥3 recommended for robust enrollment.

        Returns:
            np.ndarray of shape (192,), dtype float32, L2-norm = 1.0.

        Raises:
            SpeakerVerifierInputError: empty list or bad waveform.
            SpeakerVerifierError:      inference fails.

        Notes
        -----
        Raw audio is NEVER stored — only the aggregated 192-D embedding.
        """
        from backend.audio.preprocessing import preprocess_audio

        if not audio_inputs:
            raise SpeakerVerifierInputError(
                "enroll_reference requires at least 1 audio input."
            )

        log.info(
            "enroll_reference: processing %d enrollment sample(s) …",
            len(audio_inputs),
        )

        embeddings: list[np.ndarray] = []
        for i, item in enumerate(audio_inputs):
            if isinstance(item, (str, Path)):
                log.debug("enroll_reference: loading file %d: %s", i + 1, item)
                wav = preprocess_audio(str(item))
            elif isinstance(item, np.ndarray):
                wav = item
            else:
                raise SpeakerVerifierInputError(
                    f"audio_inputs[{i}] must be np.ndarray, str, or Path; "
                    f"got {type(item).__name__}."
                )

            emb = self.generate_embedding(wav)  # (192,) L2-normed
            embeddings.append(emb)
            log.debug(
                "enroll_reference: sample %d/%d  norm=%.6f",
                i + 1, len(audio_inputs), float(np.linalg.norm(emb)),
            )

        # Aggregate: mean → re-normalise
        stacked  = np.stack(embeddings, axis=0)   # (N, 192)
        mean_emb = stacked.mean(axis=0)            # (192,)
        mean_norm = float(np.linalg.norm(mean_emb))

        if mean_norm < 1e-12:
            raise SpeakerVerifierError(
                "Aggregated enrollment embedding is near-zero. "
                "Ensure enrollment audio contains actual speech."
            )

        ref_emb = (mean_emb / mean_norm).astype(np.float32)

        log.info(
            "enroll_reference: done  samples=%d  dim=%d  ref_norm=%.6f",
            len(embeddings), EMBEDDING_DIM, float(np.linalg.norm(ref_emb)),
        )
        return ref_emb

    # ─────────────────────────────────────────────────────────────────────────
    # Persistence (embedding only — no raw audio stored)
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def save_reference_embedding(
        embedding: np.ndarray,
        path:      Union[str, Path],
    ) -> Path:
        """
        Save a reference embedding to disk as a .npy file.

        Args:
            embedding: (192,) float32 L2-normalised embedding.
            path:      Destination path; parent directories are created.

        Returns:
            Resolved absolute Path of the saved file.

        Raises:
            SpeakerVerifierInputError: embedding is invalid.
            SpeakerVerifierError:      disk write fails.

        Notes
        -----
        Only the 192-D embedding is stored (~800 bytes). NO raw audio.
        """
        _validate_embedding(embedding, name="embedding")
        dest = Path(path).resolve()
        dest.parent.mkdir(parents=True, exist_ok=True)

        try:
            np.save(str(dest), embedding)
        except OSError as exc:
            raise SpeakerVerifierError(
                f"Failed to save reference embedding to '{dest}': {exc}"
            ) from exc

        log.info(
            "save_reference_embedding: saved  path=%s  size=%d bytes",
            dest, dest.stat().st_size,
        )
        return dest

    @staticmethod
    def load_reference_embedding(path: Union[str, Path]) -> np.ndarray:
        """
        Load a reference embedding from a .npy file.

        Args:
            path: Path to .npy file from save_reference_embedding().

        Returns:
            np.ndarray of shape (192,), dtype float32, L2-norm ≈ 1.0.

        Raises:
            FileNotFoundError:    file does not exist.
            SpeakerVerifierError: corrupt file or shape mismatch.
        """
        src = Path(path).resolve()
        if not src.exists():
            raise FileNotFoundError(
                f"Reference embedding not found: '{src}'"
            )

        try:
            emb = np.load(str(src)).astype(np.float32)
        except Exception as exc:
            raise SpeakerVerifierError(
                f"Failed to load reference embedding from '{src}': {exc}"
            ) from exc

        _validate_embedding(emb, name="loaded embedding")

        log.info(
            "load_reference_embedding: loaded  path=%s  shape=%s  norm=%.6f",
            src, emb.shape, float(np.linalg.norm(emb)),
        )
        return emb

    # ─────────────────────────────────────────────────────────────────────────
    # Verification
    # ─────────────────────────────────────────────────────────────────────────

    def verify_speaker(
        self,
        waveform:            np.ndarray,
        reference_embedding: np.ndarray,
        *,
        threshold:           float = DEFAULT_THRESHOLD,
    ) -> SpeakerResult:
        """
        Verify whether a waveform belongs to the enrolled reference speaker.

        Computes cosine similarity between the test embedding and the
        reference embedding.  Because both are L2-normalised:
            cosine_similarity = dot(test_emb, ref_emb)

        Args:
            waveform:            Test audio, 1-D float32 mono at 16 000 Hz.
            reference_embedding: (192,) float32 L2-normed reference embedding.
            threshold:           Decision threshold (default 0.70).
                                 Empirical calibration:
                                   same speaker  ≈ 0.87–0.90  → MATCH
                                   diff speaker  ≈ 0.24       → MISMATCH

        Returns:
            SpeakerResult:
              .speaker_similarity  — cosine similarity
              .speaker_match       — True if similarity >= threshold
              .threshold_used      — threshold applied
              .embedding_dim       — 192
              .inference_time_ms   — wall-clock time

        Raises:
            SpeakerVerifierInputError: waveform or embedding is invalid.
            SpeakerVerifierError:      model inference fails.
        """
        _validate_embedding(reference_embedding, name="reference_embedding")

        t0 = time.perf_counter()

        test_emb   = self.generate_embedding(waveform)     # (192,) normed
        similarity = float(np.dot(test_emb, reference_embedding))  # cosine

        elapsed = (time.perf_counter() - t0) * 1000

        result = SpeakerResult(
            speaker_similarity = similarity,
            speaker_match      = similarity >= threshold,
            threshold_used     = threshold,
            embedding_dim      = EMBEDDING_DIM,
            inference_time_ms  = elapsed,
        )

        log.info(
            "verify_speaker: %s  [%.0f ms]",
            result.summary(), elapsed,
        )
        return result


# ─────────────────────────────────────────────────────────────────────────────
# Module-level convenience function (singleton)
# ─────────────────────────────────────────────────────────────────────────────

_global_verifier: Optional[SpeakerVerifier] = None


def verify_speaker(
    waveform:            np.ndarray,
    reference_embedding: np.ndarray,
    *,
    threshold:           float = DEFAULT_THRESHOLD,
) -> SpeakerResult:
    """
    Convenience wrapper: load verifier (cached) and run speaker verification.

    Model is loaded on first call and reused as a module-level singleton.

    Args:
        waveform:            1-D float32 mono array at 16 000 Hz.
        reference_embedding: (192,) float32 L2-normed reference embedding.
        threshold:           Decision threshold (default 0.70).

    Returns:
        SpeakerResult
    """
    global _global_verifier
    if _global_verifier is None:
        _global_verifier = SpeakerVerifier.load()
    return _global_verifier.verify_speaker(
        waveform, reference_embedding, threshold=threshold
    )
