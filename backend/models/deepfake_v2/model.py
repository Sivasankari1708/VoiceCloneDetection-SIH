"""
backend/models/deepfake_v2/model.py
===================================
Lightweight 4-block Conv2D architecture for deepfake audio detection.

Designed for ASVspoof 5 synthetic speech classification:
- Input: (B, 1, 80, T) log-mel spectrogram
- 4× Conv2d + BatchNorm + ReLU + MaxPool blocks
- Time-invariant Global Adaptive Average Pooling
- Multi-layer perceptron classification head
- Output: 2 logits:
    Index 0 = bonafide (genuine human speech)
    Index 1 = spoof (synthetic / clone / deepfake)
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvBlock(nn.Module):
    """Conv2D -> BatchNorm -> ReLU -> MaxPool2D."""

    def __init__(self, in_channels: int, out_channels: int, pool_size: int = 2) -> None:
        super().__init__()
        self.conv = nn.Conv2d(
            in_channels,
            out_channels,
            kernel_size=3,
            stride=1,
            padding=1,
            bias=False,
        )
        self.bn = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)
        self.pool = nn.MaxPool2d(kernel_size=pool_size, stride=pool_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.pool(self.relu(self.bn(self.conv(x))))


class DeepfakeCNN(nn.Module):
    """
    4-block CNN for deepfake audio classification.

    Parameters
    ----------
    dropout_rate : float
        Dropout probability in the dense head (default: 0.3).
    num_classes : int
        Number of output classes (default: 2 -> bonafide=0, spoof=1).
    """

    LABEL_BONAFIDE: int = 0
    LABEL_SPOOF: int = 1

    def __init__(self, dropout_rate: float = 0.3, num_classes: int = 2) -> None:
        super().__init__()

        # Feature extraction backbone (4 blocks)
        self.block1 = ConvBlock(1, 32)
        self.block2 = ConvBlock(32, 64)
        self.block3 = ConvBlock(64, 128)
        self.block4 = ConvBlock(128, 256)

        # Global average pooling produces time & frequency invariant representation
        self.global_pool = nn.AdaptiveAvgPool2d((1, 1))

        # Classification head
        self.classifier = nn.Sequential(
            nn.Linear(256, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout_rate),
            nn.Linear(512, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(p=dropout_rate),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Parameters
        ----------
        x : torch.Tensor
            Log-mel spectrogram tensor of shape (B, 1, n_mels, T) or (B, n_mels, T).

        Returns
        -------
        torch.Tensor
            Raw logits of shape (B, 2).
            Index 0 = bonafide logit, Index 1 = spoof logit.
        """
        if x.ndim == 3:
            x = x.unsqueeze(1)  # (B, 1, mel, time)

        feat = self.block1(x)
        feat = self.block2(feat)
        feat = self.block3(feat)
        feat = self.block4(feat)

        pooled = self.global_pool(feat)  # (B, 256, 1, 1)
        flat = torch.flatten(pooled, 1)   # (B, 256)

        logits = self.classifier(flat)   # (B, 2)
        return logits

    @torch.no_grad()
    def predict_proba(self, x: torch.Tensor) -> torch.Tensor:
        """
        Compute softmax probabilities for class 0 (bonafide) and 1 (spoof).

        Returns
        -------
        torch.Tensor of shape (B, 2) with normalized probabilities summing to 1.0.
        """
        self.eval()
        logits = self.forward(x)
        return F.softmax(logits, dim=-1)

    def get_num_params(self) -> int:
        """Return total number of trainable parameters."""
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
