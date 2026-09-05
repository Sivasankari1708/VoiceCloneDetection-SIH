"""
backend/models/deepfake_v2/dataset.py
=====================================
Protocol parser, PyTorch Dataset, and DataLoader for ASVspoof 5.

Official ASVspoof 5 Protocol Format (Zenodo README):
  SPEAKER_ID FLAC_FILE_NAME SPEAKER_GENDER CODEC CODEC_Q CODEC_SEED ATTACK_TAG ATTACK_LABEL KEY TMP
  - 10 space-separated columns, NO header row
  - Column 1: FLAC_FILE_NAME (without or with .flac)
  - Column 8: KEY: 'bonafide' -> 0, 'spoof' -> 1
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Union
import random

import numpy as np
import soundfile as sf
import torch
from torch.utils.data import DataLoader, Dataset

from backend.models.deepfake_v2.features import LogMelFeatureExtractor
from backend.utils.logger import get_logger

log = get_logger(__name__)

# Official label mapping
LABEL_MAP = {
    "bonafide": 0,
    "spoof": 1,
}
INV_LABEL_MAP = {0: "bonafide", 1: "spoof"}


@dataclass(frozen=True)
class ProtocolEntry:
    """A single record from an ASVspoof 5 protocol file."""
    speaker_id: str
    file_name: str
    speaker_gender: str
    codec: str
    codec_q: str
    codec_seed: str
    attack_tag: str
    attack_label: str
    key: str
    label_id: int
    audio_path: Optional[Path] = None


def parse_asvspoof5_protocol(
    protocol_path: Union[str, Path],
    audio_dir: Optional[Union[str, Path]] = None,
    limit: Optional[int] = None,
) -> List[ProtocolEntry]:
    """
    Parse an official ASVspoof 5 protocol TSV file.

    Parameters
    ----------
    protocol_path : str | Path
        Path to the protocol file (e.g. ASVspoof5.train.tsv).
    audio_dir : str | Path | None
        Directory where corresponding FLAC files reside (e.g. flac_T/).
    limit : int | None
        Maximum number of entries to parse (useful for quick smoke tests).

    Returns
    -------
    List[ProtocolEntry]
        List of parsed protocol records.
    """
    protocol_path = Path(protocol_path)
    if not protocol_path.is_file():
        raise FileNotFoundError(f"Protocol file not found at: {protocol_path}")

    audio_dir_path = Path(audio_dir) if audio_dir else None
    entries: List[ProtocolEntry] = []

    with open(protocol_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            # Standard ASVspoof5 protocol has 10 columns; allow 9 or 10
            if len(parts) < 9:
                log.warning("Line %d in %s has fewer than 9 columns (%d): %s", line_num, protocol_path.name, len(parts), line)
                continue

            speaker_id = parts[0]
            flac_name = parts[1]
            speaker_gender = parts[2]
            codec = parts[3]
            codec_q = parts[4]
            codec_seed = parts[5]
            attack_tag = parts[6]
            attack_label = parts[7]
            key_raw = parts[8].lower()

            if key_raw not in LABEL_MAP:
                log.warning("Line %d: unrecognized key '%s', skipping", line_num, key_raw)
                continue

            label_id = LABEL_MAP[key_raw]

            audio_file = None
            if audio_dir_path:
                cand_name = flac_name if flac_name.endswith(".flac") else f"{flac_name}.flac"
                candidate = audio_dir_path / cand_name
                audio_file = candidate

            entry = ProtocolEntry(
                speaker_id=speaker_id,
                file_name=flac_name,
                speaker_gender=speaker_gender,
                codec=codec,
                codec_q=codec_q,
                codec_seed=codec_seed,
                attack_tag=attack_tag,
                attack_label=attack_label,
                key=key_raw,
                label_id=label_id,
                audio_path=audio_file,
            )
            entries.append(entry)

            if limit is not None and len(entries) >= limit:
                break

    log.info("Parsed %d entries from %s", len(entries), protocol_path.name)
    return entries


class ASVspoof5Dataset(Dataset):
    """
    PyTorch Dataset for ASVspoof 5 audio samples.

    Loads 16 kHz audio files, pads or crops to fixed duration, and computes
    Log-Mel Spectrogram features.
    """

    def __init__(
        self,
        entries: Union[List[ProtocolEntry], str, Path],
        audio_dir: Optional[Union[str, Path]] = None,
        feature_extractor: Optional[LogMelFeatureExtractor] = None,
        target_duration_sec: float = 4.0,
        sample_rate: int = 16_000,
        is_training: bool = True,
        filter_missing: bool = True,
    ) -> None:
        super().__init__()
        if isinstance(entries, (str, Path)):
            self.entries = parse_asvspoof5_protocol(entries, audio_dir=audio_dir)
        else:
            self.entries = list(entries)

        self.audio_dir = Path(audio_dir) if audio_dir else None
        self.sample_rate = sample_rate
        self.target_samples = int(target_duration_sec * sample_rate)
        self.is_training = is_training
        self.feature_extractor = feature_extractor or LogMelFeatureExtractor(sample_rate=sample_rate)

        if filter_missing and self.audio_dir:
            valid_entries = []
            for e in self.entries:
                path = e.audio_path
                if path is None and self.audio_dir:
                    cand = e.file_name if e.file_name.endswith(".flac") else f"{e.file_name}.flac"
                    path = self.audio_dir / cand
                if path and path.is_file():
                    valid_entries.append(e)
            if len(valid_entries) != len(self.entries):
                log.info(
                    "Filtered missing audio files: %d -> %d available",
                    len(self.entries),
                    len(valid_entries),
                )
            self.entries = valid_entries

    def __len__(self) -> int:
        return len(self.entries)

    def _load_waveform(self, path: Path) -> np.ndarray:
        """Load audio file and ensure float32 mono at self.sample_rate."""
        data, sr = sf.read(str(path), dtype="float32")
        if data.ndim > 1:
            data = np.mean(data, axis=1)

        if sr != self.sample_rate:
            import torchaudio.transforms as T
            wav_tensor = torch.from_numpy(data).unsqueeze(0)
            resampler = T.Resample(orig_freq=sr, new_freq=self.sample_rate)
            data = resampler(wav_tensor).squeeze(0).numpy()

        return data

    def _standardize_length(self, waveform: np.ndarray) -> np.ndarray:
        """Pad with reflection/zeros or crop waveform to target_samples."""
        length = len(waveform)
        if length == self.target_samples:
            return waveform

        if length > self.target_samples:
            if self.is_training:
                # Random crop during training
                max_start = length - self.target_samples
                start = np.random.randint(0, max_start + 1)
            else:
                # Center crop during evaluation
                start = (length - self.target_samples) // 2
            return waveform[start : start + self.target_samples]

        # If shorter than target, repeat or pad with zeros
        pad_len = self.target_samples - length
        if length > 0:
            repeats = (self.target_samples // length) + 1
            tiled = np.tile(waveform, repeats)[: self.target_samples]
            return tiled
        else:
            return np.zeros(self.target_samples, dtype=np.float32)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, dict]:
        entry = self.entries[idx]
        path = entry.audio_path
        if path is None and self.audio_dir:
            cand = entry.file_name if entry.file_name.endswith(".flac") else f"{entry.file_name}.flac"
            path = self.audio_dir / cand

        if path is None or not path.is_file():
            raise FileNotFoundError(f"Audio file not found for entry {entry.file_name}: {path}")

        raw_wav = self._load_waveform(path)
        wav = self._standardize_length(raw_wav)

        wav_tensor = torch.from_numpy(wav).float()
        with torch.no_grad():
            feat = self.feature_extractor(wav_tensor)  # (1, 1, n_mels, time)
            feat = feat.squeeze(0)                      # (1, n_mels, time)

        meta = {
            "speaker_id": entry.speaker_id,
            "file_name": entry.file_name,
            "attack_tag": entry.attack_tag,
            "key": entry.key,
        }
        return feat, entry.label_id, meta


def create_dataloader(
    dataset: Dataset,
    batch_size: int = 32,
    shuffle: bool = True,
    num_workers: int = 0,
    pin_memory: bool = False,
) -> DataLoader:
    """Create a PyTorch DataLoader for an ASVspoof5Dataset or FolderAudioDataset."""
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=num_workers,
        pin_memory=pin_memory,
        drop_last=False,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Folder-based Dataset (e.g. asvspoof2021_mixed)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FolderAudioEntry:
    """A single audio sample from a folder-based dataset."""
    file_path: Path
    file_name: str
    label_id: int
    label_name: str


def split_folder_dataset(
    data_dir: Union[str, Path],
    class_mapping: Optional[Dict[str, int]] = None,
    val_ratio: float = 0.2,
    seed: int = 42,
    audio_extensions: Tuple[str, ...] = (".wav", ".flac", ".ogg"),
) -> Tuple[List[FolderAudioEntry], List[FolderAudioEntry]]:
    """
    Recursively discover audio files and produce a deterministic, stratified
    train/validation split with guaranteed zero file overlap.

    Parameters
    ----------
    data_dir : str | Path
        Root directory containing class subfolders (e.g. data/asvspoof2021_mixed).
    class_mapping : dict[str, int] | None
        Mapping from folder name to integer label.
        Defaults to {"real_voice": 0, "fake_voice": 1}.
    val_ratio : float
        Fraction of samples per class allocated to validation (default: 0.2).
    seed : int
        RNG seed for deterministic splitting (default: 42).
    audio_extensions : tuple[str, ...]
        Allowed audio file extensions (case-insensitive).

    Returns
    -------
    Tuple[List[FolderAudioEntry], List[FolderAudioEntry]]
        (train_entries, val_entries)
    """
    data_dir = Path(data_dir)
    if not data_dir.is_dir():
        raise FileNotFoundError(f"Dataset root directory not found: {data_dir}")

    mapping = class_mapping or {"real_voice": 0, "fake_voice": 1}

    train_entries: List[FolderAudioEntry] = []
    val_entries: List[FolderAudioEntry] = []
    train_paths: Set[Path] = set()
    val_paths: Set[Path] = set()

    for folder_name, label_id in mapping.items():
        folder_path = data_dir / folder_name
        if not folder_path.is_dir():
            raise FileNotFoundError(f"Required class directory not found: {folder_path}")

        # Recursively discover audio files
        class_files: List[Path] = []
        for root, _, files in os.walk(folder_path):
            for f in files:
                if any(f.lower().endswith(ext) for ext in audio_extensions):
                    class_files.append(Path(root) / f)

        # Sort paths strictly for deterministic ordering across OS/filesystems
        class_files.sort(key=lambda p: str(p))

        if len(class_files) == 0:
            raise ValueError(f"Class directory '{folder_name}' ({folder_path}) contains zero audio files.")

        # Deterministic shuffle using dedicated RNG
        rng = random.Random(seed)
        shuffled = list(class_files)
        rng.shuffle(shuffled)

        val_count = int(round(len(shuffled) * val_ratio))
        if val_ratio > 0.0 and len(shuffled) > 1 and val_count == 0:
            val_count = 1

        val_part = shuffled[:val_count]
        train_part = shuffled[val_count:]

        for p in train_part:
            entry = FolderAudioEntry(
                file_path=p,
                file_name=p.name,
                label_id=label_id,
                label_name=folder_name,
            )
            train_entries.append(entry)
            train_paths.add(p)

        for p in val_part:
            entry = FolderAudioEntry(
                file_path=p,
                file_name=p.name,
                label_id=label_id,
                label_name=folder_name,
            )
            val_entries.append(entry)
            val_paths.add(p)

    # Sanity check: zero overlap
    overlap = train_paths.intersection(val_paths)
    if overlap:
        raise RuntimeError(f"Data leak detected! {len(overlap)} files appear in both train and val splits.")

    # Shuffle final train and val lists deterministically so classes are interleaved
    random.Random(seed).shuffle(train_entries)
    random.Random(seed).shuffle(val_entries)

    log.info(
        "Discovered %d train samples and %d val samples across %d classes in %s",
        len(train_entries),
        len(val_entries),
        len(mapping),
        data_dir.name,
    )
    return train_entries, val_entries


class FolderAudioDataset(Dataset):
    """
    PyTorch Dataset for folder-organized audio datasets (e.g. asvspoof2021_mixed).

    Loads 16 kHz audio files, pads or crops to fixed duration, and computes
    Log-Mel Spectrogram features.
    """

    def __init__(
        self,
        entries: Union[List[FolderAudioEntry], str, Path],
        feature_extractor: Optional[LogMelFeatureExtractor] = None,
        target_duration_sec: float = 4.0,
        sample_rate: int = 16_000,
        is_training: bool = True,
        class_mapping: Optional[Dict[str, int]] = None,
    ) -> None:
        super().__init__()
        if isinstance(entries, (str, Path)):
            train_e, _ = split_folder_dataset(entries, class_mapping=class_mapping, val_ratio=0.0)
            self.entries = train_e
        else:
            self.entries = list(entries)

        if len(self.entries) == 0:
            raise ValueError("Cannot initialize FolderAudioDataset with zero entries.")

        self.sample_rate = sample_rate
        self.target_samples = int(target_duration_sec * sample_rate)
        self.is_training = is_training
        self.feature_extractor = feature_extractor or LogMelFeatureExtractor(sample_rate=sample_rate)

    def __len__(self) -> int:
        return len(self.entries)

    def _load_waveform(self, path: Path) -> np.ndarray:
        """Load audio file and ensure float32 mono at self.sample_rate."""
        if not path.is_file():
            raise FileNotFoundError(f"Audio file does not exist: {path}")

        data, sr = sf.read(str(path), dtype="float32")
        if data.ndim > 1:
            data = np.mean(data, axis=1)

        if sr != self.sample_rate:
            import torchaudio.transforms as T
            wav_tensor = torch.from_numpy(data).unsqueeze(0)
            resampler = T.Resample(orig_freq=sr, new_freq=self.sample_rate)
            data = resampler(wav_tensor).squeeze(0).numpy()

        return data

    def _standardize_length(self, waveform: np.ndarray) -> np.ndarray:
        """Pad with reflection/tile or crop waveform to target_samples."""
        length = len(waveform)
        if length == self.target_samples:
            return waveform

        if length > self.target_samples:
            if self.is_training:
                max_start = length - self.target_samples
                start = np.random.randint(0, max_start + 1)
            else:
                start = (length - self.target_samples) // 2
            return waveform[start : start + self.target_samples]

        pad_len = self.target_samples - length
        if length > 0:
            repeats = (self.target_samples // length) + 1
            tiled = np.tile(waveform, repeats)[: self.target_samples]
            return tiled
        else:
            return np.zeros(self.target_samples, dtype=np.float32)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, dict]:
        entry = self.entries[idx]
        raw_wav = self._load_waveform(entry.file_path)
        wav = self._standardize_length(raw_wav)

        wav_tensor = torch.from_numpy(wav).float()
        with torch.no_grad():
            feat = self.feature_extractor(wav_tensor)  # (1, 1, n_mels, time)
            feat = feat.squeeze(0)                      # (1, n_mels, time)

        meta = {
            "file_name": entry.file_name,
            "file_path": str(entry.file_path),
            "label_name": entry.label_name,
            "label_id": entry.label_id,
        }
        return feat, entry.label_id, meta


# ─────────────────────────────────────────────────────────────────────────────
# ASVspoof 2019 LA Dataset & Protocol Parser
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ASVspoof2019ProtocolEntry:
    """A single record from an ASVspoof 2019 LA protocol file."""
    speaker_id: str
    file_name: str
    system_id: str
    key_tag: str
    key: str
    label_id: int
    audio_path: Optional[Path] = None


def parse_asvspoof2019_protocol(
    protocol_path: Union[str, Path],
    audio_dir: Optional[Union[str, Path]] = None,
    limit: Optional[int] = None,
) -> List[ASVspoof2019ProtocolEntry]:
    """
    Parse an official ASVspoof 2019 LA CM protocol text file.

    Format (5 space-separated columns, no header):
      SPEAKER_ID AUDIO_FILE_NAME SYSTEM_ID KEY_TAG KEY
      e.g. 'LA_0079 LA_T_1138215 - - bonafide'
           'LA_0070 LA_T_1000137 - A01 spoof'

    Label Mapping:
      'bonafide' -> 0
      'spoof'    -> 1
    """
    protocol_path = Path(protocol_path)
    if not protocol_path.is_file():
        raise FileNotFoundError(f"ASVspoof 2019 protocol file not found at: {protocol_path}")

    audio_dir_path = Path(audio_dir) if audio_dir else None
    entries: List[ASVspoof2019ProtocolEntry] = []

    with open(protocol_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            if len(parts) < 5:
                log.warning(
                    "Line %d in %s has fewer than 5 columns (%d): %s",
                    line_num,
                    protocol_path.name,
                    len(parts),
                    line,
                )
                continue

            speaker_id = parts[0]
            utt_name = parts[1]
            system_id = parts[2]
            key_tag = parts[3]
            key_raw = parts[4].lower()

            if key_raw not in LABEL_MAP:
                log.warning("Line %d: unrecognized key '%s', skipping", line_num, key_raw)
                continue

            label_id = LABEL_MAP[key_raw]

            audio_file = None
            if audio_dir_path:
                cand_name = utt_name if utt_name.endswith(".flac") else f"{utt_name}.flac"
                audio_file = audio_dir_path / cand_name

            entry = ASVspoof2019ProtocolEntry(
                speaker_id=speaker_id,
                file_name=utt_name,
                system_id=system_id,
                key_tag=key_tag,
                key=key_raw,
                label_id=label_id,
                audio_path=audio_file,
            )
            entries.append(entry)

            if limit is not None and len(entries) >= limit:
                break

    log.info("Parsed %d ASVspoof 2019 entries from %s", len(entries), protocol_path.name)
    return entries


def validate_asvspoof2019_la(
    dataset_root: Union[str, Path],
    check_eval: bool = True,
) -> Dict[str, Any]:
    """
    Strict validation of the official ASVspoof 2019 LA dataset structure.

    Verifies:
      - Root and protocol directories exist.
      - Official train and dev protocol files exist.
      - Training audio (ASVspoof2019_LA_train/flac) and dev audio (ASVspoof2019_LA_dev/flac) directories exist.
      - Every referenced train audio file exists.
      - Every referenced dev audio file exists.
      - Zero duplicate utterance IDs in train or dev.
      - Zero overlap between train and dev sets.
      - Both 'bonafide' and 'spoof' classes present in both train and dev splits.

    Returns
    -------
    dict
        Comprehensive dataset statistics and validation metrics.
    """
    from typing import Any  # Local import fallback if needed

    root = Path(dataset_root)
    if not root.is_dir():
        raise FileNotFoundError(f"ASVspoof 2019 LA root directory not found: {root}")

    proto_dir = root / "ASVspoof2019_LA_cm_protocols"
    if not proto_dir.is_dir():
        raise FileNotFoundError(f"CM protocols directory missing: {proto_dir}")

    train_proto = proto_dir / "ASVspoof2019.LA.cm.train.trn.txt"
    dev_proto = proto_dir / "ASVspoof2019.LA.cm.dev.trl.txt"
    eval_proto = proto_dir / "ASVspoof2019.LA.cm.eval.trl.txt"

    if not train_proto.is_file():
        raise FileNotFoundError(f"Train protocol file missing: {train_proto}")
    if not dev_proto.is_file():
        raise FileNotFoundError(f"Dev protocol file missing: {dev_proto}")

    train_flac_dir = root / "ASVspoof2019_LA_train" / "flac"
    dev_flac_dir = root / "ASVspoof2019_LA_dev" / "flac"
    eval_flac_dir = root / "ASVspoof2019_LA_eval" / "flac"

    if not train_flac_dir.is_dir():
        raise FileNotFoundError(f"Training flac directory missing: {train_flac_dir}")
    if not dev_flac_dir.is_dir():
        raise FileNotFoundError(f"Dev flac directory missing: {dev_flac_dir}")

    # Parse and validate train
    train_entries = parse_asvspoof2019_protocol(train_proto, audio_dir=train_flac_dir)
    train_ids: Set[str] = set()
    train_dup_ids: List[str] = []
    missing_train_files: List[str] = []
    train_bonafide = 0
    train_spoof = 0

    for e in train_entries:
        if e.file_name in train_ids:
            train_dup_ids.append(e.file_name)
        train_ids.add(e.file_name)

        if e.audio_path is None or not e.audio_path.is_file():
            missing_train_files.append(e.file_name)

        if e.label_id == 0:
            train_bonafide += 1
        elif e.label_id == 1:
            train_spoof += 1

    # Parse and validate dev
    dev_entries = parse_asvspoof2019_protocol(dev_proto, audio_dir=dev_flac_dir)
    dev_ids: Set[str] = set()
    dev_dup_ids: List[str] = []
    missing_dev_files: List[str] = []
    dev_bonafide = 0
    dev_spoof = 0

    for e in dev_entries:
        if e.file_name in dev_ids:
            dev_dup_ids.append(e.file_name)
        dev_ids.add(e.file_name)

        if e.audio_path is None or not e.audio_path.is_file():
            missing_dev_files.append(e.file_name)

        if e.label_id == 0:
            dev_bonafide += 1
        elif e.label_id == 1:
            dev_spoof += 1

    # Check for overlaps
    overlap = train_ids.intersection(dev_ids)

    # Class presence checks
    if train_bonafide == 0 or train_spoof == 0:
        raise ValueError(
            f"Train split must contain both classes! Found bonafide={train_bonafide}, spoof={train_spoof}"
        )
    if dev_bonafide == 0 or dev_spoof == 0:
        raise ValueError(
            f"Dev split must contain both classes! Found bonafide={dev_bonafide}, spoof={dev_spoof}"
        )

    # Strict validations
    if missing_train_files:
        raise FileNotFoundError(
            f"Missing {len(missing_train_files)} training audio files in {train_flac_dir}"
        )
    if missing_dev_files:
        raise FileNotFoundError(
            f"Missing {len(missing_dev_files)} dev audio files in {dev_flac_dir}"
        )
    if train_dup_ids:
        raise ValueError(f"Found {len(train_dup_ids)} duplicate utterance IDs in train protocol.")
    if dev_dup_ids:
        raise ValueError(f"Found {len(dev_dup_ids)} duplicate utterance IDs in dev protocol.")
    if overlap:
        raise RuntimeError(f"Train and Dev overlap detected: {len(overlap)} duplicate IDs.")

    eval_stats: Dict[str, Any] = {}
    if check_eval and eval_proto.is_file() and eval_flac_dir.is_dir():
        eval_entries = parse_asvspoof2019_protocol(eval_proto, audio_dir=eval_flac_dir)
        eval_bonafide = sum(1 for e in eval_entries if e.label_id == 0)
        eval_spoof = sum(1 for e in eval_entries if e.label_id == 1)
        eval_stats = {
            "eval_count": len(eval_entries),
            "eval_bonafide_count": eval_bonafide,
            "eval_spoof_count": eval_spoof,
            "eval_protocol": str(eval_proto),
            "eval_flac_dir": str(eval_flac_dir),
        }

    stats = {
        "dataset_path": str(root),
        "train_protocol": str(train_proto),
        "dev_protocol": str(dev_proto),
        "train_flac_dir": str(train_flac_dir),
        "dev_flac_dir": str(dev_flac_dir),
        "train_count": len(train_entries),
        "dev_count": len(dev_entries),
        "train_bonafide_count": train_bonafide,
        "train_spoof_count": train_spoof,
        "dev_bonafide_count": dev_bonafide,
        "dev_spoof_count": dev_spoof,
        "missing_train_files": len(missing_train_files),
        "missing_dev_files": len(missing_dev_files),
        "duplicate_train_ids": len(train_dup_ids),
        "duplicate_dev_ids": len(dev_dup_ids),
        "train_dev_overlap_count": len(overlap),
        **eval_stats,
    }
    return stats


class ASVspoof2019Dataset(Dataset):
    """
    PyTorch Dataset for ASVspoof 2019 LA audio samples with lazy audio loading.

    Loads 16 kHz audio files on-demand, standardizes to target duration (pad/crop),
    and computes normalized Log-Mel Spectrogram features.
    """

    def __init__(
        self,
        entries: Union[List[ASVspoof2019ProtocolEntry], str, Path],
        audio_dir: Optional[Union[str, Path]] = None,
        feature_extractor: Optional[LogMelFeatureExtractor] = None,
        target_duration_sec: float = 4.0,
        sample_rate: int = 16_000,
        is_training: bool = True,
        filter_missing: bool = False,
    ) -> None:
        super().__init__()
        if isinstance(entries, (str, Path)):
            self.entries = parse_asvspoof2019_protocol(entries, audio_dir=audio_dir)
        else:
            self.entries = list(entries)

        if len(self.entries) == 0:
            raise ValueError("Cannot initialize ASVspoof2019Dataset with zero entries.")

        self.audio_dir = Path(audio_dir) if audio_dir else None
        self.sample_rate = sample_rate
        self.target_samples = int(target_duration_sec * sample_rate)
        self.is_training = is_training
        self.feature_extractor = feature_extractor or LogMelFeatureExtractor(sample_rate=sample_rate)

        if filter_missing and self.audio_dir:
            valid_entries = []
            for e in self.entries:
                path = e.audio_path
                if path is None and self.audio_dir:
                    cand = e.file_name if e.file_name.endswith(".flac") else f"{e.file_name}.flac"
                    path = self.audio_dir / cand
                if path and path.is_file():
                    valid_entries.append(e)
            if len(valid_entries) != len(self.entries):
                log.info(
                    "Filtered missing audio files: %d -> %d available",
                    len(self.entries),
                    len(valid_entries),
                )
            self.entries = valid_entries

    def __len__(self) -> int:
        return len(self.entries)

    def _load_waveform(self, path: Path) -> np.ndarray:
        """Load audio file on-demand and ensure float32 mono at self.sample_rate."""
        if not path.is_file():
            raise FileNotFoundError(f"Audio file does not exist: {path}")

        data, sr = sf.read(str(path), dtype="float32")
        if data.ndim > 1:
            data = np.mean(data, axis=1)

        if sr != self.sample_rate:
            import torchaudio.transforms as T
            wav_tensor = torch.from_numpy(data).unsqueeze(0)
            resampler = T.Resample(orig_freq=sr, new_freq=self.sample_rate)
            data = resampler(wav_tensor).squeeze(0).numpy()

        return data

    def _standardize_length(self, waveform: np.ndarray) -> np.ndarray:
        """Pad with reflection/tile or crop waveform to target_samples."""
        length = len(waveform)
        if length == self.target_samples:
            return waveform

        if length > self.target_samples:
            if self.is_training:
                # Random crop during training
                max_start = length - self.target_samples
                start = np.random.randint(0, max_start + 1)
            else:
                # Center crop during evaluation / validation
                start = (length - self.target_samples) // 2
            return waveform[start : start + self.target_samples]

        # If shorter than target, repeat or pad with zeros
        pad_len = self.target_samples - length
        if length > 0:
            repeats = (self.target_samples // length) + 1
            tiled = np.tile(waveform, repeats)[: self.target_samples]
            return tiled
        else:
            return np.zeros(self.target_samples, dtype=np.float32)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, dict]:
        entry = self.entries[idx]
        path = entry.audio_path
        if path is None and self.audio_dir:
            cand = entry.file_name if entry.file_name.endswith(".flac") else f"{entry.file_name}.flac"
            path = self.audio_dir / cand

        if path is None or not path.is_file():
            raise FileNotFoundError(f"Audio file not found for utterance {entry.file_name}: {path}")

        # Lazy loading on-demand
        raw_wav = self._load_waveform(path)
        wav = self._standardize_length(raw_wav)

        wav_tensor = torch.from_numpy(wav).float()
        with torch.no_grad():
            feat = self.feature_extractor(wav_tensor)  # (1, 1, n_mels, time)
            feat = feat.squeeze(0)                      # (1, n_mels, time)

        meta = {
            "speaker_id": entry.speaker_id,
            "file_name": entry.file_name,
            "system_id": entry.system_id,
            "key_tag": entry.key_tag,
            "key": entry.key,
            "audio_path": str(path),
        }
        return feat, entry.label_id, meta


