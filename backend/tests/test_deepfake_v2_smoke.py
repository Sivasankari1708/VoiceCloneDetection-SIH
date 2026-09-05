"""
backend/tests/test_deepfake_v2_smoke.py
=======================================
Unit and smoke tests for the ASVspoof 5 Deepfake CNN v2 system.

Covers:
  1. Protocol parsing (10-column space-separated Zenodo format, bonafide=0, spoof=1)
  2. Log-Mel spectrogram feature extraction (tensor shapes, normalization, numpy interop)
  3. DeepfakeCNN architecture (forward pass, gradients, predict_proba, parameter count)
  4. Metric computation (EER, ROC-AUC, accuracy)
  5. Trainer execution (synthetic batch forward + backward + checkpoint saving)
  6. Inference wrapper (DeepfakeV2Detector, DeepfakeV2Result contract, thresholding)
  7. Real ASVspoof 5 dataset smoke test (runs ONLY if real dataset is present on disk)
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import pytest
import torch
from torch.utils.data import DataLoader, TensorDataset

from backend.models.deepfake_v2 import (
    ASVspoof5Dataset,
    DeepfakeCNN,
    DeepfakeV2Detector,
    DeepfakeV2Result,
    LogMelFeatureExtractor,
    ProtocolEntry,
    Trainer,
    TrainingConfig,
    compute_eer,
    compute_metrics,
    create_dataloader,
    parse_asvspoof5_protocol,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]


# ─────────────────────────────────────────────────────────────────────────────
# 1. Protocol Parser Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_protocol_parser_valid_records():
    """Verify parsing standard 10-column space-separated ASVspoof 5 protocol."""
    content = (
        "T_0001 T_1000000001 M raw 0 0 bonafide bonafide bonafide -\n"
        "T_0002 T_1000000002 F alaw 64 42 A01 spoof spoof -\n"
        "T_0003 T_1000000003 M ulaw 128 43 A02 spoof spoof -\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".tsv", delete=False) as f:
        f.write(content)
        temp_path = Path(f.name)

    try:
        entries = parse_asvspoof5_protocol(temp_path)
        assert len(entries) == 3

        e0 = entries[0]
        assert e0.speaker_id == "T_0001"
        assert e0.file_name == "T_1000000001"
        assert e0.speaker_gender == "M"
        assert e0.key == "bonafide"
        assert e0.label_id == 0  # bonafide -> 0

        e1 = entries[1]
        assert e1.speaker_id == "T_0002"
        assert e1.file_name == "T_1000000002"
        assert e1.attack_tag == "A01"
        assert e1.key == "spoof"
        assert e1.label_id == 1  # spoof -> 1
    finally:
        temp_path.unlink(missing_ok=True)


def test_protocol_parser_limit_and_comments():
    """Verify parser honors limit and ignores comment or empty lines."""
    content = (
        "# Comment header line\n"
        "\n"
        "T_0001 T_1000000001 M raw 0 0 bonafide bonafide bonafide -\n"
        "T_0002 T_1000000002 F alaw 64 42 A01 spoof spoof -\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".tsv", delete=False) as f:
        f.write(content)
        temp_path = Path(f.name)

    try:
        entries = parse_asvspoof5_protocol(temp_path, limit=1)
        assert len(entries) == 1
        assert entries[0].file_name == "T_1000000001"
    finally:
        temp_path.unlink(missing_ok=True)


def test_protocol_parser_missing_file_error():
    """Verify parser raises FileNotFoundError for non-existent path."""
    with pytest.raises(FileNotFoundError):
        parse_asvspoof5_protocol(Path("/non/existent/path/protocol.tsv"))


# ─────────────────────────────────────────────────────────────────────────────
# 2. Feature Extractor Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_feature_extractor_shapes():
    """Verify LogMelFeatureExtractor output shapes for 1D, 2D, and 3D inputs."""
    extractor = LogMelFeatureExtractor(sample_rate=16_000, n_mels=80, n_fft=400, hop_length=160)

    # 1 second of audio = 16,000 samples -> 101 frames (16000 // 160 + 1)
    wav_1d = torch.randn(16_000)
    feat_1d = extractor(wav_1d)
    assert feat_1d.shape == (1, 1, 80, 101)

    # Batch of 3 samples, 2 seconds each = 32,000 samples -> 201 frames
    wav_2d = torch.randn(3, 32_000)
    feat_2d = extractor(wav_2d)
    assert feat_2d.shape == (3, 1, 80, 201)

    # Input as numpy array
    wav_np = np.random.randn(16_000).astype(np.float32)
    feat_np = extractor(wav_np)
    assert feat_np.shape == (1, 1, 80, 101)


def test_feature_extractor_normalization():
    """Verify mean-variance normalization across time & frequency."""
    extractor = LogMelFeatureExtractor(normalize=True)
    wav = torch.randn(2, 16_000)
    feat = extractor(wav)

    # Each instance should have mean ≈ 0 and std ≈ 1
    for b in range(2):
        instance = feat[b, 0]
        assert abs(instance.mean().item()) < 0.1
        assert abs(instance.std().item() - 1.0) < 0.1


# ─────────────────────────────────────────────────────────────────────────────
# 3. Model Architecture Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_deepfake_cnn_forward_and_params():
    """Verify forward pass shape, gradient flow, and parameter count."""
    model = DeepfakeCNN(dropout_rate=0.3, num_classes=2)
    num_params = model.get_num_params()
    assert num_params > 500_000  # Expect ~500k-1M parameters

    # Input: batch of 4, 1 channel, 80 mel bins, 100 time frames
    x = torch.randn(4, 1, 80, 100)
    logits = model(x)
    assert logits.shape == (4, 2)

    # Check softmax probabilities
    probs = model.predict_proba(x)
    assert probs.shape == (4, 2)
    assert torch.all(probs >= 0.0) and torch.all(probs <= 1.0)
    sums = probs.sum(dim=-1)
    assert torch.allclose(sums, torch.ones_like(sums), atol=1e-5)


def test_deepfake_cnn_gradient_flow():
    """Verify gradients propagate back through all conv blocks."""
    model = DeepfakeCNN()
    x = torch.randn(2, 1, 80, 64, requires_grad=True)
    target = torch.tensor([0, 1], dtype=torch.long)

    criterion = torch.nn.CrossEntropyLoss()
    logits = model(x)
    loss = criterion(logits, target)
    loss.backward()

    # Verify first conv layer weights have non-zero gradients
    assert model.block1.conv.weight.grad is not None
    assert torch.any(model.block1.conv.weight.grad != 0)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Metrics & EER Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_compute_eer_perfect_and_random():
    """Test EER calculation under known scenarios."""
    # Perfect separation: genuine scores close to 0, spoof scores close to 1
    y_true = np.array([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
    y_scores = np.array([0.05, 0.10, 0.15, 0.20, 0.25, 0.80, 0.85, 0.90, 0.95, 0.99])
    eer, thresh = compute_eer(y_true, y_scores)
    assert eer == 0.0
    assert 0.25 <= thresh <= 0.80


def test_compute_metrics_dict():
    """Test compute_metrics returns expected keys and values."""
    y_true = [0, 0, 1, 1]
    y_scores = [0.1, 0.2, 0.8, 0.9]
    metrics = compute_metrics(y_true, y_scores, loss=0.25, threshold=0.5)

    assert "loss" in metrics
    assert "accuracy" in metrics
    assert "auc" in metrics
    assert "eer" in metrics
    assert "eer_threshold" in metrics
    assert metrics["accuracy"] == 100.0
    assert metrics["auc"] == 100.0
    assert metrics["eer"] == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 5. Trainer Smoke Step
# ─────────────────────────────────────────────────────────────────────────────

def test_trainer_step_and_checkpoint():
    """Verify Trainer can perform 1 training epoch and save checkpoint."""
    model = DeepfakeCNN()
    config = TrainingConfig(
        epochs=1,
        lr=1e-3,
        batch_size=4,
        checkpoint_dir=tempfile.mkdtemp(),
        device="cpu",
    )

    # Synthetic batch of log-mel features: (8 samples, 1, 80, 50)
    dummy_x = torch.randn(8, 1, 80, 50)
    dummy_y = torch.tensor([0, 1, 0, 1, 0, 1, 0, 1], dtype=torch.long)
    dataset = TensorDataset(dummy_x, dummy_y, dummy_y)
    loader = DataLoader(dataset, batch_size=4)

    trainer = Trainer(model=model, config=config, train_loader=loader, val_loader=loader)
    train_metrics = trainer.train_epoch()
    assert np.isfinite(train_metrics["loss"])
    assert 0.0 <= train_metrics["accuracy"] <= 100.0

    val_metrics = trainer.evaluate()
    assert np.isfinite(val_metrics["loss"])

    ckpt_path = trainer.save_checkpoint(Path(config.checkpoint_dir) / "test.pt", epoch=1, metrics=val_metrics)
    assert ckpt_path.is_file()

    # Load back checkpoint
    loaded = trainer.load_checkpoint(ckpt_path)
    assert loaded["epoch"] == 1


# ─────────────────────────────────────────────────────────────────────────────
# 6. Inference Wrapper Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_inference_detector():
    """Verify DeepfakeV2Detector inference contract and outputs."""
    detector = DeepfakeV2Detector(device="cpu", default_threshold=0.5)
    wav = np.random.randn(16_000).astype(np.float32)

    result = detector.detect(wav)
    assert isinstance(result, DeepfakeV2Result)
    assert 0.0 <= result.synthetic_probability <= 1.0
    assert 0.0 <= result.genuine_probability <= 1.0
    assert abs((result.synthetic_probability + result.genuine_probability) - 1.0) < 1e-5
    assert isinstance(result.is_synthetic, bool)
    assert len(result.raw_logits) == 2
    assert result.model_name in ("ASVspoof5-DeepfakeCNN-v2", "DeepfakeCNN-v2-ASVspoof2019_LA")
    assert result.inference_time_ms > 0

    summary_str = result.summary()
    assert "synthetic_prob=" in summary_str
    assert "genuine_prob=" in summary_str


def test_inference_threshold_adjustment():
    """Verify custom threshold in detect() affects is_synthetic."""
    detector = DeepfakeV2Detector(device="cpu")
    wav = np.random.randn(16_000).astype(np.float32)

    # With threshold 0.0 -> is_synthetic must be True
    res_low = detector.detect(wav, threshold=0.0)
    assert res_low.is_synthetic is True

    # With threshold 1.01 -> is_synthetic must be False
    res_high = detector.detect(wav, threshold=1.01)
    assert res_high.is_synthetic is False


def test_inference_input_validation():
    """Verify detector validates sample rate, dimension, and length."""
    detector = DeepfakeV2Detector(device="cpu")

    # Wrong sample rate
    with pytest.raises(ValueError, match="16 kHz"):
        detector.detect(np.zeros(16000, dtype=np.float32), sample_rate=8000)

    # Wrong dimensions (2D)
    with pytest.raises(ValueError, match="1-D mono"):
        detector.detect(np.zeros((2, 16000), dtype=np.float32))

    # Too short (< 10ms)
    with pytest.raises(ValueError, match="too short"):
        detector.detect(np.zeros(50, dtype=np.float32))


# ─────────────────────────────────────────────────────────────────────────────
# 7. Real ASVspoof 5 Dataset Smoke Test (Runs ONLY if data present)
# ─────────────────────────────────────────────────────────────────────────────

def test_real_asvspoof5_smoke_if_present(capsys):
    """
    Smoke test on actual ASVspoof 5 dataset using a minimal real batch.

    Demonstrates end-to-end forward pipeline on real audio:
      real ASVspoof audio
      → load (soundfile float32 mono @ 16 kHz)
      → preprocessing (length standardization / pad-crop)
      → Log-Mel spectrogram feature extraction
      → CNN forward pass
      → loss calculation (CrossEntropyLoss)

    Per strict requirement:
      - Does NOT train the full model.
      - Uses only a very small number of actual files (batch size 2).
      - Never generates fake/dummy/synthetic audio.
      - If data is absent, prints clear DATA NOT FOUND message and skips cleanly.
    """
    data_dir = PROJECT_ROOT / "data" / "asvspoof5"
    protocol_file = data_dir / "protocols" / "ASVspoof5.train.tsv"
    audio_dir = data_dir / "flac_T"

    if not protocol_file.is_file() or not audio_dir.is_dir():
        msg = (
            f"\n[ASVspoof 5 Smoke Test] DATA NOT FOUND: ASVspoof 5 dataset not present at {data_dir}. "
            "Skipping live data test (no synthetic audio generated per requirement)."
        )
        print(msg)
        pytest.skip("ASVspoof 5 dataset files not present on local disk.")

    entries = parse_asvspoof5_protocol(protocol_file, audio_dir=audio_dir, limit=4)
    if len(entries) == 0:
        pytest.skip("No protocol entries parsed from ASVspoof5.train.tsv.")

    dataset = ASVspoof5Dataset(
        entries=entries,
        audio_dir=audio_dir,
        target_duration_sec=3.0,
        sample_rate=16_000,
        is_training=True,
        filter_missing=True,
    )
    if len(dataset) < 2:
        pytest.skip(f"Need at least 2 real audio files in flac_T, found {len(dataset)}.")

    # 1. Load small batch of real ASVspoof audio
    dataloader = create_dataloader(dataset, batch_size=2, shuffle=False)
    batch_features, batch_labels, batch_meta = next(iter(dataloader))

    # 2. Preprocessing & Log-Mel verification
    assert batch_features.ndim == 4  # (B, 1, n_mels=80, time)
    assert batch_features.shape[0] == 2
    assert batch_features.shape[1] == 1
    assert batch_features.shape[2] == 80
    assert torch.isfinite(batch_features).all()

    # 3. CNN forward pass
    model = DeepfakeCNN()
    model.eval()
    with torch.no_grad():
        logits = model(batch_features)  # (B, 2)
    assert logits.shape == (2, 2)
    assert torch.isfinite(logits).all()

    # 4. Loss calculation
    criterion = torch.nn.CrossEntropyLoss()
    loss = criterion(logits, batch_labels)
    assert loss.ndim == 0
    assert torch.isfinite(loss)
    assert loss.item() > 0.0

    print(
        f"\n[ASVspoof 5 Smoke Test] Successfully passed {len(batch_labels)} real samples "
        f"through CNN pipeline. Loss: {loss.item():.4f}"
    )
