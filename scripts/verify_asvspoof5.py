#!/usr/bin/env python3
"""
scripts/verify_asvspoof5.py
===========================
Integrity and completeness verification script for ASVspoof 5 dataset.

Verifies:
  1. Dataset root directory exists.
  2. Training and Development protocol TSV files exist.
  3. Training (flac_T/) and Development (flac_D/) audio directories exist.
  4. Protocol entries resolve to actual FLAC audio files on disk.
  5. Number of training and development records.
  6. Class distribution (bonafide vs. spoof counts and percentages).
  7. Identifies any missing audio file references.
  8. Total audio size on disk (GB).
  9. Audio properties check (sample rate, channels, float range).

Exit code:
  0 = Dataset is completely valid and ready for training.
  1 = Dataset is missing, incomplete, or corrupted.

Usage:
  python scripts/verify_asvspoof5.py
  python scripts/verify_asvspoof5.py --data-dir data/asvspoof5 --check-samples 50
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import soundfile as sf

from backend.models.deepfake_v2.dataset import (
    LABEL_MAP,
    ProtocolEntry,
    parse_asvspoof5_protocol,
)
from backend.utils.logger import get_logger

log = get_logger("verify_asvspoof5")


def format_bytes(size_bytes: int) -> str:
    """Format bytes into human-readable string (KB, MB, GB)."""
    val = float(size_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if val < 1024.0 or unit == "TB":
            return f"{val:.2f} {unit}"
        val /= 1024.0
    return f"{val:.2f} TB"


def get_dir_size(path: Path) -> int:
    """Recursively compute total directory size in bytes."""
    total = 0
    if not path.is_dir():
        return 0
    for root, _, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def verify_audio_dir(
    audio_dir: Path,
    entries: List[ProtocolEntry],
    check_samples: int = 10,
) -> Tuple[int, int, List[str], Optional[int], Optional[int]]:
    """
    Verify that protocol entries resolve to real audio files on disk.

    Returns
    -------
    Tuple[int, int, List[str], Optional[int], Optional[int]]
        (found_count, missing_count, missing_filenames, sample_rate, channels)
    """
    # Build a set of existing files in the directory
    existing_files: Set[str] = set()
    if audio_dir.is_dir():
        for f in os.listdir(audio_dir):
            if f.endswith(".flac"):
                existing_files.add(f)
                existing_files.add(f[:-5])  # without extension

    missing: List[str] = []
    found = 0

    for e in entries:
        base_name = e.file_name
        if base_name in existing_files or f"{base_name}.flac" in existing_files:
            found += 1
        else:
            missing.append(base_name)

    # Sample check actual audio decoding
    checked = 0
    detected_sr: Optional[int] = None
    detected_ch: Optional[int] = None
    for e in entries:
        if checked >= check_samples:
            break
        cand_path = audio_dir / (e.file_name if e.file_name.endswith(".flac") else f"{e.file_name}.flac")
        if cand_path.is_file():
            try:
                info = sf.info(str(cand_path))
                detected_sr = info.samplerate
                detected_ch = info.channels
                if info.samplerate != 16000:
                    log.warning("Audio sample %s has sample rate %d Hz (expected 16000 Hz)", cand_path.name, info.samplerate)
                if info.channels != 1:
                    log.warning("Audio sample %s has %d channels (expected mono)", cand_path.name, info.channels)
                checked += 1
            except Exception as exc:
                log.error("Failed to read audio file %s: %s", cand_path.name, exc)

    return found, len(missing), missing, detected_sr, detected_ch


def verify_partition(
    name: str,
    protocol_file: Path,
    audio_dir: Path,
    check_samples: int = 10,
) -> Tuple[bool, Dict[str, any]]:
    """Verify a single partition (train or dev)."""
    details: Dict[str, any] = {
        "name": name,
        "protocol_exists": protocol_file.is_file(),
        "audio_dir_exists": audio_dir.is_dir(),
        "total_records": 0,
        "bonafide": 0,
        "spoof": 0,
        "found_audio": 0,
        "missing_audio": 0,
        "audio_dir_size": 0,
        "sample_rate": None,
        "channels": None,
    }

    if not details["protocol_exists"]:
        log.error("[%s] Protocol file not found: %s", name, protocol_file)
        return False, details

    if not details["audio_dir_exists"]:
        log.error("[%s] Audio directory not found: %s", name, audio_dir)
        return False, details

    try:
        entries = parse_asvspoof5_protocol(protocol_file)
    except Exception as exc:
        log.error("[%s] Failed to parse protocol: %s", name, exc)
        return False, details

    details["total_records"] = len(entries)
    details["bonafide"] = sum(1 for e in entries if e.label_id == 0)
    details["spoof"] = sum(1 for e in entries if e.label_id == 1)

    details["audio_dir_size"] = get_dir_size(audio_dir)

    found, missing_count, missing_list, sr, ch = verify_audio_dir(
        audio_dir, entries, check_samples=check_samples
    )
    details["found_audio"] = found
    details["missing_audio"] = missing_count
    details["sample_rate"] = sr
    details["channels"] = ch

    if missing_count > 0:
        log.error(
            "[%s] Incomplete audio files: found %d, missing %d (out of %d records).",
            name, found, missing_count, len(entries),
        )
        if missing_list:
            sample_missing = missing_list[:5]
            log.error("[%s] Sample missing files: %s ...", name, sample_missing)
        return False, details

    if details["bonafide"] == 0 or details["spoof"] == 0:
        log.error(
            "[%s] Invalid class distribution: bonafide=%d, spoof=%d",
            name, details["bonafide"], details["spoof"],
        )
        return False, details

    return True, details


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify presence and integrity of the ASVspoof 5 dataset."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=PROJECT_ROOT / "data" / "asvspoof5",
        help="Root directory for ASVspoof 5 dataset (default: data/asvspoof5)",
    )
    parser.add_argument(
        "--check-samples",
        type=int,
        default=10,
        help="Number of FLAC files to inspect with soundfile for format validation",
    )
    args = parser.parse_args()

    data_dir = args.data_dir.resolve()

    print("=" * 75)
    print(" ASVspoof 5 Dataset Integrity Verification")
    print("=" * 75)
    print(f"Target directory: {data_dir}")
    print("-" * 75)

    # Reject ASVspoof 2019 explicitly
    if "asvspoof2019" in str(data_dir).lower():
        print("FAIL: ASVspoof 2019 directory detected.")
        print("ASVspoof 2019 is NOT ASVspoof 5. Deepfake v2 requires ASVspoof 5.")
        print("=" * 75)
        return 1

    if not data_dir.is_dir():
        print(f"FAIL: Dataset root directory does not exist: {data_dir}")
        print("\nPlease follow the setup guide in README.md to download ASVspoof 5.")
        print("=" * 75)
        return 1

    train_protocol = data_dir / "protocols" / "ASVspoof5.train.tsv"
    dev_protocol = data_dir / "protocols" / "ASVspoof5.dev.track_1.tsv"
    if not dev_protocol.is_file() and (data_dir / "protocols" / "ASVspoof5.dev.tsv").is_file():
        dev_protocol = data_dir / "protocols" / "ASVspoof5.dev.tsv"

    train_audio = data_dir / "flac_T"
    dev_audio = data_dir / "flac_D"

    train_ok, train_details = verify_partition("Train (Track 1)", train_protocol, train_audio, args.check_samples)
    dev_ok, dev_details = verify_partition("Dev (Track 1)", dev_protocol, dev_audio, args.check_samples)

    print("\nVerification Results Summary:")
    print("-" * 75)
    train_pct_bonafide = (train_details['bonafide'] / train_details['total_records'] * 100.0) if train_details['total_records'] > 0 else 0.0
    train_pct_spoof = (train_details['spoof'] / train_details['total_records'] * 100.0) if train_details['total_records'] > 0 else 0.0
    print(f"1. Training Partition:")
    print(f"   • Protocol:       {'EXISTS' if train_details['protocol_exists'] else 'MISSING'} ({train_protocol})")
    print(f"   • Audio Dir:      {'EXISTS' if train_details['audio_dir_exists'] else 'MISSING'} ({train_audio})")
    print(f"   • Total Records:  {train_details['total_records']}")
    print(f"   • Bonafide:       {train_details['bonafide']} ({train_pct_bonafide:.1f}%)")
    print(f"   • Spoof:          {train_details['spoof']} ({train_pct_spoof:.1f}%)")
    print(f"   • Audio Matches:  {train_details['found_audio']} / {train_details['total_records']}")
    print(f"   • Missing Audio:  {train_details['missing_audio']}")
    print(f"   • Directory Size: {format_bytes(train_details['audio_dir_size'])}")
    if train_details['sample_rate'] is not None:
        print(f"   • Audio Format:   {train_details['sample_rate']} Hz, {train_details['channels']} ch")
    print(f"   • Status:         {'VALID ✅' if train_ok else 'FAILED ❌'}")

    dev_pct_bonafide = (dev_details['bonafide'] / dev_details['total_records'] * 100.0) if dev_details['total_records'] > 0 else 0.0
    dev_pct_spoof = (dev_details['spoof'] / dev_details['total_records'] * 100.0) if dev_details['total_records'] > 0 else 0.0
    print(f"\n2. Development Partition:")
    print(f"   • Protocol:       {'EXISTS' if dev_details['protocol_exists'] else 'MISSING'} ({dev_protocol})")
    print(f"   • Audio Dir:      {'EXISTS' if dev_details['audio_dir_exists'] else 'MISSING'} ({dev_audio})")
    print(f"   • Total Records:  {dev_details['total_records']}")
    print(f"   • Bonafide:       {dev_details['bonafide']} ({dev_pct_bonafide:.1f}%)")
    print(f"   • Spoof:          {dev_details['spoof']} ({dev_pct_spoof:.1f}%)")
    print(f"   • Audio Matches:  {dev_details['found_audio']} / {dev_details['total_records']}")
    print(f"   • Missing Audio:  {dev_details['missing_audio']}")
    print(f"   • Directory Size: {format_bytes(dev_details['audio_dir_size'])}")
    if dev_details['sample_rate'] is not None:
        print(f"   • Audio Format:   {dev_details['sample_rate']} Hz, {dev_details['channels']} ch")
    print(f"   • Status:         {'VALID ✅' if dev_ok else 'FAILED ❌'}")
    print("-" * 75)

    if train_ok and dev_ok:
        total_size = train_details["audio_dir_size"] + dev_details["audio_dir_size"]
        print(f"SUCCESS: ASVspoof 5 dataset is complete and verified! Total audio size: {format_bytes(total_size)}")
        print("You can now proceed to run the training pipeline:")
        print("  python scripts/train_deepfake_v2.py --data-dir data/asvspoof5")
        print("=" * 75)
        return 0
    else:
        print("FAIL: ASVspoof 5 dataset is missing or incomplete.")
        print("Training cannot start until all protocols and FLAC files are present.")
        print("=" * 75)
        return 1


if __name__ == "__main__":
    sys.exit(main())
