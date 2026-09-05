"""
backend/platform/schemas/calls.py
=================================
Schemas for Call Session management and lifecycle.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class CallStartRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Optional custom session ID; generated if omitted.")
    caller_number: Optional[str] = Field(None, description="Inbound caller telephone number or SIP URI.")
    caller_name: Optional[str] = Field(None, description="Inbound caller display name.")
    claimed_speaker_id: Optional[str] = Field(
        None,
        description="Claimed speaker identity (e.g. enrolled speaker ID of VIP/CFO) for biometric verification.",
    )


class CallEndRequest(BaseModel):
    reason: Optional[str] = Field("NORMAL_HANGUP", description="Reason for call termination.")


class CallSessionDto(BaseModel):
    session_id: str
    org_id: str
    user_id: Optional[str] = None
    caller_number: Optional[str] = None
    caller_name: Optional[str] = None
    claimed_speaker_id: Optional[str] = None
    status: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    total_chunks: int = 0
    total_speech_seconds: float = 0.0
    current_risk_score: float = 0.0
    current_risk_level: str = "SAFE"
    final_verdict: str = "inconclusive"
    alert_triggered: bool = False
    alert_reason: Optional[str] = None
    accumulated_transcript: str = ""


class CallSummaryDto(BaseModel):
    session_id: str
    claimed_speaker_id: Optional[str] = None
    total_chunks: int
    total_audio_seconds: float
    total_speech_seconds: float
    mean_latency_ms: float
    mean_rtf: float
    final_verdict: str
    alert_triggered: bool
    alert_reason: Optional[str] = None
    accumulated_transcript: str
    final_risk_score: float
    final_risk_level: str
