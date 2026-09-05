"""
backend/platform/tests/test_orchestrator.py
===========================================
Tests for SecurityOrchestrator, Incident deduplication, and Operator actions.
"""

import asyncio
import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.pipeline.risk_engine import RiskDecision
from backend.platform.db.models import (
    CallSession,
    Organization,
    ProtectedIdentity,
    SecurityAction,
    SecurityIncident,
    User,
)
from backend.platform.db.session import Base
from backend.platform.services.ai_adapter import ProcessedChunkTelemetry
from backend.platform.services.orchestrator import SecurityOrchestrator
from backend.platform.services.policy_engine import PolicyEngine


@pytest.fixture
def orch_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()
    try:
        org = Organization(id="org_test_1", name="Test Org", code="TEST_ORG")
        db.add(org)
        db.flush()

        operator = User(
            id="op_1",
            org_id=org.id,
            username="sec_op",
            email="op@test.com",
            hashed_password="hash",
            full_name="SOC Analyst",
            role="SECURITY_OPERATOR",
        )
        cfo = ProtectedIdentity(
            id="vip_1",
            org_id=org.id,
            full_name="Jane CFO",
            title="Chief Financial Officer",
            speaker_id="cfo_speaker_id",
            risk_priority="CRITICAL",
        )
        db.add_all([operator, cfo])
        db.commit()
        yield db, org, operator, cfo
    finally:
        db.close()


def test_start_and_end_call_lifecycle(orch_db):
    db, org, operator, cfo = orch_db
    orchestrator = SecurityOrchestrator(db=db)

    # 1. Start call
    call = orchestrator.start_call_session(
        org_id=org.id,
        session_id="call_lifecycle_test",
        caller_number="+1-555-1234",
        caller_name="Suspect Caller",
        claimed_speaker_id="cfo_speaker_id",
    )
    assert call.session_id == "call_lifecycle_test"
    assert call.status == "ACTIVE"
    assert call.claimed_identity_id == cfo.id

    # 2. End call
    summary = asyncio.run(orchestrator.end_call_session("call_lifecycle_test", reason="NORMAL_HANGUP"))
    assert summary is not None
    assert summary.session_id == "call_lifecycle_test"

    updated_call = db.query(CallSession).filter_by(session_id="call_lifecycle_test").first()
    assert updated_call.status == "ENDED"
    assert updated_call.end_time is not None


def test_policy_engine_cfo_impersonation_escalation(orch_db):
    _, _, _, cfo = orch_db
    policy_engine = PolicyEngine()

    dummy_risk = RiskDecision(
        risk_score=90.0,
        risk_level="CRITICAL",
        reasons=["High acoustic synthetic presence"],
        recommended_action="BLOCK_OR_ESCALATE",
        scenario="AI_CLONE_ENROLLED_SPEAKER",
    )

    telemetry = ProcessedChunkTelemetry(
        session_id="call_cfo_spoof",
        chunk_id=1,
        timestamp="2026-09-05T00:00:00Z",
        speech_detected=True,
        raw_synthetic_prob=0.95,
        smoothed_synthetic_prob=0.95,
        raw_speaker_sim=0.88,
        smoothed_speaker_sim=0.88,
        speaker_match=True,
        identity_status="MATCHED",
        transcript="Please authorize the wire transfer immediately.",
        accumulated_transcript="Please authorize the wire transfer immediately.",
        intent="PAYMENT_TRANSFER",
        intent_confidence=0.85,
        context_signals=["transfer", "wire"],
        verdict="cloned",
        is_alert=True,
        alert_reason="CRITICAL synthetic voice detected",
        latency_ms=120.0,
        real_time_factor=0.12,
        stage_timings_ms={},
        risk_decision=dummy_risk,
    )

    result = policy_engine.evaluate(telemetry, protected_identity=cfo)

    assert result.risk_level == "CRITICAL"
    assert result.risk_score >= 95.0
    assert result.should_warn_user is True
    assert result.should_alert_org is True
    assert result.should_create_incident is True
    assert any("Chief Financial Officer" in r for r in result.reasons)


def test_incident_creation_and_deduplication(orch_db, monkeypatch):
    db, org, operator, cfo = orch_db
    orchestrator = SecurityOrchestrator(db=db)

    # Start session
    call = orchestrator.start_call_session(
        org_id=org.id,
        session_id="dedup_call_test",
        claimed_speaker_id=cfo.speaker_id,
    )

    # Mock ai_adapter.process_chunk to return synthetic voice
    dummy_decision = RiskDecision(
        risk_score=90.0,
        risk_level="CRITICAL",
        reasons=["High synthetic probability"],
        recommended_action="BLOCK_OR_ESCALATE",
        scenario="AI_CLONE_ENROLLED_SPEAKER",
    )

    def mock_process_chunk(session_id, chunk_data, chunk_id, claimed_speaker_id):
        return ProcessedChunkTelemetry(
            session_id=session_id,
            chunk_id=chunk_id,
            timestamp="2026-09-05T00:00:00Z",
            speech_detected=True,
            raw_synthetic_prob=0.95,
            smoothed_synthetic_prob=0.95,
            raw_speaker_sim=0.85,
            smoothed_speaker_sim=0.85,
            speaker_match=True,
            identity_status="MATCHED",
            transcript="Send the OTP code now.",
            accumulated_transcript="Send the OTP code now.",
            intent="OTP_REQUEST",
            intent_confidence=0.90,
            context_signals=["otp"],
            verdict="cloned",
            is_alert=True,
            alert_reason="Fast alert synthetic voice",
            latency_ms=100.0,
            real_time_factor=0.1,
            stage_timings_ms={},
            risk_decision=dummy_decision,
        )

    monkeypatch.setattr(orchestrator.ai_adapter, "process_chunk", mock_process_chunk)

    dummy_chunk = np.zeros(16000, dtype=np.float32)

    # Chunk 1: Should create incident #1
    asyncio.run(orchestrator.process_stream_chunk("dedup_call_test", dummy_chunk, chunk_id=1))
    incidents = db.query(SecurityIncident).filter_by(session_id="dedup_call_test").all()
    assert len(incidents) == 1
    inc = incidents[0]
    assert inc.severity == "CRITICAL"
    assert inc.status == "OPEN"

    # Chunk 2: Should NOT create incident #2, should UPDATE incident #1 (deduplication!)
    asyncio.run(orchestrator.process_stream_chunk("dedup_call_test", dummy_chunk, chunk_id=2))
    incidents_after = db.query(SecurityIncident).filter_by(session_id="dedup_call_test").all()
    assert len(incidents_after) == 1
    assert incidents_after[0].incident_id == inc.incident_id


def test_operator_action_execution(orch_db):
    db, org, operator, _ = orch_db
    orchestrator = SecurityOrchestrator(db=db)

    # Create dummy incident
    call = orchestrator.start_call_session(org_id=org.id, session_id="call_action_test")
    incident = SecurityIncident(
        org_id=org.id,
        session_id="call_action_test",
        severity="CRITICAL",
        scenario="AI_CLONE_ENROLLED_SPEAKER",
        recommended_action="BLOCK_OR_ESCALATE",
        status="OPEN",
    )
    db.add(incident)
    db.commit()

    # Operator confirms attack and blocks call
    action_dict = asyncio.run(
        orchestrator.execute_operator_action(
            incident_id=incident.incident_id,
            action_type="CONFIRM_ATTACK",
            actor=operator,
            notes="Confirmed AI voice clone targeting finance desk.",
        )
    )

    assert action_dict["action_type"] == "CONFIRM_ATTACK"
    assert action_dict["status"] == "COMPLETED"

    # Check incident status updated
    updated_inc = db.query(SecurityIncident).filter_by(incident_id=incident.incident_id).first()
    assert updated_inc.status == "CONFIRMED_ATTACK"
    assert "Confirmed AI voice clone" in updated_inc.operator_notes

    # Operator blocks call
    block_dict = asyncio.run(
        orchestrator.execute_operator_action(
            incident_id=incident.incident_id,
            action_type="BLOCK_CALL",
            actor=operator,
            notes="Simulated call termination.",
        )
    )
    assert block_dict["action_type"] == "BLOCK_CALL"

    # Check underlying call session terminated
    updated_call = db.query(CallSession).filter_by(session_id="call_action_test").first()
    assert updated_call.status == "TERMINATED_BY_SECURITY"
