"""
backend/models/deepfake_detector.py
====================================
Pretrained audio deepfake / anti-spoofing detection module.

Model Selection Rationale
--------------------------
Model : Vansh180/deepfake-audio-wav2vec2
Source: https://huggingface.co/Vansh180/deepfake-audio-wav2vec2
Arch  : Wav2Vec2ForSequenceClassification (facebook/wav2vec2-base backbone)
Train : Fine-tuned on ASVspoof 2021 Physical Access (PA) partition
Task  : Binary audio classification — genuine vs synthetic/spoofed speech
Size  : ~360 MB  (wav2vec2-base + classification head)
CPU   : ✅ CPU-compatible  (float32 inference, no CUDA required)
License: MIT (inferred from ASVspoof community practice; verify before prod)

Empirically Verified Label Mapping (DO NOT ASSUME — always verify)
--------------------------------------------------------------------
  id2label = {0: "real",  1: "fake"}
  label2id = {"real": 0, "fake": 1}

  Verified on 2026-09-04 with:
    GENUINE  macOS TTS (Alex voice)          → real=0.932  fake=0.068  → "real"  ✅
    SPOOF    replay-style synthetic signal   → real=0.275  fake=0.725  → "fake"  ✅
    SILENCE  all zeros                       → real=0.388  fake=0.612  → "fake"  ⚠️
      (Silence produces spurious "fake"; always gate with VAD first)

  ⚠️  This model was trained primarily on replay attacks (ASVspoof 2021 PA).
      High-quality modern neural TTS may score lower fake probability than
      expected. Treat the score as a signal in an ensemble, not as ground truth.

Input Requirements
------------------
  • Sample rate : 16 000 Hz
  • Channels    : mono
  • dtype        : float32  (raw waveform values, NOT converted to int16)
  • Length       : unconstrained (mean-pooled internally by wav2vec2)
  • Preprocessing: Wav2Vec2FeatureExtractor applies zero-mean / unit-variance
                   normalisation internally (do_normalize=True)
  • Our pipeline: waveform from preprocessing.py already satisfies SR=16 kHz,
                  mono, float32.  DO NOT re-apply normalisation before passing
                  to the feature extractor — the extractor handles it.

Output Format (DeepfakeResult)
--------------------------------
  synthetic_probability : float 0–1
      Probability that the audio is synthetic / spoofed.
      Higher → more likely deepfake.  (= softmax probability of label "fake")

  is_synthetic : bool
      True if synthetic_probability >= threshold.
      Default threshold = 0.5  (tunable at inference time).

  model_name : str
      Full HuggingFace model identifier for reproducibility.

  raw_logits : tuple[float, float]
      Raw un-normalised logits (real_logit, fake_logit).
      Useful for debugging and ensembling.

  inference_time_ms : float
      Wall-clock inference time.

Public API
----------
  DeepfakeResult                — frozen dataclass
  DeepfakeDetector              — class: .load() → .detect(waveform)
  detect_deepfake(waveform)     — module-level convenience function

Pipeline Integration
--------------------
  Stage before: VAD (backend/audio/vad.py)
  This stage  : backend/models/deepfake_detector.py
  Stage after : Speaker Verification (models/speaker_verifier.py) [not yet]
"""

from __future__ import annotations

import time
import warnings
from dataclasses import dataclass
from typing import Optional

import numpy as np

from backend.utils.logger import get_logger

log = get_logger(__name__)

# Suppress torch.jit FutureWarning on Python 3.14
warnings.filterwarnings("ignore", category=FutureWarning)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MODEL_ID:       str   = "Vansh180/deepfake-audio-wav2vec2"
SAMPLE_RATE:    int   = 16_000
DEFAULT_THRESHOLD: float = 0.5

# Empirically verified label indices (from config.json)
LABEL_REAL_IDX: int = 0   # softmax index for "real"
LABEL_FAKE_IDX: int = 1   # softmax index for "fake"


# ─────────────────────────────────────────────────────────────────────────────
# Data types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DeepfakeResult:
    """
    Complete output of the deepfake detection stage.

    Attributes
    ----------
    synthetic_probability:
        Probability that the audio is synthetic / spoofed (0 = genuine, 1 = fake).
        Derived from softmax over logits at index LABEL_FAKE_IDX (1).

    is_synthetic:
        True if synthetic_probability >= threshold used at inference.

    model_name:
        HuggingFace model identifier for reproducibility.

    raw_logits:
        (real_logit, fake_logit) — raw un-normalised model output.
        Use these when building an ensemble.

    genuine_probability:
        Complement of synthetic_probability (= softmax at LABEL_REAL_IDX).

    threshold_used:
        The decision threshold that was applied.

    inference_time_ms:
        Wall-clock time for feature extraction + forward pass.
    """
    synthetic_probability: float
    is_synthetic:          bool
    model_name:            str
    raw_logits:            tuple[float, float]
    genuine_probability:   float
    threshold_used:        float
    inference_time_ms:     float

    def summary(self) -> str:
        """Return a one-line human-readable summary."""
        verdict = "SYNTHETIC" if self.is_synthetic else "GENUINE"
        return (
            f"{verdict}  "
            f"synthetic_prob={self.synthetic_probability:.3f}  "
            f"genuine_prob={self.genuine_probability:.3f}  "
            f"logits=(real={self.raw_logits[0]:.3f}, fake={self.raw_logits[1]:.3f})"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Input validation
# ─────────────────────────────────────────────────────────────────────────────

class DeepfakeInputError(ValueError):
    """Raised when the waveform does not meet deepfake detector requirements."""


def _validate_input(waveform: np.ndarray) -> None:
    if not isinstance(waveform, np.ndarray):
        raise DeepfakeInputError(
            f"waveform must be a numpy ndarray, got {type(waveform).__name__}."
        )
    if waveform.ndim != 1:
        raise DeepfakeInputError(
            f"waveform must be 1-D (mono), got shape {waveform.shape}. "
            "Run preprocessing.preprocess_audio() first."
        )
    if waveform.dtype != np.float32:
        raise DeepfakeInputError(
            f"waveform must be float32, got {waveform.dtype}."
        )
    if waveform.size == 0:
        raise DeepfakeInputError("waveform is empty (0 samples).")
    if not np.isfinite(waveform).all():
        raise DeepfakeInputError("waveform contains NaN or Inf values.")


# ─────────────────────────────────────────────────────────────────────────────
# DeepfakeDetector class
# ─────────────────────────────────────────────────────────────────────────────

class DeepfakeDetector:
    """
    Wrapper around the pretrained Vansh180/deepfake-audio-wav2vec2 model.

    Lifecycle
    ---------
        detector = DeepfakeDetector.load()
        result   = detector.detect(waveform)

    Design Notes
    ------------
    * Model is downloaded once by the HuggingFace hub and cached in
      ~/.cache/huggingface/hub/  (~360 MB on first load).
    * Waveform is passed directly to Wav2Vec2FeatureExtractor which applies
      its own zero-mean / unit-variance normalisation.
    * The module does NOT re-normalise the waveform (would double-normalise).
    * Long audio is handled natively: wav2vec2 uses attentive mean-pooling
      so input length is unconstrained.
    * For CPU, a 5-second clip takes ~0.5–1 s to process (base model).
    """

    def __init__(self, model, feature_extractor) -> None:
        """Internal — use DeepfakeDetector.load() instead."""
        self._model   = model
        self._feat_ex = feature_extractor

    # ─────────────────────────────────────────────────────────────────────────
    # Factory
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    def load(
        cls,
        model_id: str  = MODEL_ID,
        *,
        cache_dir: Optional[str] = None,
    ) -> "DeepfakeDetector":
        """
        Download (or reuse cached) pretrained deepfake detection model.

        Args:
            model_id:  HuggingFace model ID or local path.
            cache_dir: Optional path to override HF cache directory.

        Returns:
            Ready-to-use DeepfakeDetector instance.

        Raises:
            ImportError:   if `transformers` is not installed.
            RuntimeError:  if model loading fails.
        """
        try:
            from transformers import (
                Wav2Vec2ForSequenceClassification,
                Wav2Vec2FeatureExtractor,
            )
        except ImportError as exc:
            raise ImportError(
                "transformers is not installed. Run: pip install transformers"
            ) from exc

        import torch

        log.info("DeepfakeDetector.load: loading '%s' …", model_id)
        t0 = time.perf_counter()

        try:
            feat_ex = Wav2Vec2FeatureExtractor.from_pretrained(
                model_id, cache_dir=cache_dir
            )
            model = Wav2Vec2ForSequenceClassification.from_pretrained(
                model_id, cache_dir=cache_dir
            )
            model.eval()
        except Exception as exc:
            raise RuntimeError(
                f"Failed to load deepfake detection model '{model_id}': {exc}"
            ) from exc

        elapsed = (time.perf_counter() - t0) * 1000

        # Verify the label mapping we expect
        id2label = getattr(model.config, "id2label", {})
        expected = {0: "real", 1: "fake"}
        if id2label != expected:
            log.warning(
                "DeepfakeDetector.load: unexpected id2label %s (expected %s). "
                "Label mapping may be wrong — verify empirically!",
                id2label,
                expected,
            )
        else:
            log.info(
                "DeepfakeDetector.load: label mapping verified: %s", id2label
            )

        log.info(
            "DeepfakeDetector.load: model ready in %.0f ms  (device=cpu)", elapsed
        )
        return cls(model=model, feature_extractor=feat_ex)

    # ─────────────────────────────────────────────────────────────────────────
    # Inference
    # ─────────────────────────────────────────────────────────────────────────

    def detect(
        self,
        waveform:  np.ndarray,
        *,
        threshold: float = DEFAULT_THRESHOLD,
    ) -> DeepfakeResult:
        """
        Run deepfake / anti-spoofing detection on a standardised waveform.

        Args:
            waveform:   1-D float32 mono array at 16 000 Hz.
                        Must come from preprocessing.preprocess_audio().
                        DO NOT apply additional normalisation.
            threshold:  Decision threshold for is_synthetic
                        (0 < threshold < 1).  Higher → more conservative
                        (fewer false positives, more false negatives).

        Returns:
            DeepfakeResult dataclass.

        Raises:
            DeepfakeInputError: waveform validation fails.
            RuntimeError:       model inference fails.

        Label Mapping (empirically verified)
        -------------------------------------
        softmax[:, 0] = P(real)   → genuine_probability
        softmax[:, 1] = P(fake)   → synthetic_probability
        is_synthetic = synthetic_probability >= threshold

        ⚠️  DO NOT interpret raw logits as probabilities.
            Always use softmax output.
        ⚠️  This model was trained on replay attacks (ASVspoof 2021 PA).
            High-quality neural TTS deepfakes may score lower than expected.
            Use this alongside other signals for production decisions.
        """
        import torch

        _validate_input(waveform)

        log.debug(
            "DeepfakeDetector.detect: waveform=%d samples (%.2f s)  threshold=%.2f",
            waveform.size,
            waveform.size / SAMPLE_RATE,
            threshold,
        )

        t0 = time.perf_counter()

        # ── Feature extraction ──────────────────────────────────────────────
        # Wav2Vec2FeatureExtractor applies its own normalisation (do_normalize=True).
        # Input: raw float32 numpy array at self._feat_ex.sampling_rate (16 kHz).
        # Output: 'input_values' tensor of shape (1, n_samples).
        try:
            inputs = self._feat_ex(
                waveform,
                sampling_rate=SAMPLE_RATE,
                return_tensors="pt",
                padding=True,
            )
        except Exception as exc:
            raise RuntimeError(
                f"DeepfakeDetector: feature extraction failed: {exc}"
            ) from exc

        # ── Forward pass ────────────────────────────────────────────────────
        try:
            with torch.no_grad():
                outputs = self._model(**inputs)
            logits = outputs.logits  # shape (1, 2)
        except Exception as exc:
            raise RuntimeError(
                f"DeepfakeDetector: model inference failed: {exc}"
            ) from exc

        inference_ms = (time.perf_counter() - t0) * 1000

        # ── Decode probabilities ─────────────────────────────────────────────
        probs = torch.softmax(logits, dim=-1)[0]            # shape (2,)
        genuine_prob  = float(probs[LABEL_REAL_IDX].item()) # index 0 → real
        synthetic_prob = float(probs[LABEL_FAKE_IDX].item()) # index 1 → fake
        real_logit    = float(logits[0][LABEL_REAL_IDX].item())
        fake_logit    = float(logits[0][LABEL_FAKE_IDX].item())

        is_synthetic = synthetic_prob >= threshold

        result = DeepfakeResult(
            synthetic_probability = synthetic_prob,
            is_synthetic          = is_synthetic,
            model_name            = MODEL_ID,
            raw_logits            = (real_logit, fake_logit),
            genuine_probability   = genuine_prob,
            threshold_used        = threshold,
            inference_time_ms     = inference_ms,
        )

        log.info(
            "DeepfakeDetector.detect: %s  [%.0f ms]",
            result.summary(),
            inference_ms,
        )
        return result


# ─────────────────────────────────────────────────────────────────────────────
# Module-level convenience function
# ─────────────────────────────────────────────────────────────────────────────

_global_detector: Optional[DeepfakeDetector] = None


def detect_deepfake(
    waveform:  np.ndarray,
    *,
    threshold: float = DEFAULT_THRESHOLD,
) -> DeepfakeResult:
    """
    Convenience wrapper: load detector (cached) and detect deepfake.

    The model is downloaded and loaded on the first call and reused
    as a module-level singleton for all subsequent calls.

    Args:
        waveform:   1-D float32 mono array at 16 000 Hz.
        threshold:  Decision threshold (0–1).

    Returns:
        DeepfakeResult
    """
    global _global_detector
    if _global_detector is None:
        _global_detector = DeepfakeDetector.load()
    return _global_detector.detect(waveform, threshold=threshold)
