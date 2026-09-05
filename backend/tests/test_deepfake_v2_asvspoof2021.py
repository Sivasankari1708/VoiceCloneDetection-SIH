"""
backend/tests/test_deepfake_v2_asvspoof2021.py
==============================================
Unit and smoke tests for DeepfakeCNN v2 using the real asvspoof2021_mixed dataset.

Verifies:
  1. Dataset discovery: Recursively finds all real (1017) and fake (1000) WAV files.
  2. Correct class labels: real_voice -> 0 (bonafide), fake_voice -> 1 (spoof).
  3. No empty classes: Raises ValueError/FileNotFoundError if a class folder is missing/empty.
  4. Deterministic splitting: Same split_seed generates identical train and val sets.
  5. No train/validation overlap: Train and validation sets are strictly disjoint.
  6. Loading at least one real sample: Verified float32 mono @ 16 kHz.
  7. Loading at least one fake sample: Verified float32 mono @ 16 kHz.
  8. Forward pass through DeepfakeCNN: Batch of real + fake audio yields (B, 2) logits.
  9. Loss computation: CrossEntropyLoss computes finite positive scalar loss with backprop.
 10. Checkpoint save/load: Checkpoint with metadata saves to disk and loads into DeepfakeV2Detector.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
import torch
import torch.nn as nn

from backend.models.deepfake_v2 import (
    DeepfakeCNN,
    DeepfakeV2Detector,
    FolderAudioDataset,
    FolderAudioEntry,
    LogMelFeatureExtractor,
    Trainer,
    TrainingConfig,
    create_dataloader,
    split_folder_dataset,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_ROOT = PROJECT_ROOT / "data" / "asvspoof2021_mixed"


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def require_dataset():
    """Ensure data/asvspoof2021_mixed is present."""
    if not DATASET_ROOT.is_dir():
        pytest.skip(f"Dataset directory not found: {DATASET_ROOT}")
    real_dir = DATASET_ROOT / "real_voice"
    fake_dir = DATASET_ROOT / "fake_voice"
    if not real_dir.is_dir() or not fake_dir.is_dir():
        pytest.skip(f"real_voice or fake_voice missing in {DATASET_ROOT}")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Dataset Discovery
# ─────────────────────────────────────────────────────────────────────────────

def test_1_dataset_discovery(require_dataset):
    """Verify recursive discovery finds all real and fake files."""
    real_files = list((DATASET_ROOT / "real_voice").rglob("*.wav"))
    fake_files = list((DATASET_ROOT / "fake_voice").rglob("*.wav"))

    assert len(real_files) == 1017, f"Expected 1017 real files, found {len(real_files)}"
    assert len(fake_files) == 1000, f"Expected 1000 fake files, found {len(fake_files)}"
    assert len(real_files) + len(fake_files) == 2017


# ─────────────────────────────────────────────────────────────────────────────
# 2. Correct Class Labels
# ─────────────────────────────────────────────────────────────────────────────

def test_2_correct_class_labels(require_dataset):
    """Verify real_voice maps to label 0 and fake_voice maps to label 1."""
    train_e, val_e = split_folder_dataset(
        data_dir=DATASET_ROOT,
        class_mapping={"real_voice": 0, "fake_voice": 1},
        val_ratio=0.2,
        seed=42,
    )
    all_entries = train_e + val_e

    for entry in all_entries:
        if entry.label_name == "real_voice":
            assert entry.label_id == 0, f"Expected 0 for real_voice, got {entry.label_id}"
        elif entry.label_name == "fake_voice":
            assert entry.label_id == 1, f"Expected 1 for fake_voice, got {entry.label_id}"
        else:
            pytest.fail(f"Unexpected label_name: {entry.label_name}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. No Empty Classes Validation
# ─────────────────────────────────────────────────────────────────────────────

def test_3_no_empty_classes():
    """Verify split_folder_dataset fails clearly when a class folder is missing or empty."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        (tmp_path / "real_voice").mkdir()  # empty dir
        (tmp_path / "fake_voice").mkdir()

        with pytest.raises(ValueError, match="contains zero audio files"):
            split_folder_dataset(tmp_path)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        # missing fake_voice dir; put a dummy wav in real_voice
        real_dir = tmp_path / "real_voice"
        real_dir.mkdir()
        (real_dir / "sample.wav").write_bytes(b"dummy")

        with pytest.raises(FileNotFoundError, match="Required class directory not found"):
            split_folder_dataset(tmp_path)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Deterministic Splitting
# ─────────────────────────────────────────────────────────────────────────────

def test_4_deterministic_splitting(require_dataset):
    """Verify same seed produces identical splits across multiple invocations."""
    train1, val1 = split_folder_dataset(DATASET_ROOT, seed=42, val_ratio=0.2)
    train2, val2 = split_folder_dataset(DATASET_ROOT, seed=42, val_ratio=0.2)

    assert len(train1) == len(train2)
    assert len(val1) == len(val2)

    paths_train1 = [str(e.file_path) for e in train1]
    paths_train2 = [str(e.file_path) for e in train2]
    assert paths_train1 == paths_train2, "Train split was not deterministic"

    paths_val1 = [str(e.file_path) for e in val1]
    paths_val2 = [str(e.file_path) for e in val2]
    assert paths_val1 == paths_val2, "Validation split was not deterministic"


# ─────────────────────────────────────────────────────────────────────────────
# 5. No Train / Validation Overlap
# ─────────────────────────────────────────────────────────────────────────────

def test_5_no_train_val_overlap(require_dataset):
    """Verify that train and validation splits have strictly zero file overlap."""
    train_entries, val_entries = split_folder_dataset(DATASET_ROOT, seed=42, val_ratio=0.2)

    train_paths = {e.file_path for e in train_entries}
    val_paths = {e.file_path for e in val_entries}

    overlap = train_paths.intersection(val_paths)
    assert len(overlap) == 0, f"Found {len(overlap)} overlapping files between train and val"
    assert len(train_paths) + len(val_paths) == 2017


# ─────────────────────────────────────────────────────────────────────────────
# 6. Loading at Least One Real Sample
# ─────────────────────────────────────────────────────────────────────────────

def test_6_load_real_sample(require_dataset):
    """Verify loading real sample produces float32 mono @ 16 kHz."""
    real_files = sorted(list((DATASET_ROOT / "real_voice").glob("*.wav")))
    assert len(real_files) > 0
    sample_path = real_files[0]

    data, sr = sf.read(str(sample_path), dtype="float32")
    assert sr == 16000, f"Expected 16 kHz sample rate, got {sr}"
    assert data.ndim == 1, f"Expected mono audio, got ndim={data.ndim}"
    assert data.dtype == np.float32, f"Expected float32, got {data.dtype}"
    assert len(data) > 0

    # Test through FolderAudioDataset
    entry = FolderAudioEntry(sample_path, sample_path.name, 0, "real_voice")
    dataset = FolderAudioDataset([entry], target_duration_sec=3.0)
    feat, label, meta = dataset[0]

    assert label == 0
    assert feat.ndim == 3  # (1, n_mels=80, time)
    assert feat.shape[0] == 1
    assert feat.shape[1] == 80
    assert torch.isfinite(feat).all()
    assert meta["label_name"] == "real_voice"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Loading at Least One Fake Sample
# ─────────────────────────────────────────────────────────────────────────────

def test_7_load_fake_sample(require_dataset):
    """Verify loading fake sample produces float32 mono @ 16 kHz."""
    fake_files = sorted(list((DATASET_ROOT / "fake_voice").glob("*.wav")))
    assert len(fake_files) > 0
    sample_path = fake_files[0]

    data, sr = sf.read(str(sample_path), dtype="float32")
    assert sr == 16000, f"Expected 16 kHz sample rate, got {sr}"
    assert data.ndim == 1, f"Expected mono audio, got ndim={data.ndim}"
    assert data.dtype == np.float32, f"Expected float32, got {data.dtype}"
    assert len(data) > 0

    # Test through FolderAudioDataset
    entry = FolderAudioEntry(sample_path, sample_path.name, 1, "fake_voice")
    dataset = FolderAudioDataset([entry], target_duration_sec=3.0)
    feat, label, meta = dataset[0]

    assert label == 1
    assert feat.ndim == 3  # (1, n_mels=80, time)
    assert feat.shape[0] == 1
    assert feat.shape[1] == 80
    assert torch.isfinite(feat).all()
    assert meta["label_name"] == "fake_voice"


# ─────────────────────────────────────────────────────────────────────────────
# 8. Forward Pass Through DeepfakeCNN
# ─────────────────────────────────────────────────────────────────────────────

def test_8_forward_pass_deepfake_cnn(require_dataset):
    """Verify forward pass of real + fake batch yields (B, 2) logits."""
    real_sample = sorted(list((DATASET_ROOT / "real_voice").glob("*.wav")))[0]
    fake_sample = sorted(list((DATASET_ROOT / "fake_voice").glob("*.wav")))[0]

    entries = [
        FolderAudioEntry(real_sample, real_sample.name, 0, "real_voice"),
        FolderAudioEntry(fake_sample, fake_sample.name, 1, "fake_voice"),
    ]
    dataset = FolderAudioDataset(entries, target_duration_sec=3.0)
    dataloader = create_dataloader(dataset, batch_size=2, shuffle=False)

    batch_feat, batch_labels, _ = next(iter(dataloader))
    assert batch_feat.shape == (2, 1, 80, 301)  # 3s @ 16kHz -> ~301 frames
    assert batch_labels.tolist() == [0, 1]

    model = DeepfakeCNN()
    model.eval()
    with torch.no_grad():
        logits = model(batch_feat)
        probs = model.predict_proba(batch_feat)

    assert logits.shape == (2, 2)
    assert probs.shape == (2, 2)
    assert torch.isfinite(logits).all()
    assert torch.allclose(probs.sum(dim=-1), torch.tensor([1.0, 1.0]))


# ─────────────────────────────────────────────────────────────────────────────
# 9. Loss Computation and Gradients
# ─────────────────────────────────────────────────────────────────────────────

def test_9_loss_computation_and_gradients(require_dataset):
    """Verify CrossEntropyLoss computes valid positive loss and flows gradients."""
    real_sample = sorted(list((DATASET_ROOT / "real_voice").glob("*.wav")))[0]
    fake_sample = sorted(list((DATASET_ROOT / "fake_voice").glob("*.wav")))[0]

    entries = [
        FolderAudioEntry(real_sample, real_sample.name, 0, "real_voice"),
        FolderAudioEntry(fake_sample, fake_sample.name, 1, "fake_voice"),
    ]
    dataset = FolderAudioDataset(entries, target_duration_sec=3.0)
    dataloader = create_dataloader(dataset, batch_size=2, shuffle=False)
    batch_feat, batch_labels, _ = next(iter(dataloader))

    model = DeepfakeCNN()
    model.train()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)

    logits = model(batch_feat)
    criterion = nn.CrossEntropyLoss()
    loss = criterion(logits, batch_labels)

    assert loss.ndim == 0
    assert torch.isfinite(loss)
    assert loss.item() > 0.0

    optimizer.zero_grad()
    loss.backward()

    # Verify gradients flow into convolutional weights
    assert model.block1.conv.weight.grad is not None
    assert torch.isfinite(model.block1.conv.weight.grad).all()
    assert model.classifier[0].weight.grad is not None


# ─────────────────────────────────────────────────────────────────────────────
# 10. Checkpoint Save and Load
# ─────────────────────────────────────────────────────────────────────────────

def test_10_checkpoint_save_and_load(require_dataset):
    """Verify Trainer checkpoint saving with metadata and loading into DeepfakeV2Detector."""
    with tempfile.TemporaryDirectory() as tmpdir:
        ckpt_dir = Path(tmpdir)
        ckpt_path = ckpt_dir / "deepfake_v2_asvspoof2021_mixed.pt"

        extra_metadata = {
            "dataset_name": "asvspoof2021_mixed",
            "dataset_path": str(DATASET_ROOT),
            "class_mapping": {"real_voice": 0, "fake_voice": 1},
            "split_seed": 42,
            "train_count": 1614,
            "validation_count": 403,
            "model_architecture": "DeepfakeCNN",
        }
        config = TrainingConfig(
            epochs=1,
            checkpoint_dir=ckpt_dir,
            extra_metadata=extra_metadata,
            device="cpu",
        )
        model = DeepfakeCNN()
        trainer = Trainer(
            model=model,
            config=config,
            train_loader=None,
            val_loader=None,
        )

        saved_path = trainer.save_checkpoint(
            filepath=ckpt_path,
            epoch=1,
            metrics={"eer": 2.5, "loss": 0.12},
            is_best=True,
            extra_metadata={"custom_note": "prototype test"},
        )

        assert saved_path.is_file()
        assert (ckpt_dir / "deepfake_v2_asvspoof2021_mixed.metadata.json").is_file()
        assert (ckpt_dir / "best_model.pt").is_file()

        # Load into DeepfakeV2Detector
        detector = DeepfakeV2Detector(checkpoint_path=saved_path, device="cpu")
        assert detector.metadata.get("dataset_name") == "asvspoof2021_mixed"
        assert detector.metadata.get("custom_note") == "prototype test"
        assert detector.model_name == "DeepfakeCNN-v2-asvspoof2021_mixed"

        # Run inference with loaded detector on real sample
        real_sample = sorted(list((DATASET_ROOT / "real_voice").glob("*.wav")))[0]
        data, sr = sf.read(str(real_sample), dtype="float32")
        result = detector.detect(data)

        assert 0.0 <= result.synthetic_probability <= 1.0
        assert 0.0 <= result.genuine_probability <= 1.0
        assert result.model_name == "DeepfakeCNN-v2-asvspoof2021_mixed"
        assert isinstance(result.summary(), str)
