"""
backend/models/deepfake_v2/inference.py
=======================================
Inference wrapper for Deepfake CNN v2.

Provides a clean, pipeline-ready interface:
    detector = DeepfakeV2Detector(checkpoint_path="...")
    result = detector.detect(waveform)
    print(result.summary())
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple, Union

import numpy as np
import torch

from backend.models.deepfake_v2.features import LogMelFeatureExtractor
from backend.models.deepfake_v2.model import DeepfakeCNN
from backend.utils.logger import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class DeepfakeV2Result:
    """
    Standardized inference result from the Deepfake CNN v2 model.

    Attributes
    ----------
    synthetic_probability:
        Probability that the audio is synthetic / cloned / spoofed [0.0, 1.0].
    is_synthetic:
        Boolean decision based on threshold_used.
    model_name:
        Identifier string for the active model architecture / checkpoint.
    raw_logits:
        Tuple of (bonafide_logit, spoof_logit).
    genuine_probability:
        Complementary probability of genuine speech (1.0 - synthetic_probability).
    threshold_used:
        Decision threshold applied.
    inference_time_ms:
        Execution duration in milliseconds.
    """
    synthetic_probability: float
    is_synthetic: bool
    model_name: str
    raw_logits: Tuple[float, float]
    genuine_probability: float
    threshold_used: float
    inference_time_ms: float

    def summary(self) -> str:
        verdict = "SYNTHETIC" if self.is_synthetic else "GENUINE"
        return (
            f"[{verdict}]  "
            f"synthetic_prob={self.synthetic_probability:.4f}  "
            f"genuine_prob={self.genuine_probability:.4f}  "
            f"(threshold={self.threshold_used:.2f}, time={self.inference_time_ms:.1f}ms)"
        )


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CHECKPOINT_NAME = "deepfake_v2_asvspoof2019_la.pt"
DEFAULT_CHECKPOINT_PATH = PROJECT_ROOT / "checkpoints" / DEFAULT_CHECKPOINT_NAME
TARGET_SAMPLE_RATE: int = 16_000
TARGET_DURATION_SEC: float = 4.0
TARGET_SAMPLES: int = int(TARGET_DURATION_SEC * TARGET_SAMPLE_RATE)  # 64,000 samples


class DeepfakeV2Detector:
    """
    Production-ready inference detector for DeepfakeCNN v2 classifier.

    Loads the verified ASVspoof 2019 LA trained checkpoint by default.
    Never silently falls back to random weights.
    """

    MODEL_NAME: str = "ASVspoof5-DeepfakeCNN-v2"

    def __init__(
        self,
        checkpoint_path: Optional[Union[str, Path]] = None,
        default_threshold: float = 0.5,
        device: str = "auto",
        allow_uninitialized: bool = False,
    ) -> None:
        # Safe device selection
        if device == "auto":
            if torch.backends.mps.is_available():
                self.device = torch.device("mps")
            elif torch.cuda.is_available():
                self.device = torch.device("cuda")
            else:
                self.device = torch.device("cpu")
        else:
            self.device = torch.device(device)

        self.default_threshold = float(default_threshold)
        self.feature_extractor = LogMelFeatureExtractor(sample_rate=TARGET_SAMPLE_RATE).to(self.device)
        self.model = DeepfakeCNN().to(self.device)
        self.metadata: dict = {}
        self.metrics: dict = {}
        self.epoch: Optional[int] = None
        self.val_loss: Optional[float] = None
        self.val_eer: Optional[float] = None
        self.val_roc_auc: Optional[float] = None
        self.model_name: str = self.MODEL_NAME
        self.checkpoint_path: Optional[Path] = None

        # Resolve checkpoint path: explicit arg -> DEEPFAKE_CHECKPOINT_PATH env -> default production checkpoint
        ckpt_candidate = checkpoint_path
        if ckpt_candidate is None:
            env_ckpt = os.getenv("DEEPFAKE_CHECKPOINT_PATH")
            if env_ckpt:
                ckpt_candidate = env_ckpt
            elif DEFAULT_CHECKPOINT_PATH.is_file():
                ckpt_candidate = DEFAULT_CHECKPOINT_PATH

        if ckpt_candidate is not None:
            cand_path = Path(ckpt_candidate)
            if not cand_path.is_absolute():
                if (PROJECT_ROOT / cand_path).is_file():
                    cand_path = PROJECT_ROOT / cand_path
                elif cand_path.is_file():
                    cand_path = cand_path.resolve()

            if not cand_path.is_file():
                if allow_uninitialized:
                    log.warning("Checkpoint '%s' not found; allow_uninitialized=True, using uninitialized weights.", cand_path)
                    self.model.eval()
                else:
                    raise FileNotFoundError(
                        f"Deepfake checkpoint not found at: {cand_path}. "
                        "Please ensure 'checkpoints/deepfake_v2_asvspoof2019_la.pt' exists or set DEEPFAKE_CHECKPOINT_PATH."
                    )
            else:
                self.checkpoint_path = cand_path
                self._load_checkpoint(self.checkpoint_path)
        else:
            if allow_uninitialized:
                log.warning("No checkpoint provided and allow_uninitialized=True; using uninitialized weights.")
                self.model.eval()
            else:
                raise FileNotFoundError(
                    f"No deepfake checkpoint provided and default checkpoint not found at: {DEFAULT_CHECKPOINT_PATH}. "
                    "Please provide checkpoint_path or set DEEPFAKE_CHECKPOINT_PATH."
                )

    def _load_checkpoint(self, path: Path) -> None:
        checkpoint = torch.load(str(path), map_location=self.device)
        state_dict = checkpoint.get("model_state_dict", checkpoint)
        self.model.load_state_dict(state_dict)
        self.model.eval()
        self.metadata = checkpoint.get("metadata", {})
        self.metrics = checkpoint.get("metrics", {})
        self.epoch = checkpoint.get("epoch")
        self.val_loss = self.metrics.get("loss")
        self.val_eer = self.metrics.get("eer")
        self.val_roc_auc = self.metrics.get("auc")
        if "metrics" not in self.metadata:
            self.metadata["metrics"] = self.metrics
        for k, v in self.metrics.items():
            self.metadata.setdefault(k, v)
        if self.epoch is not None:
            self.metadata.setdefault("epoch", self.epoch)
        if self.metadata and "dataset_name" in self.metadata:
            self.model_name = f"DeepfakeCNN-v2-{self.metadata['dataset_name']}"
        log.info("Loaded DeepfakeV2Detector checkpoint from %s", path.name)

    def validate_waveform(
        self,
        waveform: Union[np.ndarray, torch.Tensor],
        auto_mono: bool = False,
    ) -> torch.Tensor:
        """Validate input waveform satisfies 1D float32 requirements."""
        if waveform is None:
            raise ValueError("Waveform cannot be None")

        if isinstance(waveform, np.ndarray):
            if waveform.size == 0:
                raise ValueError("Waveform cannot be empty (0 samples)")
            if not np.all(np.isfinite(waveform)):
                raise ValueError("Waveform contains NaN or Inf values")

            if waveform.ndim > 1:
                if auto_mono:
                    if waveform.ndim == 2:
                        if waveform.shape[0] in (1, 2, 4, 6, 8) and waveform.shape[1] > waveform.shape[0]:
                            waveform = np.mean(waveform, axis=0)
                        else:
                            waveform = np.mean(waveform, axis=1)
                    else:
                        waveform = np.mean(waveform.reshape(-1, waveform.shape[-1]), axis=0)
                else:
                    raise ValueError(f"Expected 1-D mono waveform, got shape {tuple(waveform.shape)}")

            if waveform.dtype != np.float32:
                waveform = waveform.astype(np.float32)
            tensor = torch.from_numpy(waveform)
        elif isinstance(waveform, torch.Tensor):
            if waveform.numel() == 0:
                raise ValueError("Waveform cannot be empty (0 samples)")
            if not torch.all(torch.isfinite(waveform)):
                raise ValueError("Waveform contains NaN or Inf values")

            if waveform.ndim > 1:
                if auto_mono:
                    if waveform.ndim == 2:
                        if waveform.shape[0] in (1, 2, 4, 6, 8) and waveform.shape[1] > waveform.shape[0]:
                            waveform = torch.mean(waveform, dim=0)
                        else:
                            waveform = torch.mean(waveform, dim=1)
                    else:
                        waveform = torch.mean(waveform.reshape(-1, waveform.shape[-1]), dim=0)
                else:
                    raise ValueError(f"Expected 1-D mono waveform, got shape {tuple(waveform.shape)}")
            tensor = waveform.float()
        else:
            raise TypeError(f"Expected numpy.ndarray or torch.Tensor, got {type(waveform).__name__}")

        if tensor.ndim != 1:
            raise ValueError(f"Expected 1-D mono waveform, got shape {tuple(tensor.shape)}")

        if tensor.numel() < 160:  # less than 10ms
            raise ValueError(f"Waveform too short for feature extraction: {tensor.numel()} samples")

        return tensor

    def standardize_duration(self, wav_tensor: torch.Tensor) -> torch.Tensor:
        """
        Standardize 1-D waveform tensor to TARGET_SAMPLES (64,000 samples / 4.0s @ 16 kHz).

        Short audio (< 4.0s): repeated/tiled up to 64,000 samples.
        Long audio (> 4.0s): center-cropped to 64,000 samples.
        """
        length = wav_tensor.numel()
        if length == TARGET_SAMPLES:
            return wav_tensor

        if length > TARGET_SAMPLES:
            start = (length - TARGET_SAMPLES) // 2
            return wav_tensor[start : start + TARGET_SAMPLES]

        # Tile shorter audio
        repeats = (TARGET_SAMPLES // length) + 1
        tiled = wav_tensor.repeat(repeats)[:TARGET_SAMPLES]
        return tiled

    @torch.no_grad()
    def detect(
        self,
        waveform: Union[np.ndarray, torch.Tensor],
        sample_rate: int = TARGET_SAMPLE_RATE,
        threshold: Optional[float] = None,
        auto_resample: bool = False,
        auto_mono: bool = False,
    ) -> DeepfakeV2Result:
        """
        Run deepfake detection on audio input.

        Parameters
        ----------
        waveform : np.ndarray | torch.Tensor
            1-D mono audio array, or multi-channel if auto_mono=True.
        sample_rate : int
            Audio sample rate (must be 16000 unless auto_resample=True).
        threshold : float | None
            Custom decision threshold (default: self.default_threshold).
        auto_resample : bool
            If True, automatically resamples non-16 kHz audio to 16 kHz.
        auto_mono : bool
            If True, automatically converts stereo/multi-channel to mono.

        Returns
        -------
        DeepfakeV2Result
        """
        if sample_rate != TARGET_SAMPLE_RATE:
            if not auto_resample:
                raise ValueError(f"DeepfakeV2Detector requires 16 kHz audio, got {sample_rate} Hz")

        start_time = time.perf_counter()
        thresh = float(threshold if threshold is not None else self.default_threshold)

        wav_tensor = self.validate_waveform(waveform, auto_mono=auto_mono)

        # Resample if requested and required
        if sample_rate != TARGET_SAMPLE_RATE:
            import torchaudio.transforms as T
            resampler = T.Resample(orig_freq=sample_rate, new_freq=TARGET_SAMPLE_RATE)
            wav_tensor = resampler(wav_tensor.unsqueeze(0)).squeeze(0)

        # Standardize duration to 4.0s (64,000 samples) matching training
        standardized_wav = self.standardize_duration(wav_tensor).to(self.device)

        # Extract log-mel features: (1, 1, 80, 401)
        features = self.feature_extractor(standardized_wav.unsqueeze(0))

        # Forward pass through CNN
        self.model.eval()
        logits = self.model(features).squeeze(0)  # (2,)
        probs = torch.softmax(logits, dim=-1)

        bonafide_logit = float(logits[DeepfakeCNN.LABEL_BONAFIDE].item())
        spoof_logit = float(logits[DeepfakeCNN.LABEL_SPOOF].item())

        bonafide_prob = float(probs[DeepfakeCNN.LABEL_BONAFIDE].item())
        spoof_prob = float(probs[DeepfakeCNN.LABEL_SPOOF].item())

        is_synthetic = bool(spoof_prob >= thresh)
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        return DeepfakeV2Result(
            synthetic_probability=spoof_prob,
            is_synthetic=is_synthetic,
            model_name=self.model_name,
            raw_logits=(bonafide_logit, spoof_logit),
            genuine_probability=bonafide_prob,
            threshold_used=thresh,
            inference_time_ms=elapsed_ms,
        )
