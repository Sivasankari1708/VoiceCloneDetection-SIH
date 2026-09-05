"""
backend/platform/schemas/protected_identities.py
================================================
Schemas for VIP protected identities and biometric enrollment.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ProtectedIdentityCreateDto(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    title: str = Field(..., min_length=2, max_length=255, description="Executive title, e.g. Chief Financial Officer")
    department: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = None
    phone: Optional[str] = None
    risk_priority: str = Field("HIGH", description="LOW, MEDIUM, HIGH, or CRITICAL")
    speaker_id: Optional[str] = Field(None, description="Optional custom speaker identifier")


class ProtectedIdentityDto(BaseModel):
    id: str
    org_id: str
    full_name: str
    title: str
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    risk_priority: str
    speaker_id: str
    is_enrolled: bool
    is_active: bool
    created_at: Optional[str] = None


class EnrollmentRequestDto(BaseModel):
    """
    Biometric enrollment payload containing audio samples.
    Samples can be Base64-encoded audio strings (WAV/FLAC/MP3) or local file paths.
    """
    audio_samples: List[str] = Field(
        ...,
        min_length=1,
        description="List of base64-encoded audio clips (or server audio file paths) for multi-sample enrollment.",
    )


class EnrollmentResponseDto(BaseModel):
    speaker_id: str
    success: bool
    status: str
    accepted_samples: int
    rejected_samples: int
    rejection_reasons: List[str] = []
    consistency_score: Optional[float] = None
    quality_warnings: List[str] = []
    message: str
