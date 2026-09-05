"""
tests/test_imports.py
----------------------
Basic smoke test: verifies that all backend modules and their public
symbols can be imported without errors.

Run with:
    python -m pytest backend/tests/test_imports.py -v
or:
    python backend/tests/test_imports.py
"""

from __future__ import annotations

import sys
import importlib


# ---------------------------------------------------------------------------
# Modules that must be importable without any dependencies installed
# ---------------------------------------------------------------------------
ALWAYS_IMPORTABLE = [
    "backend",
    "backend.audio",
    "backend.models",
    "backend.schemas",
    "backend.pipeline",
    "backend.intent",
    "backend.utils",
    "backend.utils.logger",
    "backend.utils.config",
    "backend.schemas.inference_result",
    "backend.audio.decoder",
    "backend.audio.vad",
    "backend.models.deepfake_detector",
    "backend.models.speaker_verifier",
    "backend.models.transcriber",
    "backend.pipeline.runner",
    "backend.intent.detector",
]


def test_all_modules_importable() -> None:
    """Every backend module must be importable (even if NotImplementedError stubs)."""
    failed = []
    for module_name in ALWAYS_IMPORTABLE:
        try:
            importlib.import_module(module_name)
        except ImportError as exc:
            failed.append(f"{module_name}: {exc}")

    if failed:
        for msg in failed:
            print(f"  FAIL  {msg}")
        raise AssertionError(f"{len(failed)} module(s) failed to import.")
    print(f"  OK    All {len(ALWAYS_IMPORTABLE)} modules imported successfully.")


def test_inference_result_schema() -> None:
    """InferenceResult dataclass must instantiate with defaults."""
    from backend.schemas.inference_result import (
        InferenceResult, AudioMeta, VADResult,
        DeepfakeResult, SpeakerResult, TranscriptionResult, IntentResult,
    )

    result = InferenceResult(request_id="smoke-test-001")
    assert result.verdict == "inconclusive"
    assert result.pipeline_version == "0.1.0"
    assert isinstance(result.timestamp, str)

    d = result.to_dict()
    assert d["request_id"] == "smoke-test-001"
    print("  OK    InferenceResult schema is valid.")


def test_config_defaults() -> None:
    """PipelineConfig must load with defaults."""
    from backend.utils.config import PipelineConfig

    cfg = PipelineConfig()
    assert cfg.target_sample_rate == 16000
    assert cfg.whisper_model_size == "base"
    assert cfg.whisper_device == "cpu"

    cfg_env = PipelineConfig.from_env()
    assert cfg_env.target_sample_rate == 16000
    print("  OK    PipelineConfig defaults and from_env() are valid.")


def test_logger_creation() -> None:
    """Logger must be created and return a logging.Logger instance."""
    import logging
    from backend.utils.logger import get_logger

    log = get_logger("test.smoke")
    assert isinstance(log, logging.Logger)
    log.info("Logger smoke test message — if you see this, logging works.")
    print("  OK    Logger created successfully.")


def test_intent_keywords_defined() -> None:
    """INTENT_KEYWORDS dict must be importable and non-empty."""
    from backend.intent.detector import INTENT_KEYWORDS

    assert len(INTENT_KEYWORDS) > 0
    for intent, keywords in INTENT_KEYWORDS.items():
        assert isinstance(keywords, list)
        assert len(keywords) > 0
    print(f"  OK    {len(INTENT_KEYWORDS)} intents defined in INTENT_KEYWORDS.")


# ---------------------------------------------------------------------------
# Allow direct execution: python backend/tests/test_imports.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    tests = [
        test_all_modules_importable,
        test_inference_result_schema,
        test_config_defaults,
        test_logger_creation,
        test_intent_keywords_defined,
    ]

    print("\n=== VoiceCloneDetection-SIH — Import Smoke Tests ===\n")
    passed = 0
    for t in tests:
        print(f"[RUN] {t.__name__}")
        try:
            t()
            passed += 1
        except Exception as exc:
            print(f"  FAIL  {exc}")
    print(f"\n{'='*50}")
    print(f"Result: {passed}/{len(tests)} tests passed.")
    sys.exit(0 if passed == len(tests) else 1)
