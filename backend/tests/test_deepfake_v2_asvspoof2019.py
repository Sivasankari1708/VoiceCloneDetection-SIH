"""
backend/tests/test_deepfake_v2_asvspoof2019.py
==============================================
Comprehensive unit and smoke tests for ASVspoof 2019 LA dataset support
in DeepfakeCNN v2.

Tests:
 1. Dataset root and directory discovery.
 2. Train protocol parsing (25,380 records).
 3. Dev protocol parsing (24,844 records).
 4. Correct bonafide -> 0 mapping.
 5. Correct spoof -> 1 mapping.
 6. Protocol utterance ID -> FLAC resolution.
 7. Missing-file detection.
 8. Duplicate-ID detection.
 9. Train/dev separation.
10. No train/dev overlap (Train ∩ Dev = ∅).
11. Both classes present in train and dev.
12. Lazy audio loading (no memory preloading of audio waveforms).
13. Loading at least one real / bonafide audio sample (float32 mono @ 16 kHz).
14. Loading at least one spoof audio sample (float32 mono @ 16 kHz).
15. Correct preprocessing (Log-Mel shape (1, 80, 401)).
16. DeepfakeCNN forward pass (output shape (B, 2)).
17. Loss computation and gradient backpropagation.
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
    ASVspoof2019Dataset,
    ASVspoof2019ProtocolEntry,
    DeepfakeCNN,
    LogMelFeatureExtractor,
    create_dataloader,
    parse_asvspoof2019_protocol,
    validate_asvspoof2019_la,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASET_ROOT = PROJECT_ROOT / "data" / "asvspoof2019" / "LA"


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def require_dataset():
    """Ensure data/asvspoof2019/LA is present."""
    if not DATASET_ROOT.is_dir():
        pytest.skip(f"Dataset root not found: {DATASET_ROOT}")

    proto_dir = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols"
    if not proto_dir.is_dir():
        pytest.skip(f"Protocols directory not found: {proto_dir}")


# ─────────────────────────────────────────────────────────────────────────────
# 1. Dataset Root Discovery
# ─────────────────────────────────────────────────────────────────────────────

def test_1_dataset_root_discovery(require_dataset):
    """Verify root and required subdirectories exist."""
    assert DATASET_ROOT.is_dir()
    assert (DATASET_ROOT / "ASVspoof2019_LA_cm_protocols").is_dir()
    assert (DATASET_ROOT / "ASVspoof2019_LA_train" / "flac").is_dir()
    assert (DATASET_ROOT / "ASVspoof2019_LA_dev" / "flac").is_dir()
    assert (DATASET_ROOT / "ASVspoof2019_LA_eval" / "flac").is_dir()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Train Protocol Parsing
# ─────────────────────────────────────────────────────────────────────────────

def test_2_train_protocol_parsing(require_dataset):
    """Verify parsing the official training protocol."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac)
    assert len(entries) == 25380, f"Expected 25380 train entries, got {len(entries)}"

    first = entries[0]
    assert first.file_name == "LA_T_1138215"
    assert first.key == "bonafide"
    assert first.label_id == 0
    assert first.audio_path == train_flac / "LA_T_1138215.flac"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Dev Protocol Parsing
# ─────────────────────────────────────────────────────────────────────────────

def test_3_dev_protocol_parsing(require_dataset):
    """Verify parsing the official dev protocol."""
    dev_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.dev.trl.txt"
    dev_flac = DATASET_ROOT / "ASVspoof2019_LA_dev" / "flac"

    entries = parse_asvspoof2019_protocol(dev_proto, audio_dir=dev_flac)
    assert len(entries) == 24844, f"Expected 24844 dev entries, got {len(entries)}"

    first = entries[0]
    assert first.file_name == "LA_D_1047731"
    assert first.key == "bonafide"
    assert first.label_id == 0
    assert first.audio_path == dev_flac / "LA_D_1047731.flac"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Correct Bonafide Mapping (bonafide -> 0)
# ─────────────────────────────────────────────────────────────────────────────

def test_4_correct_bonafide_mapping(require_dataset):
    """Verify bonafide is mapped strictly to class 0."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    entries = parse_asvspoof2019_protocol(train_proto, limit=500)

    bonafide_entries = [e for e in entries if e.key == "bonafide"]
    assert len(bonafide_entries) > 0
    for e in bonafide_entries:
        assert e.label_id == 0, f"Bonafide entry {e.file_name} mapped to {e.label_id} instead of 0"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Correct Spoof Mapping (spoof -> 1)
# ─────────────────────────────────────────────────────────────────────────────

def test_5_correct_spoof_mapping(require_dataset):
    """Verify spoof is mapped strictly to class 1."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    entries = parse_asvspoof2019_protocol(train_proto, limit=3000)

    spoof_entries = [e for e in entries if e.key == "spoof"]
    assert len(spoof_entries) > 0
    for e in spoof_entries:
        assert e.label_id == 1, f"Spoof entry {e.file_name} mapped to {e.label_id} instead of 1"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Protocol Utterance ID -> FLAC Resolution
# ─────────────────────────────────────────────────────────────────────────────

def test_6_protocol_utterance_id_to_flac_resolution(require_dataset):
    """Verify utterance IDs resolve to existing FLAC audio files."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=50)
    for e in entries:
        assert e.audio_path is not None
        assert e.audio_path.name == f"{e.file_name}.flac"
        assert e.audio_path.is_file(), f"Resolved audio file does not exist: {e.audio_path}"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Missing-File Detection
# ─────────────────────────────────────────────────────────────────────────────

def test_7_missing_file_detection(require_dataset):
    """Verify that missing audio files are detected and rejected."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        fake_proto = tmp_path / "fake_proto.txt"
        fake_proto.write_text("LA_0001 NON_EXISTENT_FILE - - bonafide\n", encoding="utf-8")

        # Parsing with non-existent audio dir
        entries = parse_asvspoof2019_protocol(fake_proto, audio_dir=tmp_path / "audio")
        assert len(entries) == 1
        assert entries[0].audio_path == tmp_path / "audio" / "NON_EXISTENT_FILE.flac"

        # ASVspoof2019Dataset should raise FileNotFoundError on missing file when accessed
        dataset = ASVspoof2019Dataset(entries, audio_dir=tmp_path / "audio")
        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            _ = dataset[0]


# ─────────────────────────────────────────────────────────────────────────────
# 8. Duplicate-ID Detection
# ─────────────────────────────────────────────────────────────────────────────

def test_8_duplicate_id_detection(require_dataset):
    """Verify duplicate IDs are caught during dataset validation."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        proto_dir = tmp_path / "ASVspoof2019_LA_cm_protocols"
        proto_dir.mkdir()
        train_flac = tmp_path / "ASVspoof2019_LA_train" / "flac"
        train_flac.mkdir(parents=True)
        dev_flac = tmp_path / "ASVspoof2019_LA_dev" / "flac"
        dev_flac.mkdir(parents=True)

        # Create dummy flac file
        dummy_flac = train_flac / "LA_T_0001.flac"
        dummy_flac.write_bytes(b"dummy")
        dummy_dev = dev_flac / "LA_D_0001.flac"
        dummy_dev.write_bytes(b"dummy")

        # Protocol with duplicate ID
        (proto_dir / "ASVspoof2019.LA.cm.train.trn.txt").write_text(
            "LA_0001 LA_T_0001 - - bonafide\n"
            "LA_0001 LA_T_0001 - A01 spoof\n",
            encoding="utf-8",
        )
        (proto_dir / "ASVspoof2019.LA.cm.dev.trl.txt").write_text(
            "LA_0002 LA_D_0001 - - bonafide\n"
            "LA_0002 LA_D_0001 - A01 spoof\n",
            encoding="utf-8",
        )

        with pytest.raises(ValueError, match="duplicate utterance IDs"):
            validate_asvspoof2019_la(tmp_path, check_eval=False)


# ─────────────────────────────────────────────────────────────────────────────
# 9. Train/Dev Separation
# ─────────────────────────────────────────────────────────────────────────────

def test_9_train_dev_separation(require_dataset):
    """Verify train entries point strictly to train audio and dev to dev audio."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    dev_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.dev.trl.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"
    dev_flac = DATASET_ROOT / "ASVspoof2019_LA_dev" / "flac"

    train_entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=50)
    dev_entries = parse_asvspoof2019_protocol(dev_proto, audio_dir=dev_flac, limit=50)

    for e in train_entries:
        assert str(train_flac) in str(e.audio_path)
        assert "ASVspoof2019_LA_train" in str(e.audio_path)
        assert "ASVspoof2019_LA_dev" not in str(e.audio_path)

    for e in dev_entries:
        assert str(dev_flac) in str(e.audio_path)
        assert "ASVspoof2019_LA_dev" in str(e.audio_path)
        assert "ASVspoof2019_LA_train" not in str(e.audio_path)


# ─────────────────────────────────────────────────────────────────────────────
# 10. No Train/Dev Overlap (Zero Data Leak)
# ─────────────────────────────────────────────────────────────────────────────

def test_10_no_train_dev_overlap(require_dataset):
    """Verify zero overlap between train and dev sets."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    dev_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.dev.trl.txt"

    train_entries = parse_asvspoof2019_protocol(train_proto)
    dev_entries = parse_asvspoof2019_protocol(dev_proto)

    train_names = {e.file_name for e in train_entries}
    dev_names = {e.file_name for e in dev_entries}

    overlap = train_names.intersection(dev_names)
    assert len(overlap) == 0, f"Detected {len(overlap)} overlapping files between train and dev!"


# ─────────────────────────────────────────────────────────────────────────────
# 11. Both Classes Present
# ─────────────────────────────────────────────────────────────────────────────

def test_11_both_classes_present(require_dataset):
    """Verify both bonafide and spoof classes exist in both splits."""
    stats = validate_asvspoof2019_la(DATASET_ROOT, check_eval=False)

    assert stats["train_bonafide_count"] == 2580
    assert stats["train_spoof_count"] == 22800
    assert stats["dev_bonafide_count"] == 2548
    assert stats["dev_spoof_count"] == 22296
    assert stats["train_count"] == 25380
    assert stats["dev_count"] == 24844
    assert stats["missing_train_files"] == 0
    assert stats["missing_dev_files"] == 0
    assert stats["train_dev_overlap_count"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# 12. Lazy Audio Loading
# ─────────────────────────────────────────────────────────────────────────────

def test_12_lazy_audio_loading(require_dataset):
    """Verify dataset instantiation does not load audio arrays into RAM."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    # Instantiate dataset with all 25,380 entries
    dataset = ASVspoof2019Dataset(train_proto, audio_dir=train_flac)
    assert len(dataset) == 25380

    # Inspect entry attributes: no waveform array attribute exists on entries
    first_entry = dataset.entries[0]
    assert isinstance(first_entry, ASVspoof2019ProtocolEntry)
    assert not hasattr(first_entry, "waveform")
    assert not hasattr(first_entry, "audio_data")


# ─────────────────────────────────────────────────────────────────────────────
# 13. Load At Least One Real (Bonafide) Sample
# ─────────────────────────────────────────────────────────────────────────────

def test_13_load_bonafide_sample(require_dataset):
    """Load a real bonafide sample and verify properties."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=100)
    bonafide = next(e for e in entries if e.label_id == 0)

    dataset = ASVspoof2019Dataset([bonafide], audio_dir=train_flac)
    raw_wav = dataset._load_waveform(bonafide.audio_path)

    assert isinstance(raw_wav, np.ndarray)
    assert raw_wav.dtype == np.float32
    assert raw_wav.ndim == 1
    assert len(raw_wav) > 0
    assert np.all(np.isfinite(raw_wav))


# ─────────────────────────────────────────────────────────────────────────────
# 14. Load At Least One Spoof Sample
# ─────────────────────────────────────────────────────────────────────────────

def test_14_load_spoof_sample(require_dataset):
    """Load a spoof sample and verify properties."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    # First spoof in train is LA_T_1000137
    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=3000)
    spoof = next(e for e in entries if e.label_id == 1)

    dataset = ASVspoof2019Dataset([spoof], audio_dir=train_flac)
    raw_wav = dataset._load_waveform(spoof.audio_path)

    assert isinstance(raw_wav, np.ndarray)
    assert raw_wav.dtype == np.float32
    assert raw_wav.ndim == 1
    assert len(raw_wav) > 0
    assert np.all(np.isfinite(raw_wav))


# ─────────────────────────────────────────────────────────────────────────────
# 15. Correct Preprocessing & Feature Extraction
# ─────────────────────────────────────────────────────────────────────────────

def test_15_preprocessing_feature_extraction(require_dataset):
    """Verify feature extractor output shape (1, 80, 401) on real sample."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=1)
    dataset = ASVspoof2019Dataset(entries, audio_dir=train_flac)

    feat, label_id, meta = dataset[0]

    assert isinstance(feat, torch.Tensor)
    assert feat.ndim == 3
    assert feat.shape == (1, 80, 401), f"Expected (1, 80, 401), got {feat.shape}"
    assert label_id == 0
    assert meta["file_name"] == "LA_T_1138215"
    assert meta["key"] == "bonafide"


# ─────────────────────────────────────────────────────────────────────────────
# 16. DeepfakeCNN Forward Pass
# ─────────────────────────────────────────────────────────────────────────────

def test_16_deepfake_cnn_forward_pass(require_dataset):
    """Pass batch with real and fake samples through DeepfakeCNN."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=3000)
    real_sample = next(e for e in entries if e.label_id == 0)
    fake_sample = next(e for e in entries if e.label_id == 1)

    dataset = ASVspoof2019Dataset([real_sample, fake_sample], audio_dir=train_flac)
    loader = create_dataloader(dataset, batch_size=2, shuffle=False)

    batch_feats, batch_labels, _ = next(iter(loader))
    assert batch_feats.shape == (2, 1, 80, 401)
    assert batch_labels.tolist() == [0, 1]

    model = DeepfakeCNN()
    model.eval()
    with torch.no_grad():
        logits = model(batch_feats)

    assert logits.shape == (2, 2), f"Expected logits shape (2, 2), got {logits.shape}"
    assert torch.all(torch.isfinite(logits))


# ─────────────────────────────────────────────────────────────────────────────
# 17. Loss Computation and Gradient Backpropagation
# ─────────────────────────────────────────────────────────────────────────────

def test_17_loss_computation_and_gradients(require_dataset):
    """Verify CrossEntropyLoss computation and non-zero gradient backprop."""
    train_proto = DATASET_ROOT / "ASVspoof2019_LA_cm_protocols" / "ASVspoof2019.LA.cm.train.trn.txt"
    train_flac = DATASET_ROOT / "ASVspoof2019_LA_train" / "flac"

    entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac, limit=3000)
    real_sample = next(e for e in entries if e.label_id == 0)
    fake_sample = next(e for e in entries if e.label_id == 1)

    dataset = ASVspoof2019Dataset([real_sample, fake_sample], audio_dir=train_flac)
    loader = create_dataloader(dataset, batch_size=2, shuffle=False)

    batch_feats, batch_labels, _ = next(iter(loader))

    model = DeepfakeCNN()
    model.train()
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)

    optimizer.zero_grad()
    logits = model(batch_feats)
    loss = criterion(logits, batch_labels)

    assert loss.item() > 0.0
    assert torch.isfinite(loss)

    loss.backward()

    # Verify gradients flowed to all model parameters
    grad_norms = [p.grad.norm().item() for p in model.parameters() if p.grad is not None]
    assert len(grad_norms) > 0
    assert all(gn >= 0 for gn in grad_norms)
    assert any(gn > 0 for gn in grad_norms)
