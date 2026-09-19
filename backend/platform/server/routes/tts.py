"""
backend/platform/server/routes/tts.py
=====================================
REST API endpoints for Google Cloud Text-to-Speech security warnings.
Generates localized audio dynamically without exposing Google Cloud credentials to frontend.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from backend.platform.services.warning_tts_service import (
    LANGUAGE_CATALOG,
    WarningTTSService,
    normalize_language_code,
)
from backend.utils.logger import get_logger

log = get_logger("tts_routes")

router = APIRouter(prefix="/api/tts", tags=["Text-to-Speech Warning Module"])


class TTSGenerateRequest(BaseModel):
    language_code: str = Field("ta-IN", description="Language code (e.g., 'ta-IN', 'hi-IN', 'en-IN')")
    event_type: str = Field("CRITICAL", description="Security event ('CRITICAL', 'CREDENTIAL_EXPOSURE', 'HIGH')")
    custom_text: Optional[str] = Field(None, description="Optional custom warning text override")
    audio_format: str = Field("MP3", description="Audio encoding: 'MP3' or 'WAV'")


class LanguageInfoResponse(BaseModel):
    code: str
    name: str
    native_name: str
    region: str
    preferred_voice: str
    critical_warning: str
    credential_warning: str
    high_risk_warning: str


@router.get("/languages", response_model=List[LanguageInfoResponse])
def get_supported_languages() -> List[LanguageInfoResponse]:
    """Retrieve the centralized catalog of 8 supported Indian languages with warning scripts."""
    result = []
    for cfg in LANGUAGE_CATALOG.values():
        result.append(
            LanguageInfoResponse(
                code=cfg.code,
                name=cfg.name,
                native_name=cfg.native_name,
                region=cfg.region,
                preferred_voice=cfg.preferred_voice,
                critical_warning=cfg.critical_warning,
                credential_warning=cfg.credential_warning,
                high_risk_warning=cfg.high_risk_warning,
            )
        )
    return result


@router.post("/generate")
def generate_warning_audio(payload: TTSGenerateRequest) -> Dict[str, Any]:
    """
    Synthesizes security warning audio securely on the backend.
    Returns base64 encoded audio with localized script and voice metadata.
    """
    service = WarningTTSService.get_instance()
    try:
        res = service.synthesize_warning(
            language_code=payload.language_code,
            event_type=payload.event_type,
            custom_text=payload.custom_text,
            audio_format=payload.audio_format,
        )
        return {
            "success": True,
            "audio_base64": res["audio_base64"],
            "content_type": res["content_type"],
            "language_code": res["language_code"],
            "language_name": res["language_name"],
            "voice_name": res["voice_name"],
            "text": res["text"],
            "provider": res["provider"],
        }
    except Exception as exc:
        log.error("[TTS:Route] Failed to generate warning audio: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Warning audio generation failed: {str(exc)}",
        )


@router.get("/audio")
def stream_warning_audio(
    lang: str = Query("ta-IN", description="Language code, e.g. ta-IN, hi-IN, en-IN"),
    event: str = Query("CRITICAL", description="Security event, e.g. CRITICAL, CREDENTIAL_EXPOSURE, HIGH"),
    format: str = Query("MP3", description="Audio format: MP3 or WAV"),
) -> Response:
    """
    Stream binary warning audio directly (playable in HTML5 <audio> elements).
    """
    service = WarningTTSService.get_instance()
    try:
        res = service.synthesize_warning(
            language_code=lang,
            event_type=event,
            audio_format=format,
        )
        return Response(
            content=res["audio_bytes"],
            media_type=res["content_type"],
            headers={
                "Cache-Control": "public, max-age=3600",
                "X-Language-Code": res["language_code"],
                "X-TTS-Provider": res["provider"],
            },
        )
    except Exception as exc:
        log.error("[TTS:Route] Failed to stream warning audio: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio stream failed: {str(exc)}",
        )
