"""
backend/models/deepfake_v2/trainer.py
=====================================
Training loop, validation, checkpointing, and ASVspoof metric computation.

Metrics:
  - Cross-Entropy Loss
  - Accuracy
  - ROC-AUC
  - EER (Equal Error Rate) — standard ASVspoof evaluation metric
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score, roc_curve
from torch.utils.data import DataLoader

from backend.models.deepfake_v2.model import DeepfakeCNN
from backend.utils.logger import get_logger

log = get_logger(__name__)


@dataclass
class TrainingConfig:
    """Configuration parameters for DeepfakeCNN training."""
    epochs: int = 10
    lr: float = 1e-4
    weight_decay: float = 1e-4
    batch_size: int = 32
    checkpoint_dir: Union[str, Path] = "checkpoints/deepfake_v2"
    device: str = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    class_weights: Optional[List[float]] = None
    save_best_metric: str = "eer"  # "eer" (lower is better) or "auc" (higher is better)
    eval_every: int = 1
    extra_metadata: Optional[Dict[str, Any]] = None


def compute_eer(y_true: np.ndarray, y_scores: np.ndarray) -> Tuple[float, float]:
    """
    Compute Equal Error Rate (EER) and the optimal threshold.

    Parameters
    ----------
    y_true : np.ndarray
        Ground truth binary labels (0 = bonafide, 1 = spoof).
    y_scores : np.ndarray
        Prediction scores / probabilities for class 1 (spoof).

    Returns
    -------
    Tuple[float, float]
        (eer_percentage, eer_threshold)
    """
    y_true = np.asarray(y_true)
    y_scores = np.asarray(y_scores)

    # Edge cases: single class in validation set
    if len(np.unique(y_true)) < 2:
        return 0.0, 0.5

    fpr, tpr, thresholds = roc_curve(y_true, y_scores, pos_label=1)
    fnr = 1.0 - tpr

    # Find points where FPR and FNR are closest
    diffs = np.abs(fpr - fnr)
    idx = np.nanargmin(diffs)
    eer = (fpr[idx] + fnr[idx]) / 2.0
    threshold = thresholds[idx]

    return float(eer * 100.0), float(threshold)


def compute_metrics(
    y_true: List[int],
    y_scores: List[float],
    loss: float = 0.0,
    threshold: float = 0.5,
) -> Dict[str, float]:
    """Compute complete metric dictionary: loss, accuracy, auc, eer."""
    y_true_arr = np.array(y_true)
    y_scores_arr = np.array(y_scores)
    preds = (y_scores_arr >= threshold).astype(int)

    acc = float(np.mean(preds == y_true_arr)) * 100.0 if len(y_true_arr) > 0 else 0.0

    if len(np.unique(y_true_arr)) >= 2:
        try:
            auc = float(roc_auc_score(y_true_arr, y_scores_arr)) * 100.0
        except Exception:
            auc = 50.0
        eer, eer_thresh = compute_eer(y_true_arr, y_scores_arr)
    else:
        auc = 100.0 if acc == 100.0 else 50.0
        eer, eer_thresh = 0.0, 0.5

    return {
        "loss": float(loss),
        "accuracy": acc,
        "auc": auc,
        "eer": eer,
        "eer_threshold": eer_thresh,
    }


class Trainer:
    """Manages model training, evaluation, and checkpoint saving."""

    def __init__(
        self,
        model: DeepfakeCNN,
        config: TrainingConfig,
        train_loader: Optional[DataLoader] = None,
        val_loader: Optional[DataLoader] = None,
    ) -> None:
        self.model = model
        self.config = config
        self.train_loader = train_loader
        self.val_loader = val_loader

        self.device = torch.device(config.device)
        self.model.to(self.device)

        # Class weights if dataset is imbalanced
        if config.class_weights:
            weights = torch.tensor(config.class_weights, dtype=torch.float32, device=self.device)
            self.criterion = nn.CrossEntropyLoss(weight=weights)
        else:
            self.criterion = nn.CrossEntropyLoss()

        self.optimizer = torch.optim.AdamW(
            self.model.parameters(),
            lr=config.lr,
            weight_decay=config.weight_decay,
        )

        self.checkpoint_dir = Path(config.checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.best_eer = float("inf")
        self.best_auc = -float("inf")

    def train_epoch(self, loader: Optional[DataLoader] = None) -> Dict[str, float]:
        """Run one training epoch."""
        data_loader = loader or self.train_loader
        if data_loader is None:
            raise ValueError("No train_loader provided")

        self.model.train()
        total_loss = 0.0
        y_trues: List[int] = []
        y_scores: List[float] = []

        for batch_idx, (features, labels, _) in enumerate(data_loader):
            features = features.to(self.device)
            labels = labels.to(self.device)

            self.optimizer.zero_grad()
            logits = self.model(features)
            loss = self.criterion(logits, labels)
            loss.backward()
            self.optimizer.step()

            total_loss += loss.item() * features.size(0)

            probs = torch.softmax(logits, dim=-1)
            spoof_probs = probs[:, DeepfakeCNN.LABEL_SPOOF].detach().cpu().tolist()
            y_scores.extend(spoof_probs)
            y_trues.extend(labels.detach().cpu().tolist())

        avg_loss = total_loss / max(1, len(y_trues))
        return compute_metrics(y_trues, y_scores, loss=avg_loss)

    @torch.no_grad()
    def evaluate(self, loader: Optional[DataLoader] = None) -> Dict[str, float]:
        """Evaluate model on validation loader."""
        data_loader = loader or self.val_loader
        if data_loader is None:
            raise ValueError("No val_loader provided")

        self.model.eval()
        total_loss = 0.0
        y_trues: List[int] = []
        y_scores: List[float] = []

        for features, labels, _ in data_loader:
            features = features.to(self.device)
            labels = labels.to(self.device)

            logits = self.model(features)
            loss = self.criterion(logits, labels)

            total_loss += loss.item() * features.size(0)
            probs = torch.softmax(logits, dim=-1)
            spoof_probs = probs[:, DeepfakeCNN.LABEL_SPOOF].cpu().tolist()
            y_scores.extend(spoof_probs)
            y_trues.extend(labels.cpu().tolist())

        avg_loss = total_loss / max(1, len(y_trues))
        return compute_metrics(y_trues, y_scores, loss=avg_loss)

    def save_checkpoint(
        self,
        filepath: Union[str, Path],
        epoch: int,
        metrics: Dict[str, float],
        is_best: bool = False,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ) -> Path:
        """Save training checkpoint and associated metadata."""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        meta = dict(self.config.extra_metadata or {})
        if extra_metadata:
            meta.update(extra_metadata)

        payload = {
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "config": {k: str(v) if isinstance(v, Path) else v for k, v in vars(self.config).items()},
            "metrics": metrics,
            "metadata": meta,
        }
        torch.save(payload, str(filepath))
        log.info("Saved checkpoint to %s (EER: %.2f%%, Loss: %.4f)", filepath.name, metrics.get("eer", 0.0), metrics.get("loss", 0.0))

        # Save human-readable JSON metadata alongside checkpoint
        meta_json_path = filepath.parent / f"{filepath.stem}.metadata.json"
        try:
            full_meta = {
                "checkpoint": str(filepath.name),
                "epoch": epoch,
                "metrics": metrics,
                "config": payload["config"],
                "metadata": meta,
            }
            with open(meta_json_path, "w", encoding="utf-8") as f:
                json.dump(full_meta, f, indent=2, default=str)
        except Exception as exc:
            log.warning("Could not write JSON metadata to %s: %s", meta_json_path, exc)

        if is_best:
            best_path = filepath.parent / "best_model.pt"
            torch.save(payload, str(best_path))
            log.info("Updated best model checkpoint: %s", best_path.name)
            best_json_path = filepath.parent / "best_model.metadata.json"
            try:
                with open(best_json_path, "w", encoding="utf-8") as f:
                    json.dump(full_meta, f, indent=2, default=str)
            except Exception:
                pass

        return filepath

    def load_checkpoint(self, filepath: Union[str, Path]) -> Dict[str, Any]:
        """Load model state and optimizer state from checkpoint."""
        filepath = Path(filepath)
        if not filepath.is_file():
            raise FileNotFoundError(f"Checkpoint not found at: {filepath}")

        checkpoint = torch.load(str(filepath), map_location=self.device)
        self.model.load_state_dict(checkpoint["model_state_dict"])
        if "optimizer_state_dict" in checkpoint and hasattr(self, "optimizer"):
            self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        log.info("Loaded checkpoint from %s (Epoch: %s)", filepath.name, checkpoint.get("epoch"))
        return checkpoint

    def fit(self) -> List[Dict[str, Any]]:
        """Run full training and validation loop for self.config.epochs."""
        history = []
        log.info(
            "Starting training for %d epochs on device '%s' (Parameters: %d)",
            self.config.epochs,
            self.device,
            self.model.get_num_params(),
        )

        for epoch in range(1, self.config.epochs + 1):
            train_metrics = self.train_epoch()
            val_metrics = self.evaluate() if self.val_loader else {}

            log.info(
                "Epoch %d/%d — Train Loss: %.4f, Acc: %.2f%%, EER: %.2f%% | Val Loss: %.4f, Acc: %.2f%%, EER: %.2f%%",
                epoch,
                self.config.epochs,
                train_metrics["loss"],
                train_metrics["accuracy"],
                train_metrics["eer"],
                val_metrics.get("loss", 0.0),
                val_metrics.get("accuracy", 0.0),
                val_metrics.get("eer", 0.0),
            )

            is_best = False
            current_eer = val_metrics.get("eer", train_metrics["eer"])
            if current_eer < self.best_eer:
                self.best_eer = current_eer
                is_best = True

            ckpt_name = f"epoch_{epoch:03d}.pt"
            self.save_checkpoint(
                self.checkpoint_dir / ckpt_name,
                epoch=epoch,
                metrics=val_metrics or train_metrics,
                is_best=is_best,
            )

            history.append({
                "epoch": epoch,
                "train": train_metrics,
                "val": val_metrics,
                "is_best": is_best,
            })

        return history
