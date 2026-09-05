"""
backend/models/deepfake_v2/features.py
======================================
Feature extraction module for Deepfake CNN v2.

Extracts normalized Log-Mel Spectrograms from 16 kHz mono float32 waveforms:
- Sample rate: 16,000 Hz
- Mel bins: 80
- Window: 25 ms (400 samples at 16 kHz)
- Hop: 10 ms (160 samples at 16 kHz)
- Frequency range: 20 Hz – 8,000 Hz
- Dynamic range log compression: log(mel + 1e-6)
- Mean-variance normalization across time & frequency
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torchaudio.transforms as T
import numpy as np


class LogMelFeatureExtractor(nn.Module):
    """
    Converts 16 kHz mono audio waveforms into standardized Log-Mel Spectrograms.

    Output shape: (B, 1, n_mels, time_frames)
    """

    def __init__(
        self,
        sample_rate: int = 16_000,
        n_mels: int = 80,
        n_fft: int = 400,
        hop_length: int = 160,
        f_min: float = 20.0,
        f_max: float = 8000.0,
        eps: float = 1e-6,
        normalize: bool = True,
    ) -> None:
        super().__init__()
        self.sample_rate = sample_rate
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length
        self.f_min = f_min
        self.f_max = f_max
        self.eps = eps
        self.normalize = normalize

        self.mel_transform = T.MelSpectrogram(
            sample_rate=sample_rate,
            n_fft=n_fft,
            win_length=n_fft,
            hop_length=hop_length,
            f_min=f_min,
            f_max=f_max,
            n_mels=n_mels,
            power=2.0,
            center=True,
            pad_mode="reflect",
            norm="slaney",
            mel_scale="slaney",
        )

    def forward(self, waveform: torch.Tensor | np.ndarray) -> torch.Tensor:
        """
        Extract Log-Mel Spectrograms.

        Parameters
        ----------
        waveform:
            Input tensor or numpy array.
            Shapes supported:
              - (T,) -> outputs (1, 1, n_mels, time_frames)
              - (B, T) -> outputs (B, 1, n_mels, time_frames)
              - (B, 1, T) -> outputs (B, 1, n_mels, time_frames)

        Returns
        -------
        torch.Tensor
            Log-Mel spectrogram tensor of shape (B, 1, n_mels, time_frames).
        """
        if isinstance(waveform, np.ndarray):
            waveform = torch.from_numpy(waveform)

        if not torch.is_floating_point(waveform):
            waveform = waveform.float()

        # Handle shapes
        if waveform.ndim == 1:
            waveform = waveform.unsqueeze(0)  # (1, T)
        elif waveform.ndim == 3 and waveform.size(1) == 1:
            waveform = waveform.squeeze(1)   # (B, T)
        elif waveform.ndim != 2:
            raise ValueError(f"Expected waveform of ndim 1, 2, or (B, 1, T), got ndim={waveform.ndim}")

        device = next(self.parameters()).device if list(self.parameters()) else waveform.device
        waveform = waveform.to(device)

        # mel_transform expects (..., time) -> outputs (..., n_mels, time)
        mel_spec = self.mel_transform(waveform)
        log_mel = torch.log(mel_spec + self.eps)

        if self.normalize:
            # Per-instance zero-mean unit-variance normalisation across (mel, time)
            mean = log_mel.mean(dim=(-2, -1), keepdim=True)
            std = log_mel.std(dim=(-2, -1), keepdim=True)
            log_mel = (log_mel - mean) / (std + self.eps)

        # Add channel dimension: (B, n_mels, time) -> (B, 1, n_mels, time)
        if log_mel.ndim == 3:
            log_mel = log_mel.unsqueeze(1)

        return log_mel
