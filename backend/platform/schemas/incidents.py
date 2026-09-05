"""
backend/platform/schemas/incidents.py
=====================================
Schemas for Security Incidents and Operator Actions.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class IncidentActionRequest(BaseModel):
    """Action performed by a security operator on an incident."""
    action_type: str = Field(
        ...,
        description="CONFIRM_ATTACK | FALSE_POSITIVE | ESCALATE | RESOLVE | BLOCK_CALL | REQUIRE_ADDITIONAL_VERIFICATION | DISMISS",
    )
    notes: Optional[str] = Field(None, description="Operator investigation notes or justification.")


class IncidentUpdateDto(BaseModel):
    status: Optional[str] = Field(None, description="OPEN | UNDER_REVIEW | CONFIRMED_ATTACK | FALSE_POSITIVE | RESOLVED")
    operator_notes: Optional[str] = None


class SecurityActionDto(BaseModel):
    action_id: str
    incident_id: Optional[str] = None
    session_id: str
    action_type: str
    actor_id: Optional[str] = None
    status: str
    notes: Optional[str] = None
    timestamp: Optional[str] = None


class IncidentDto(BaseModel):
    incident_id: str
    org_id: str
    session_id: str
    severity: str
    scenario: str
    claimed_identity: Optional[str] = None
    risk_score: float
    synthetic_probability: Optional[float] = None
    speaker_similarity: Optional[float] = None
    identity_status: Optional[str] = None
    intent: Optional[str] = None
    context_signals: List[str] = []
    reasons: List[str] = []
    recommended_action: str
    status: str
    operator_id: Optional[str] = None
    operator_notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    resolved_at: Optional[str] = None
    actions: List[SecurityActionDto] = []


class IncidentFilterParams(BaseModel):
    severity: Optional[str] = None
    status: Optional[str] = None
    session_id: Optional[str] = None
    limit: int = 50
    offset: int = 0
