"""
backend/models/asr_factory.py
=============================
Factory for instantiating the speech-to-text (ASR) provider.
VoiceShield uses Google Cloud Speech-to-Text as the sole ASR implementation.

Usage:
    from backend.models.asr_factory import create_asr_provider
    asr = create_asr_provider()  # Returns GoogleSTTASR
"""

from __future__ import annotations

import os
from typing import Any, Optional

from backend.models.asr_base import ASRResult, BaseASR
from backend.models.google_stt_asr import GoogleSTTASR
from backend.utils.logger import get_logger

log = get_logger(__name__)


def create_asr_provider(
    provider_name: Optional[str] = None,
    language: Optional[str] = None,
    **kwargs: Any,
) -> BaseASR:
    """
    Instantiate and return the Google Cloud Speech-to-Text ASR provider.

    Parameters
    ----------
    provider_name : str | None
        Ignored or must be 'google' (Google Cloud STT is the sole provider).
    language : str | None
        Language code (e.g. 'en-IN', 'en-US', 'hi-IN').
        Defaults to environment variable `ASR_LANGUAGE` (default: 'en-IN').
    **kwargs : Any
        Passed directly to GoogleSTTASR.

    Returns
    -------
    BaseASR (GoogleSTTASR)
    """
    lang = language or os.getenv("ASR_LANGUAGE", "en-IN").strip()
    log.info("[ASRFactory] Initializing Google Cloud Speech-to-Text provider (language=%s)", lang)
    return GoogleSTTASR(language_code=lang, **kwargs)


__all__ = [
    "ASRResult",
    "BaseASR",
    "GoogleSTTASR",
    "create_asr_provider",
]
