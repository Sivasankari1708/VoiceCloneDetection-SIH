"""
backend/platform/db/models.py
=============================
SQLAlchemy database models for VoiceCloneDetection-SIH Platform Layer.

Entities:
  - Organization
  - User
  - ProtectedIdentity
  - SpeakerProfileModel
  - CallSession
  - RiskEvent
  - SecurityIncident
  - SecurityAction
  - AuditLog
  - SecurityPolicy

Biometric Security & Privacy Guarantee:
  - Raw audio is NEVER stored in the database.
  - Embeddings are stored as serialized numerical vectors.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from backend.platform.db.session import Base


def utcnow() -> datetime:
    """Return timezone-aware current UTC datetime."""
    return datetime.now(timezone.utc)


def generate_uuid() -> str:
    """Generate a clean UUID4 string."""
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Organization & Multi-Tenancy
# ---------------------------------------------------------------------------

class Organization(Base):
    """Tenant organization entity for strict multi-tenant isolation."""
    __tablename__ = "organizations"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    code = Column(String(64), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    protected_identities = relationship("ProtectedIdentity", back_populates="organization", cascade="all, delete-orphan")
    call_sessions = relationship("CallSession", back_populates="organization", cascade="all, delete-orphan")
    incidents = relationship("SecurityIncident", back_populates="organization", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="organization", cascade="all, delete-orphan")
    policies = relationship("SecurityPolicy", back_populates="organization", uselist=False, cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Users & Roles (USER, SECURITY_OPERATOR, ADMIN)
# ---------------------------------------------------------------------------

class User(Base):
    """Platform user belonging to an organization."""
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    org_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    # Role: USER | SECURITY_OPERATOR | ADMIN
    role = Column(String(32), default="USER", nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="users")
    call_sessions = relationship("CallSession", back_populates="user")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ---------------------------------------------------------------------------
# Protected Identity & Biometric Profile
# ---------------------------------------------------------------------------

class ProtectedIdentity(Base):
    """
    VIP / Executive identity protected against voice-cloning impersonation
    (e.g., CFO, CEO, VP of Finance).
    """
    __tablename__ = "protected_identities"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    org_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)  # e.g. "Chief Financial Officer"
    department = Column(String(255), nullable=True)  # e.g. "Executive Leadership"
    email = Column(String(255), nullable=True)
    phone = Column(String(64), nullable=True)
    # Risk priority tier for this executive
    risk_priority = Column(String(32), default="HIGH", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    speaker_id = Column(String(128), unique=True, nullable=False, index=True)  # Key into speaker repository
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="protected_identities")
    speaker_profile = relationship("SpeakerProfileModel", back_populates="protected_identity", uselist=False, cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "full_name": self.full_name,
            "title": self.title,
            "department": self.department,
            "email": self.email,
            "phone": self.phone,
            "risk_priority": self.risk_priority,
            "speaker_id": self.speaker_id,
            "is_enrolled": self.speaker_profile is not None,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SpeakerProfileModel(Base):
    """
    Persisted biometric speaker profile storing reference embedding.
    Never stores raw audio.
    """
    __tablename__ = "speaker_profiles"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    protected_identity_id = Column(String(64), ForeignKey("protected_identities.id", ondelete="CASCADE"), nullable=True)
    speaker_id = Column(String(128), unique=True, nullable=False, index=True)
    embedding_dim = Column(Integer, default=192, nullable=False)
    sample_count = Column(Integer, default=1, nullable=False)
    # Stored as serialized JSON list of floats
    embedding_vector_json = Column(Text, nullable=False)
    # Quality metrics, VAD ratios, consistency score
    metadata_json = Column(Text, default="{}", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    protected_identity = relationship("ProtectedIdentity", back_populates="speaker_profile")

    def to_safe_dict(self) -> Dict[str, Any]:
        """Convert to dict redacting raw biometric vector."""
        meta = {}
        try:
            meta = json.loads(self.metadata_json)
        except Exception:
            pass
        return {
            "speaker_id": self.speaker_id,
            "embedding_dim": self.embedding_dim,
            "sample_count": self.sample_count,
            "metadata": meta,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ---------------------------------------------------------------------------
# Call Sessions & Risk Events
# ---------------------------------------------------------------------------

class CallSession(Base):
    """Live or completed call session."""
    __tablename__ = "call_sessions"

    session_id = Column(String(128), primary_key=True)
    org_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    caller_number = Column(String(64), nullable=True)
    caller_name = Column(String(255), nullable=True)
    claimed_identity_id = Column(String(64), ForeignKey("protected_identities.id", ondelete="SET NULL"), nullable=True)
    claimed_speaker_id = Column(String(128), nullable=True)

    # Status: ACTIVE | ENDED | TERMINATED_BY_SECURITY
    status = Column(String(32), default="ACTIVE", nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)

    # Telemetry and running evaluation
    total_chunks = Column(Integer, default=0, nullable=False)
    total_speech_seconds = Column(Float, default=0.0, nullable=False)
    current_risk_score = Column(Float, default=0.0, nullable=False)
    current_risk_level = Column(String(32), default="SAFE", nullable=False)  # SAFE, LOW, MEDIUM, HIGH, CRITICAL
    final_verdict = Column(String(32), default="inconclusive", nullable=False)  # genuine, cloned, imposter, inconclusive
    alert_triggered = Column(Boolean, default=False, nullable=False)
    alert_reason = Column(Text, nullable=True)
    accumulated_transcript = Column(Text, default="", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    organization = relationship("Organization", back_populates="call_sessions")
    user = relationship("User", back_populates="call_sessions")
    claimed_identity = relationship("ProtectedIdentity")
    risk_events = relationship("RiskEvent", back_populates="call_session", cascade="all, delete-orphan", order_by="RiskEvent.chunk_id")
    incidents = relationship("SecurityIncident", back_populates="call_session", cascade="all, delete-orphan")
    actions = relationship("SecurityAction", back_populates="call_session", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "org_id": self.org_id,
            "user_id": self.user_id,
            "caller_number": self.caller_number,
            "caller_name": self.caller_name,
            "claimed_speaker_id": self.claimed_speaker_id,
            "status": self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "total_chunks": self.total_chunks,
            "total_speech_seconds": self.total_speech_seconds,
            "current_risk_score": self.current_risk_score,
            "current_risk_level": self.current_risk_level,
            "final_verdict": self.final_verdict,
            "alert_triggered": self.alert_triggered,
            "alert_reason": self.alert_reason,
            "accumulated_transcript": self.accumulated_transcript,
        }


class RiskEvent(Base):
    """Fine-grained per-chunk telemetry event for analysis and playback."""
    __tablename__ = "risk_events"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    session_id = Column(String(128), ForeignKey("call_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_id = Column(Integer, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Acoustic and biometric signals from Member 1
    speech_detected = Column(Boolean, default=False, nullable=False)
    raw_synthetic_prob = Column(Float, nullable=True)
    smoothed_synthetic_prob = Column(Float, nullable=True)
    raw_speaker_sim = Column(Float, nullable=True)
    smoothed_speaker_sim = Column(Float, nullable=True)
    speaker_match = Column(Boolean, nullable=True)

    # Dialogue & Context
    transcript_chunk = Column(Text, default="", nullable=False)
    intent = Column(String(64), default="NORMAL_CONVERSATION", nullable=False)
    intent_confidence = Column(Float, default=0.0, nullable=False)

    # Security syntheses
    verdict = Column(String(32), default="inconclusive", nullable=False)
    risk_score = Column(Float, default=0.0, nullable=False)
    risk_level = Column(String(32), default="SAFE", nullable=False)
    recommended_action = Column(String(64), default="ALLOW", nullable=False)
    is_alert = Column(Boolean, default=False, nullable=False)
    alert_reason = Column(Text, nullable=True)

    latency_ms = Column(Float, default=0.0, nullable=False)
    stage_timings_json = Column(Text, default="{}", nullable=False)

    call_session = relationship("CallSession", back_populates="risk_events")

    __table_args__ = (
        Index("idx_session_chunk", "session_id", "chunk_id"),
    )

    def to_dict(self) -> Dict[str, Any]:
        timings = {}
        try:
            timings = json.loads(self.stage_timings_json)
        except Exception:
            pass
        return {
            "id": self.id,
            "session_id": self.session_id,
            "chunk_id": self.chunk_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "speech_detected": self.speech_detected,
            "synthetic_probability": self.raw_synthetic_prob,
            "smoothed_synthetic_probability": self.smoothed_synthetic_prob,
            "speaker_similarity": self.raw_speaker_sim,
            "smoothed_speaker_similarity": self.smoothed_speaker_sim,
            "speaker_match": self.speaker_match,
            "transcript": self.transcript_chunk,
            "intent": self.intent,
            "intent_confidence": self.intent_confidence,
            "verdict": self.verdict,
            "risk_score": self.risk_score,
            "risk_level": self.risk_level,
            "recommended_action": self.recommended_action,
            "is_alert": self.is_alert,
            "alert_reason": self.alert_reason,
            "latency_ms": self.latency_ms,
            "stage_timings_ms": timings,
        }


# ---------------------------------------------------------------------------
# Security Incidents & Operator Actions
# ---------------------------------------------------------------------------

class SecurityIncident(Base):
    """
    Security incident created when risk reaches HIGH or CRITICAL.
    Session-aware: one active incident maintained per call session.
    """
    __tablename__ = "security_incidents"

    incident_id = Column(String(64), primary_key=True, default=generate_uuid)
    org_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(128), ForeignKey("call_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)

    # Classification
    severity = Column(String(32), default="HIGH", nullable=False, index=True)  # HIGH, CRITICAL
    scenario = Column(String(64), nullable=False)  # AI_CLONE_ENROLLED_SPEAKER, UNKNOWN_AI_VOICE, etc.
    claimed_identity = Column(String(255), nullable=True)

    # Key forensic snapshots at time of incident
    current_risk_score = Column(Float, default=0.0, nullable=False)
    synthetic_probability = Column(Float, nullable=True)
    speaker_similarity = Column(Float, nullable=True)
    identity_status = Column(String(64), nullable=True)
    intent = Column(String(64), nullable=True)
    context_signals_json = Column(Text, default="[]", nullable=False)
    reasons_json = Column(Text, default="[]", nullable=False)
    recommended_action = Column(String(64), nullable=False)

    # Status: OPEN | UNDER_REVIEW | CONFIRMED_ATTACK | FALSE_POSITIVE | RESOLVED
    status = Column(String(32), default="OPEN", nullable=False, index=True)

    operator_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    operator_notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="incidents")
    call_session = relationship("CallSession", back_populates="incidents")
    operator = relationship("User")
    actions = relationship("SecurityAction", back_populates="incident", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        reasons = []
        signals = []
        try:
            reasons = json.loads(self.reasons_json)
        except Exception:
            pass
        try:
            signals = json.loads(self.context_signals_json)
        except Exception:
            pass

        return {
            "incident_id": self.incident_id,
            "org_id": self.org_id,
            "session_id": self.session_id,
            "severity": self.severity,
            "scenario": self.scenario,
            "claimed_identity": self.claimed_identity,
            "risk_score": self.current_risk_score,
            "synthetic_probability": self.synthetic_probability,
            "speaker_similarity": self.speaker_similarity,
            "identity_status": self.identity_status,
            "intent": self.intent,
            "context_signals": signals,
            "reasons": reasons,
            "recommended_action": self.recommended_action,
            "status": self.status,
            "operator_id": self.operator_id,
            "operator_notes": self.operator_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class SecurityAction(Base):
    """Simulated security response action executed by operator or automated policy."""
    __tablename__ = "security_actions"

    action_id = Column(String(64), primary_key=True, default=generate_uuid)
    incident_id = Column(String(64), ForeignKey("security_incidents.incident_id", ondelete="CASCADE"), nullable=True, index=True)
    session_id = Column(String(128), ForeignKey("call_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True)

    # Action type: CONFIRM_ATTACK | FALSE_POSITIVE | ESCALATE | RESOLVE | BLOCK_CALL | REQUIRE_ADDITIONAL_VERIFICATION | DISMISS
    action_type = Column(String(64), nullable=False)
    actor_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(32), default="COMPLETED", nullable=False)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    call_session = relationship("CallSession", back_populates="actions")
    incident = relationship("SecurityIncident", back_populates="actions")
    actor = relationship("User")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_id": self.action_id,
            "incident_id": self.incident_id,
            "session_id": self.session_id,
            "action_type": self.action_type,
            "actor_id": self.actor_id,
            "status": self.status,
            "notes": self.notes,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


# ---------------------------------------------------------------------------
# Audit Logs
# ---------------------------------------------------------------------------

class AuditLog(Base):
    """Immutable audit trail for security compliance and post-incident forensic reviews."""
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    org_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(String(64), nullable=True)
    session_id = Column(String(128), nullable=True, index=True)

    # Event types:
    # CALL_STARTED, RISK_CHANGED, HIGH_RISK_DETECTED, CRITICAL_RISK_DETECTED,
    # USER_ALERT_SENT, ORGANIZATION_ALERT_SENT, INCIDENT_CREATED, INCIDENT_REVIEWED,
    # ATTACK_CONFIRMED, FALSE_POSITIVE, SECURITY_ACTION_TAKEN, CALL_ENDED
    event_type = Column(String(64), nullable=False, index=True)
    ip_address = Column(String(64), nullable=True)
    details_json = Column(Text, default="{}", nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    organization = relationship("Organization", back_populates="audit_logs")

    def to_dict(self) -> Dict[str, Any]:
        details = {}
        try:
            details = json.loads(self.details_json)
        except Exception:
            pass
        return {
            "id": self.id,
            "org_id": self.org_id,
            "actor_id": self.actor_id,
            "session_id": self.session_id,
            "event_type": self.event_type,
            "ip_address": self.ip_address,
            "details": details,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


# ---------------------------------------------------------------------------
# Security Policy (Configurable per Organization)
# ---------------------------------------------------------------------------

class SecurityPolicy(Base):
    """Organization-specific security policy configuration."""
    __tablename__ = "security_policies"

    id = Column(String(64), primary_key=True, default=generate_uuid)
    org_id = Column(String(64), ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    policy_config_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="policies")

    def to_dict(self) -> Dict[str, Any]:
        config = {}
        try:
            config = json.loads(self.policy_config_json)
        except Exception:
            pass
        return {
            "id": self.id,
            "org_id": self.org_id,
            "policy_config": config,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
