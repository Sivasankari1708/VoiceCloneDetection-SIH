"""
backend/models/asr_factory.py
=============================
Factory for instantiating the active speech-to-text (ASR) provider.

Usage:
    from backend.models.asr_factory import create_asr_provider
    asr = create_asr_provider()  # reads ASR_PROVIDER from env ("whisper" or "google")
"""

from __future__ import annotations

import os
from typing import Any, Optional

from backend.models.asr_base import ASRResult, BaseASR
from backend.models.google_stt_asr import GoogleSTTASR
from backend.models.whisper_asr import WhisperASR
from backend.utils.logger import get_logger

log = get_logger(__name__)


def create_asr_provider(
    provider_name: Optional[str] = None,
    language: Optional[str] = None,
    **kwargs: Any,
) -> BaseASR:
    """
    Instantiate and return an ASR provider.

    Parameters
    ----------
    provider_name : str | None
        'whisper' (local offline CPU) or 'google' (streaming cloud gRPC).
        If None, reads from environment variable `ASR_PROVIDER` (default 'whisper').
    language : str | None
        Language code (e.g. 'en-IN', 'en', 'hi-IN').
        If None, reads from environment variable `ASR_LANGUAGE` (default 'en-IN').
    **kwargs : Any
        Provider-specific options.

    Returns
    -------
    BaseASR
    """
    provider = (
        provider_name
        or os.getenv("ASR_PROVIDER", "whisper")
    ).lower().strip()

    lang = language or os.getenv("ASR_LANGUAGE", "en-IN").strip()

    if provider in ("google", "google_stt", "gcp"):
        log.info("[ASRFactory] Selecting Google Cloud Speech-to-Text (language=%s)", lang)
        return GoogleSTTASR(language_code=lang, **kwargs)

    if provider in ("whisper", "faster_whisper", "local"):
        log.info("[ASRFactory] Selecting faster-whisper local ASR (int8 CPU)")
        return WhisperASR(**kwargs)

    raise ValueError(
        f"Unsupported ASR provider: '{provider}'. Supported providers are: 'whisper', 'google'."
    )


__all__ = [
    "ASRResult",
    "BaseASR",
    "GoogleSTTASR",
    "WhisperASR",
    "create_asr_provider",
]
