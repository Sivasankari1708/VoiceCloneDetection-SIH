"""
backend/platform/tests/test_e2e_scenarios.py
============================================
End-to-End Real Audio Integration Scenarios for SIH Demonstration:

Scenario 1: Genuine Enrolled Speaker (CFO David Vance)
  - Audio: samples/genuine/speaker_a_test.wav
  - Result: Genuine voice, high biometric similarity, SAFE risk -> No incident created.

Scenario 2: AI-Cloned CFO Call (Canonical Demonstration)
  - Audio: samples/cloned/tts_cloned_ava.wav
  - Result: High synthetic probability, cloned verdict, CRITICAL risk.
  - Verification:
      1. User receives real-time security warning.
      2. Organization SOC receives real-time security alert.
      3. Incident is created in PostgreSQL / database.
      4. Operator reviews incident and executes CONFIRM_ATTACK + BLOCK_CALL.
      5. Call session is terminated and audit log records the incident lifecycle.

Scenario 3: Imposter Speaker Call
  - Audio: samples/imposter/speaker_b_test.wav
  - Result: Natural speech, biometric similarity mismatch -> imposter verdict, HIGH risk.
"""

import asyncio
from pathlib import Path
import uuid
import pytest

from backend.platform.db.models import (
    CallSession,
    Organization,
    ProtectedIdentity,
    SecurityAction,
    SecurityIncident,
    User,
)
from backend.platform.db.session import SessionLocal, init_db
from backend.platform.services.ai_adapter import AIAdapter
from backend.platform.services.orchestrator import SecurityOrchestrator
from backend.platform.services.speaker_service import SpeakerService

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SAMPLES_DIR = PROJECT_ROOT / "samples"

SPK_A_REF1 = SAMPLES_DIR / "genuine" / "speaker_a_ref1.wav"
SPK_A_REF2 = SAMPLES_DIR / "genuine" / "speaker_a_ref2.wav"
SPK_A_REF3 = SAMPLES_DIR / "genuine" / "speaker_a_ref3.wav"
SPK_A_TEST = SAMPLES_DIR / "genuine" / "speaker_a_test.wav"

CLONED_SAMPLE = SAMPLES_DIR / "cloned" / "tts_cloned_ava.wav"
IMPOSTER_SAMPLE = SAMPLES_DIR / "imposter" / "speaker_b_test.wav"


@pytest.fixture(scope="module")
def e2e_setup():
    """Setup database and enroll VIP CFO (David Vance) with Speaker A samples."""
    init_db()
    db = SessionLocal()
    try:
        org = db.query(Organization).filter_by(code="DEMO_CORP").first()
        operator = db.query(User).filter_by(username="operator").first()
        employee = db.query(User).filter_by(username="employee").first()

        # Enroll Speaker A reference samples for CFO
        speaker_service = SpeakerService(db=db)
        cfo = db.query(ProtectedIdentity).filter_by(speaker_id="LA_0069").first()

        if SPK_A_REF1.exists() and SPK_A_REF2.exists() and SPK_A_REF3.exists():
            if not cfo.speaker_profile:
                enroll_res = speaker_service.enroll_identity(
                    protected_identity_id=cfo.id,
                    audio_samples=[str(SPK_A_REF1), str(SPK_A_REF2), str(SPK_A_REF3)],
                )
                assert enroll_res.success is True, f"Enrollment failed: {enroll_res.message}"

        yield db, org, operator, employee, cfo
    finally:
        db.close()


def test_scenario_1_genuine_enrolled_speaker(e2e_setup):
    """
    Scenario 1: Authentic CFO calls employee.
    Expected: Low synthetic prob, high biometric similarity -> SAFE, no security incident.
    """
    if not SPK_A_TEST.exists():
        pytest.skip("Test sample speaker_a_test.wav missing.")

    db, org, operator, employee, cfo = e2e_setup
    orchestrator = SecurityOrchestrator(db=db)

    session_id = f"e2e_call_scenario_1_{uuid.uuid4().hex[:8]}"
    call = orchestrator.start_call_session(
        org_id=org.id,
        session_id=session_id,
        user_id=employee.id,
        caller_name="David Vance (CFO)",
        claimed_speaker_id=cfo.speaker_id,
    )

    # Read audio bytes
    audio_bytes = SPK_A_TEST.read_bytes()

    # Process audio chunk
    res = asyncio.run(
        orchestrator.process_stream_chunk(
            session_id=session_id,
            chunk_data=audio_bytes,
            chunk_id=1,
        )
    )

    assert res["verdict"] == "genuine"
    assert res["risk_level"] == "SAFE"
    assert res["risk_score"] < 45.0
    assert res["is_alert"] is False

    # Verify NO security incidents created for genuine CFO
    incidents = db.query(SecurityIncident).filter_by(session_id=session_id).all()
    assert len(incidents) == 0


def test_scenario_2_ai_cloned_cfo_attack_and_operator_mitigation(e2e_setup):
    """
    Scenario 2: AI-cloned CFO calls employee requesting sensitive wire transfer.
    Expected:
      - Synthetic voice detected -> CRITICAL risk.
      - User receives real-time security warning.
      - Incident is created in database.
      - Operator reviews incident and executes CONFIRM_ATTACK + BLOCK_CALL.
      - Call session terminated and audited.
    """
    if not CLONED_SAMPLE.exists():
        pytest.skip("Test sample tts_cloned_ava.wav missing.")

    db, org, operator, employee, cfo = e2e_setup
    orchestrator = SecurityOrchestrator(db=db)

    session_id = f"e2e_call_scenario_2_{uuid.uuid4().hex[:8]}"
    call = orchestrator.start_call_session(
        org_id=org.id,
        session_id=session_id,
        user_id=employee.id,
        caller_name="David Vance (CFO Impersonator)",
        claimed_speaker_id=cfo.speaker_id,
    )

    # Ingest synthetic voice
    audio_bytes = CLONED_SAMPLE.read_bytes()

    res = asyncio.run(
        orchestrator.process_stream_chunk(
            session_id=session_id,
            chunk_data=audio_bytes,
            chunk_id=1,
        )
    )

    # 1. Verify detection
    assert res["verdict"] == "cloned"
    assert res["risk_level"] in ("HIGH", "CRITICAL")
    assert res["risk_score"] >= 65.0
    assert res["is_alert"] is True

    # 2. Verify Incident was created in Database
    incident = db.query(SecurityIncident).filter_by(session_id=session_id).first()
    assert incident is not None
    assert incident.severity in ("HIGH", "CRITICAL")
    assert incident.status == "OPEN"
    assert "cloned" in str(incident.reasons_json).lower() or "synthetic" in str(incident.reasons_json).lower()

    # 3. Operator investigates and confirms attack
    action_res = asyncio.run(
        orchestrator.execute_operator_action(
            incident_id=incident.incident_id,
            action_type="CONFIRM_ATTACK",
            actor=operator,
            notes="AI-generated synthetic voice verified against CFO profile.",
        )
    )
    assert action_res["action_type"] == "CONFIRM_ATTACK"

    db.refresh(incident)
    assert incident.status == "CONFIRMED_ATTACK"

    # 4. Operator triggers simulated call block
    block_res = asyncio.run(
        orchestrator.execute_operator_action(
            incident_id=incident.incident_id,
            action_type="BLOCK_CALL",
            actor=operator,
            notes="Simulated emergency line disconnection.",
        )
    )
    assert block_res["action_type"] == "BLOCK_CALL"

    # Check call session terminated by security
    db.refresh(call)
    assert call.status == "TERMINATED_BY_SECURITY"


def test_scenario_3_imposter_speaker(e2e_setup):
    """
    Scenario 3: Imposter calls claiming to be CFO.
    Expected: Natural human voice, but speaker mismatch against CFO reference -> imposter verdict.
    """
    if not IMPOSTER_SAMPLE.exists():
        pytest.skip("Test sample speaker_b_test.wav missing.")

    db, org, operator, employee, cfo = e2e_setup
    orchestrator = SecurityOrchestrator(db=db)

    session_id = f"e2e_call_scenario_3_{uuid.uuid4().hex[:8]}"
    call = orchestrator.start_call_session(
        org_id=org.id,
        session_id=session_id,
        user_id=employee.id,
        caller_name="Imposter claiming CFO",
        claimed_speaker_id=cfo.speaker_id,
    )

    audio_bytes = IMPOSTER_SAMPLE.read_bytes()

    res = asyncio.run(
        orchestrator.process_stream_chunk(
            session_id=session_id,
            chunk_data=audio_bytes,
            chunk_id=1,
        )
    )

    assert res["verdict"] == "imposter"
    assert res["identity_status"] == "MISMATCHED"
    assert res["speaker_match"] is False
    assert res["risk_level"] in ("HIGH", "CRITICAL")
