"""
backend/models/deepfake_v2
==========================
Deepfake Detection V2 package trained on ASVspoof 5 dataset.
"""

from backend.models.deepfake_v2.dataset import (
    ASVspoof5Dataset,
    ASVspoof2019Dataset,
    ASVspoof2019ProtocolEntry,
    FolderAudioDataset,
    FolderAudioEntry,
    ProtocolEntry,
    create_dataloader,
    parse_asvspoof5_protocol,
    parse_asvspoof2019_protocol,
    split_folder_dataset,
    validate_asvspoof2019_la,
)
from backend.models.deepfake_v2.features import LogMelFeatureExtractor
from backend.models.deepfake_v2.inference import DeepfakeV2Detector, DeepfakeV2Result
from backend.models.deepfake_v2.model import DeepfakeCNN
from backend.models.deepfake_v2.trainer import (
    Trainer,
    TrainingConfig,
    compute_eer,
    compute_metrics,
)

__all__ = [
    "DeepfakeCNN",
    "LogMelFeatureExtractor",
    "ASVspoof5Dataset",
    "ASVspoof2019Dataset",
    "ASVspoof2019ProtocolEntry",
    "FolderAudioDataset",
    "FolderAudioEntry",
    "split_folder_dataset",
    "ProtocolEntry",
    "parse_asvspoof5_protocol",
    "parse_asvspoof2019_protocol",
    "validate_asvspoof2019_la",
    "create_dataloader",
    "Trainer",
    "TrainingConfig",
    "compute_eer",
    "compute_metrics",
    "DeepfakeV2Detector",
    "DeepfakeV2Result",
]
