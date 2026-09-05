import argparse
import json
import shutil
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.models.deepfake_v2 import (
    ASVspoof5Dataset,
    ASVspoof2019Dataset,
    DeepfakeCNN,
    FolderAudioDataset,
    LogMelFeatureExtractor,
    Trainer,
    TrainingConfig,
    create_dataloader,
    parse_asvspoof5_protocol,
    parse_asvspoof2019_protocol,
    split_folder_dataset,
    validate_asvspoof2019_la,
)
from backend.utils.logger import get_logger

log = get_logger("train_deepfake_v2")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train Deepfake CNN v2 on real audio deepfake datasets."
    )
    parser.add_argument(
        "--dataset",
        type=str,
        choices=["asvspoof2021_mixed", "asvspoof2019_la", "asvspoof5"],
        default="asvspoof2021_mixed",
        help="Target dataset (default: asvspoof2021_mixed)",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Root directory for dataset (defaults according to --dataset)",
    )
    parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.2,
        help="Validation split ratio for folder datasets (default: 0.2)",
    )
    parser.add_argument(
        "--split-seed",
        type=int,
        default=42,
        help="Random seed for deterministic train/val splitting (default: 42)",
    )
    parser.add_argument(
        "--checkpoint-name",
        type=str,
        default=None,
        help="Custom checkpoint filename (defaults according to --dataset)",
    )
    parser.add_argument(
        "--protocol-train",
        type=Path,
        default=None,
        help="[ASVspoof 5 only] Path to training protocol file",
    )
    parser.add_argument(
        "--protocol-dev",
        type=Path,
        default=None,
        help="[ASVspoof 5 only] Path to dev protocol file",
    )
    parser.add_argument(
        "--flac-train",
        type=Path,
        default=None,
        help="[ASVspoof 5 only] Directory with training FLAC files",
    )
    parser.add_argument(
        "--flac-dev",
        type=Path,
        default=None,
        help="[ASVspoof 5 only] Directory with dev FLAC files",
    )
    parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    parser.add_argument("--weight-decay", type=float, default=1e-4, help="Weight decay")
    parser.add_argument(
        "--checkpoint-dir",
        type=Path,
        default=PROJECT_ROOT / "checkpoints",
        help="Directory to save model checkpoints",
    )
    parser.add_argument(
        "--limit-train",
        type=int,
        default=None,
        help="Limit number of training samples (for debugging/smoke tests)",
    )
    parser.add_argument(
        "--limit-dev",
        type=int,
        default=None,
        help="Limit number of dev samples (for debugging/smoke tests)",
    )
    parser.add_argument("--num-workers", type=int, default=0, help="DataLoader num_workers")
    parser.add_argument("--device", type=str, default="auto", help="Device (auto, cpu, cuda, mps)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    feature_extractor = LogMelFeatureExtractor(sample_rate=16_000)

    # ─────────────────────────────────────────────────────────────────────────
    # Branch 1: ASVspoof 2021 Mixed (Folder-based dataset)
    # ─────────────────────────────────────────────────────────────────────────
    if args.dataset == "asvspoof2021_mixed":
        data_dir = args.data_dir or (PROJECT_ROOT / "data" / "asvspoof2021_mixed")
        data_dir_res = data_dir.resolve()

        if not data_dir_res.is_dir():
            log.error("=" * 70)
            log.error("DATA NOT FOUND: asvspoof2021_mixed dataset not found at: %s", data_dir_res)
            log.error("Expected directories:")
            log.error("  %s/real_voice/*.wav", data_dir_res)
            log.error("  %s/fake_voice/*.wav", data_dir_res)
            log.error("=" * 70)
            return 1

        real_dir = data_dir_res / "real_voice"
        fake_dir = data_dir_res / "fake_voice"
        if not real_dir.is_dir() or not fake_dir.is_dir():
            log.error("=" * 70)
            log.error("SAFETY ERROR: Both 'real_voice' and 'fake_voice' subdirectories must exist.")
            log.error("Missing: real_voice=%s, fake_voice=%s", real_dir.is_dir(), fake_dir.is_dir())
            log.error("=" * 70)
            return 1

        try:
            train_entries, dev_entries = split_folder_dataset(
                data_dir=data_dir_res,
                class_mapping={"real_voice": 0, "fake_voice": 1},
                val_ratio=args.val_ratio,
                seed=args.split_seed,
            )
        except Exception as exc:
            log.error("SAFETY ERROR: Failed to split folder dataset: %s", exc)
            return 1

        total_discovered = len(train_entries) + len(dev_entries)
        discovered_real = sum(1 for e in train_entries if e.label_id == 0) + sum(1 for e in dev_entries if e.label_id == 0)
        discovered_fake = sum(1 for e in train_entries if e.label_id == 1) + sum(1 for e in dev_entries if e.label_id == 1)

        if args.limit_train is not None:
            half_real = max(1, args.limit_train // 2)
            reals = [e for e in train_entries if e.label_id == 0][:half_real]
            fakes = [e for e in train_entries if e.label_id == 1][:(args.limit_train - len(reals))]
            train_entries = reals + fakes

        if args.limit_dev is not None:
            half_real = max(1, args.limit_dev // 2)
            reals = [e for e in dev_entries if e.label_id == 0][:half_real]
            fakes = [e for e in dev_entries if e.label_id == 1][:(args.limit_dev - len(reals))]
            dev_entries = reals + fakes

        train_dataset = FolderAudioDataset(
            entries=train_entries,
            feature_extractor=feature_extractor,
            is_training=True,
        )
        dev_dataset = FolderAudioDataset(
            entries=dev_entries,
            feature_extractor=feature_extractor,
            is_training=False,
        )

        if len(train_dataset) == 0 or len(dev_dataset) == 0:
            log.error("SAFETY ERROR: Train or dev dataset has 0 samples. Cannot proceed.")
            return 1

        train_real = sum(1 for e in train_dataset.entries if e.label_id == 0)
        train_fake = sum(1 for e in train_dataset.entries if e.label_id == 1)
        dev_real = sum(1 for e in dev_dataset.entries if e.label_id == 0)
        dev_fake = sum(1 for e in dev_dataset.entries if e.label_id == 1)
        total_samples = total_discovered
        total_real = discovered_real
        total_fake = discovered_fake

        checkpoint_name = args.checkpoint_name or "deepfake_v2_asvspoof2021_mixed.pt"
        checkpoint_path = args.checkpoint_dir.resolve() / checkpoint_name

        extra_metadata = {
            "dataset_name": "asvspoof2021_mixed",
            "dataset_path": str(data_dir_res),
            "class_mapping": {"real_voice": 0, "fake_voice": 1},
            "split_seed": args.split_seed,
            "val_ratio": args.val_ratio,
            "total_samples": total_samples,
            "real_count": total_real,
            "fake_count": total_fake,
            "train_count": len(train_dataset),
            "validation_count": len(dev_dataset),
            "train_class_distribution": {"bonafide": train_real, "spoof": train_fake},
            "val_class_distribution": {"bonafide": dev_real, "spoof": dev_fake},
            "model_architecture": "DeepfakeCNN",
            "feature_parameters": {
                "sample_rate": 16_000,
                "n_mels": 80,
                "n_fft": 400,
                "hop_length": 160,
                "f_min": 20.0,
                "f_max": 8000.0,
                "eps": 1e-6,
                "normalize": True,
            },
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "weight_decay": args.weight_decay,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Branch 2: ASVspoof 2019 LA (Official Protocol-based dataset)
    # ─────────────────────────────────────────────────────────────────────────
    elif args.dataset == "asvspoof2019_la":
        data_dir = args.data_dir or (PROJECT_ROOT / "data" / "asvspoof2019" / "LA")
        data_dir_res = data_dir.resolve()

        if not data_dir_res.is_dir():
            log.error("=" * 70)
            log.error("DATA NOT FOUND: ASVspoof 2019 LA dataset not found at: %s", data_dir_res)
            log.error("Expected directory structure:")
            log.error("  %s/ASVspoof2019_LA_cm_protocols/ASVspoof2019.LA.cm.train.trn.txt", data_dir_res)
            log.error("  %s/ASVspoof2019_LA_cm_protocols/ASVspoof2019.LA.cm.dev.trl.txt", data_dir_res)
            log.error("  %s/ASVspoof2019_LA_train/flac/*.flac", data_dir_res)
            log.error("  %s/ASVspoof2019_LA_dev/flac/*.flac", data_dir_res)
            log.error("=" * 70)
            return 1

        try:
            stats = validate_asvspoof2019_la(data_dir_res, check_eval=False)
            log.info("ASVspoof 2019 LA structure and integrity validated successfully.")
        except Exception as exc:
            log.error("=" * 70)
            log.error("VALIDATION ERROR: ASVspoof 2019 LA validation failed: %s", exc)
            log.error("=" * 70)
            return 1

        train_proto = args.protocol_train or Path(stats["train_protocol"])
        dev_proto = args.protocol_dev or Path(stats["dev_protocol"])
        flac_train = args.flac_train or Path(stats["train_flac_dir"])
        flac_dev = args.flac_dev or Path(stats["dev_flac_dir"])

        log.info("Loading training protocol from: %s", train_proto)
        train_entries = parse_asvspoof2019_protocol(train_proto, audio_dir=flac_train)
        log.info("Parsed %d training protocol records", len(train_entries))

        log.info("Loading dev protocol from: %s", dev_proto)
        dev_entries = parse_asvspoof2019_protocol(dev_proto, audio_dir=flac_dev)
        log.info("Parsed %d dev protocol records", len(dev_entries))

        if args.limit_train is not None:
            half_real = max(1, args.limit_train // 2)
            reals = [e for e in train_entries if e.label_id == 0][:half_real]
            fakes = [e for e in train_entries if e.label_id == 1][:(args.limit_train - len(reals))]
            train_entries = reals + fakes

        if args.limit_dev is not None:
            half_real = max(1, args.limit_dev // 2)
            reals = [e for e in dev_entries if e.label_id == 0][:half_real]
            fakes = [e for e in dev_entries if e.label_id == 1][:(args.limit_dev - len(reals))]
            dev_entries = reals + fakes

        train_dataset = ASVspoof2019Dataset(
            entries=train_entries,
            audio_dir=flac_train,
            feature_extractor=feature_extractor,
            is_training=True,
            filter_missing=True,
        )
        dev_dataset = ASVspoof2019Dataset(
            entries=dev_entries,
            audio_dir=flac_dev,
            feature_extractor=feature_extractor,
            is_training=False,
            filter_missing=True,
        )

        if len(train_dataset) == 0 or len(dev_dataset) == 0:
            log.error("SAFETY ERROR: Train or dev dataset has 0 samples. Cannot proceed.")
            return 1

        train_real = sum(1 for e in train_dataset.entries if e.label_id == 0)
        train_fake = sum(1 for e in train_dataset.entries if e.label_id == 1)
        dev_real = sum(1 for e in dev_dataset.entries if e.label_id == 0)
        dev_fake = sum(1 for e in dev_dataset.entries if e.label_id == 1)
        total_samples = len(train_dataset) + len(dev_dataset)
        total_real = train_real + dev_real
        total_fake = train_fake + dev_fake

        checkpoint_name = args.checkpoint_name or "deepfake_v2_asvspoof2019_la.pt"
        checkpoint_path = args.checkpoint_dir.resolve() / checkpoint_name

        extra_metadata = {
            "dataset_name": "ASVspoof2019_LA",
            "dataset_path": str(data_dir_res),
            "train_protocol": str(train_proto),
            "dev_protocol": str(dev_proto),
            "class_mapping": {"bonafide": 0, "spoof": 1},
            "official_split": {
                "train": len(train_dataset),
                "dev": len(dev_dataset),
                "eval": "untouched",
            },
            "total_samples": total_samples,
            "real_count": total_real,
            "fake_count": total_fake,
            "train_count": len(train_dataset),
            "validation_count": len(dev_dataset),
            "train_class_distribution": {"bonafide": train_real, "spoof": train_fake},
            "val_class_distribution": {"bonafide": dev_real, "spoof": dev_fake},
            "missing_train_files": stats.get("missing_train_files", 0),
            "missing_dev_files": stats.get("missing_dev_files", 0),
            "duplicate_train_ids": stats.get("duplicate_train_ids", 0),
            "duplicate_dev_ids": stats.get("duplicate_dev_ids", 0),
            "train_dev_overlap_count": stats.get("train_dev_overlap_count", 0),
            "model_architecture": "DeepfakeCNN",
            "feature_parameters": {
                "sample_rate": 16_000,
                "n_mels": 80,
                "n_fft": 400,
                "hop_length": 160,
                "f_min": 20.0,
                "f_max": 8000.0,
                "eps": 1e-6,
                "normalize": True,
            },
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "weight_decay": args.weight_decay,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Branch 3: ASVspoof 5 (Protocol-based dataset)
    # ─────────────────────────────────────────────────────────────────────────
    elif args.dataset == "asvspoof5":
        data_dir = args.data_dir or (PROJECT_ROOT / "data" / "asvspoof5")
        data_dir_res = data_dir.resolve()

        if "asvspoof2019" in str(data_dir_res).lower():
            log.error("=" * 70)
            log.error("SAFETY ERROR: ASVspoof 2019 directory detected.")
            log.error("ASVspoof 2019 cannot be used for Deepfake v2 training.")
            log.error("Deepfake v2 requires the official ASVspoof 5 dataset.")
            log.error("=" * 70)
            return 1

        train_proto = args.protocol_train or (data_dir / "protocols" / "ASVspoof5.train.tsv")
        dev_proto = args.protocol_dev or (data_dir / "protocols" / "ASVspoof5.dev.track_1.tsv")
        if not dev_proto.is_file() and (data_dir / "protocols" / "ASVspoof5.dev.tsv").is_file():
            dev_proto = data_dir / "protocols" / "ASVspoof5.dev.tsv"

        flac_train = args.flac_train or (data_dir / "flac_T")
        flac_dev = args.flac_dev or (data_dir / "flac_D")

        missing_items = []
        if not data_dir.is_dir():
            missing_items.append(f"Dataset root directory missing: {data_dir}")
        if not train_proto.is_file():
            missing_items.append(f"Training protocol missing: {train_proto}")
        if not dev_proto.is_file():
            missing_items.append(f"Development protocol missing: {dev_proto}")
        if not flac_train.is_dir():
            missing_items.append(f"Training audio directory (flac_T) missing: {flac_train}")
        if not flac_dev.is_dir():
            missing_items.append(f"Development audio directory (flac_D) missing: {flac_dev}")

        if missing_items:
            log.error("=" * 70)
            log.error("DATA NOT FOUND: ASVspoof 5 dataset is not present or incomplete.")
            for item in missing_items:
                log.error("  • %s", item)
            log.error("-" * 70)
            log.error("To train the model, please download ASVspoof 5 from Zenodo:")
            log.error("  Zenodo Record: https://zenodo.org/records/14498691")
            log.error("Place the uncompressed files under %s as follows:", data_dir)
            log.error("  %s/protocols/ASVspoof5.train.tsv", data_dir)
            log.error("  %s/protocols/ASVspoof5.dev.track_1.tsv", data_dir)
            log.error("  %s/flac_T/*.flac", data_dir)
            log.error("  %s/flac_D/*.flac", data_dir)
            log.error("=" * 70)
            return 1

        log.info("Loading training protocol from: %s", train_proto)
        train_entries = parse_asvspoof5_protocol(train_proto, audio_dir=flac_train, limit=args.limit_train)
        log.info("Parsed %d training protocol records", len(train_entries))

        log.info("Loading dev protocol from: %s", dev_proto)
        dev_entries = parse_asvspoof5_protocol(dev_proto, audio_dir=flac_dev, limit=args.limit_dev)
        log.info("Parsed %d dev protocol records", len(dev_entries))

        train_dataset = ASVspoof5Dataset(
            entries=train_entries,
            audio_dir=flac_train,
            feature_extractor=feature_extractor,
            is_training=True,
            filter_missing=True,
        )
        dev_dataset = ASVspoof5Dataset(
            entries=dev_entries,
            audio_dir=flac_dev,
            feature_extractor=feature_extractor,
            is_training=False,
            filter_missing=True,
        )

        if len(train_dataset) == 0:
            log.error("SAFETY ERROR: Zero real training audio files found in %s! Aborting training.", flac_train)
            return 1
        if len(dev_dataset) == 0:
            log.error("SAFETY ERROR: Zero real validation audio files found in %s! Aborting training.", flac_dev)
            return 1

        train_real = sum(1 for e in train_dataset.entries if e.label_id == 0)
        train_fake = sum(1 for e in train_dataset.entries if e.label_id == 1)
        dev_real = sum(1 for e in dev_dataset.entries if e.label_id == 0)
        dev_fake = sum(1 for e in dev_dataset.entries if e.label_id == 1)
        total_samples = len(train_dataset) + len(dev_dataset)
        total_real = train_real + dev_real
        total_fake = train_fake + dev_fake

        checkpoint_name = args.checkpoint_name or "deepfake_v2_asvspoof5.pt"
        checkpoint_path = args.checkpoint_dir.resolve() / checkpoint_name

        extra_metadata = {
            "dataset_name": "asvspoof5",
            "dataset_path": str(data_dir_res),
            "class_mapping": {"bonafide": 0, "spoof": 1},
            "train_protocol": str(train_proto),
            "dev_protocol": str(dev_proto),
            "total_samples": total_samples,
            "real_count": total_real,
            "fake_count": total_fake,
            "train_count": len(train_dataset),
            "validation_count": len(dev_dataset),
            "train_class_distribution": {"bonafide": train_real, "spoof": train_fake},
            "val_class_distribution": {"bonafide": dev_real, "spoof": dev_fake},
            "model_architecture": "DeepfakeCNN",
            "feature_parameters": {
                "sample_rate": 16_000,
                "n_mels": 80,
                "n_fft": 400,
                "hop_length": 160,
                "f_min": 20.0,
                "f_max": 8000.0,
                "eps": 1e-6,
                "normalize": True,
            },
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.lr,
            "weight_decay": args.weight_decay,
        }

    else:
        raise ValueError(f"Unsupported dataset: {args.dataset}")

    # ─────────────────────────────────────────────────────────────────────────
    # Dataloaders and Device Resolution
    # ─────────────────────────────────────────────────────────────────────────
    train_loader = create_dataloader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
    )
    val_loader = create_dataloader(
        dev_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
    )

    device = args.device
    if device == "auto":
        import torch
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

    config = TrainingConfig(
        epochs=args.epochs,
        lr=args.lr,
        weight_decay=args.weight_decay,
        batch_size=args.batch_size,
        checkpoint_dir=args.checkpoint_dir,
        device=device,
        extra_metadata=extra_metadata,
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Print Full Dataset and Training Manifest
    # ─────────────────────────────────────────────────────────────────────────
    print("=" * 75)
    print(f" Deepfake v2 Training Manifest [{args.dataset}]")
    print("=" * 75)
    print(f"Dataset path:            {data_dir_res}")
    print(f"Total samples:           {total_samples}")
    print(f"  • Real count:          {total_real}")
    print(f"  • Fake count:          {total_fake}")
    print(f"Train count:             {len(train_dataset)}")
    print(f"  • Real (bonafide):     {train_real} ({train_real / len(train_dataset) * 100:.1f}%)")
    print(f"  • Fake (spoof):        {train_fake} ({train_fake / len(train_dataset) * 100:.1f}%)")
    print(f"Validation count:        {len(dev_dataset)}")
    print(f"  • Real (bonafide):     {dev_real} ({dev_real / len(dev_dataset) * 100:.1f}%)")
    print(f"  • Fake (spoof):        {dev_fake} ({dev_fake / len(dev_dataset) * 100:.1f}%)")
    print(f"Output checkpoint path:  {checkpoint_path}")
    print(f"Device:                  {device}")
    print(f"Epochs:                  {config.epochs}")
    print(f"Batch size:              {config.batch_size}")
    print(f"Learning rate:           {config.lr}")
    print("=" * 75)

    model = DeepfakeCNN()
    trainer = Trainer(
        model=model,
        config=config,
        train_loader=train_loader,
        val_loader=val_loader,
    )

    log.info("Starting training run on %s...", args.dataset)
    history = trainer.fit()

    # Save target checkpoint
    best_source = args.checkpoint_dir / "best_model.pt"
    if best_source.is_file():
        shutil.copy2(best_source, checkpoint_path)
        meta_source = args.checkpoint_dir / "best_model.metadata.json"
        meta_target = checkpoint_path.parent / f"{checkpoint_path.stem}.metadata.json"
        if meta_source.is_file():
            shutil.copy2(meta_source, meta_target)
        log.info("Copied best model to target checkpoint: %s", checkpoint_path)

    log.info("Training completed successfully! Total epochs: %d", len(history))
    return 0


if __name__ == "__main__":
    sys.exit(main())
