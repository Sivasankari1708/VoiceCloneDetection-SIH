"""
backend/platform/schemas/events.py
==================================
Stable WebSocket event contracts between Backend Platform and Frontend.

Event Types:
  - CALL_STARTED
  - RISK_UPDATE
  - USER_SECURITY_ALERT
  - ORGANIZATION_SECURITY_ALERT
  - INCIDENT_CREATED
  - INCIDENT_UPDATED
  - SECURITY_ACTION
  - CALL_ENDED
  - ERROR
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WebSocketEventType(str, Enum):
    CALL_STARTED = "CALL_STARTED"
    INCOMING_CALL = "INCOMING_CALL"
    CALL_ACCEPTED = "CALL_ACCEPTED"
    CALL_REJECTED = "CALL_REJECTED"
    RISK_UPDATE = "RISK_UPDATE"
    USER_SECURITY_ALERT = "USER_SECURITY_ALERT"
    ORGANIZATION_SECURITY_ALERT = "ORGANIZATION_SECURITY_ALERT"
    INCIDENT_CREATED = "INCIDENT_CREATED"
    INCIDENT_UPDATED = "INCIDENT_UPDATED"
    SECURITY_ACTION = "SECURITY_ACTION"
    CALL_ENDED = "CALL_ENDED"
    ERROR = "ERROR"


class BaseWebSocketMessage(BaseModel):
    """Envelope for all WebSocket messages."""
    event: WebSocketEventType
    timestamp: str
    data: Dict[str, Any]


# ---------------------------------------------------------------------------
# Individual Event Payloads
# ---------------------------------------------------------------------------

class CallStartedPayload(BaseModel):
    session_id: str
    org_id: str
    user_id: Optional[str] = None
    caller_number: Optional[str] = None
    caller_name: Optional[str] = None
    claimed_speaker_id: Optional[str] = None
    timestamp: str


class RiskUpdatePayload(BaseModel):
    """
    Per-chunk real-time telemetry sent to the active call client.
    Contains acoustic, biometric, intent, and risk scores.
    """
    session_id: str
    chunk_id: int
    timestamp: str
    speech_detected: bool
    risk_score: float
    risk_level: str  # SAFE, LOW, MEDIUM, HIGH, CRITICAL
    synthetic_probability: Optional[float] = None
    smoothed_synthetic_probability: Optional[float] = None
    speaker_similarity: Optional[float] = None
    smoothed_speaker_similarity: Optional[float] = None
    identity_status: str  # "MATCHED", "MISMATCHED", "UNENROLLED", "INCONCLUSIVE"
    speaker_match: Optional[bool] = None
    transcript: str = ""
    accumulated_transcript: str = ""
    intent: str = "NORMAL_CONVERSATION"
    intent_confidence: float = 0.0
    context_signals: List[str] = []
    verdict: str  # "genuine", "cloned", "imposter", "inconclusive"
    reasons: List[str] = []
    recommended_action: str  # "ALLOW", "MONITOR", "VERIFY_SPEAKER", "BLOCK_OR_ESCALATE"
    is_alert: bool = False
    alert_reason: Optional[str] = None
    latency_ms: float = 0.0
    real_time_factor: float = 0.0


class UserSecurityAlertPayload(BaseModel):
    """
    Immediate real-time warning sent to the call recipient when HIGH/CRITICAL risk is detected.
    """
    session_id: str
    severity: str  # HIGH, CRITICAL
    risk_score: float
    warning_message: str
    claimed_identity: Optional[str] = None
    reasons: List[str] = []
    recommended_action: str
    timestamp: str


class OrganizationSecurityAlertPayload(BaseModel):
    """
    Real-time high-priority security alert broadcast to organization SOC operator dashboard.
    """
    incident_id: str
    org_id: str
    session_id: str
    severity: str  # HIGH, CRITICAL
    scenario: str
    risk_score: float
    claimed_identity: Optional[str] = None
    target_individual: Optional[str] = None
    synthetic_probability: Optional[float] = None
    speaker_similarity: Optional[float] = None
    intent: Optional[str] = None
    reasons: List[str] = []
    recommended_action: str
    timestamp: str


class IncidentEventPayload(BaseModel):
    """Notification when an incident is created or its status/risk is updated."""
    incident_id: str
    org_id: str
    session_id: str
    severity: str
    scenario: str
    status: str
    risk_score: float
    claimed_identity: Optional[str] = None
    target_individual: Optional[str] = None
    intent: Optional[str] = None
    reasons: List[str] = []
    recommended_action: str
    timestamp: str


class SecurityActionPayload(BaseModel):
    """Notification when an operator executes a security mitigation action."""
    action_id: str
    incident_id: Optional[str] = None
    session_id: str
    action_type: str
    actor_id: Optional[str] = None
    status: str
    notes: Optional[str] = None
    timestamp: str


class CallEndedPayload(BaseModel):
    session_id: str
    status: str
    total_chunks: int
    total_audio_seconds: float
    total_speech_seconds: float
    final_risk_score: float
    final_risk_level: str
    final_verdict: str
    alert_triggered: bool
    accumulated_transcript: str
    timestamp: str
