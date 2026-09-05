"""
backend/platform/tests/test_websocket.py
========================================
Tests for real-time WebSocket streaming, user alerts, and organization SOC alerts.
"""

import json
import uuid
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.pipeline.risk_engine import RiskDecision
from backend.platform.db.models import CallSession, User
from backend.platform.db.session import SessionLocal, init_db
from backend.platform.schemas.events import WebSocketEventType
from backend.platform.server.app import app
from backend.platform.services.ai_adapter import AIAdapter, ProcessedChunkTelemetry
from backend.platform.services.auth_service import create_access_token


@pytest.fixture(scope="module")
def ws_client():
    init_db()
    with TestClient(app) as test_client:
        yield test_client


def test_websocket_stream_chunk_and_risk_update(ws_client, monkeypatch):
    session_id = f"ws_stream_test_{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username="employee").first()
        call = CallSession(
            session_id=session_id,
            org_id=user.org_id,
            user_id=user.id,
            status="ACTIVE",
            claimed_speaker_id="LA_0069",
        )
        db.add(call)
        db.commit()
    finally:
        db.close()

    # 2. Mock AIAdapter.process_chunk to return controlled response
    ai_adapter = AIAdapter.get_instance()

    def mock_process_chunk(session_id, chunk_data, chunk_id, claimed_speaker_id):
        decision = RiskDecision(
            risk_score=20.0,
            risk_level="SAFE",
            reasons=["Natural bona fide speech"],
            recommended_action="ALLOW",
            scenario="GENUINE_ENROLLED_SPEAKER",
        )
        return ProcessedChunkTelemetry(
            session_id=session_id,
            chunk_id=chunk_id,
            timestamp="2026-09-05T00:00:00Z",
            speech_detected=True,
            raw_synthetic_prob=0.01,
            smoothed_synthetic_prob=0.01,
            raw_speaker_sim=0.88,
            smoothed_speaker_sim=0.88,
            speaker_match=True,
            identity_status="MATCHED",
            transcript="Hello this is Alice from accounting.",
            accumulated_transcript="Hello this is Alice from accounting.",
            intent="NORMAL_CONVERSATION",
            intent_confidence=0.9,
            context_signals=[],
            verdict="genuine",
            is_alert=False,
            alert_reason=None,
            latency_ms=80.0,
            real_time_factor=0.08,
            stage_timings_ms={},
            risk_decision=decision,
        )

    monkeypatch.setattr(ai_adapter, "process_chunk", mock_process_chunk)

    # 3. Connect via WebSocket
    with ws_client.websocket_connect(f"/ws/stream/{session_id}") as ws:
        # Send raw 16kHz audio chunk (1 second = 32000 bytes int16)
        raw_pcm = np.zeros(16000, dtype=np.int16).tobytes()
        ws.send_bytes(raw_pcm)

        # Receive RISK_UPDATE message
        msg_text = ws.receive_text()
        msg = json.loads(msg_text)

        assert msg["event"] == WebSocketEventType.RISK_UPDATE
        data = msg["data"]
        assert data["session_id"] == session_id
        assert data["verdict"] == "genuine"
        assert data["risk_level"] == "SAFE"
        assert data["risk_score"] == 20.0
        assert data["transcript"] == "Hello this is Alice from accounting."


def test_websocket_dual_alert_on_critical_voice_clone(ws_client, monkeypatch):
    """
    Verify simultaneous dual alert:
    1. User receives USER_SECURITY_ALERT on call socket.
    2. Organization SOC receives ORGANIZATION_SECURITY_ALERT on org alert socket.
    """
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username="employee").first()
        org_id = user.org_id
        session_id = f"ws_critical_{uuid.uuid4().hex[:8]}"
        call = CallSession(
            session_id=session_id,
            org_id=org_id,
            user_id=user.id,
            status="ACTIVE",
            claimed_speaker_id="LA_0069",  # CFO speaker
        )
        db.add(call)
        db.commit()
    finally:
        db.close()

    ai_adapter = AIAdapter.get_instance()

    def mock_critical_chunk(session_id, chunk_data, chunk_id, claimed_speaker_id):
        decision = RiskDecision(
            risk_score=95.0,
            risk_level="CRITICAL",
            reasons=["High synthetic probability (0.96)", "Protected CFO voice clone"],
            recommended_action="BLOCK_OR_ESCALATE",
            scenario="AI_CLONE_ENROLLED_SPEAKER",
        )
        return ProcessedChunkTelemetry(
            session_id=session_id,
            chunk_id=chunk_id,
            timestamp="2026-09-05T00:00:00Z",
            speech_detected=True,
            raw_synthetic_prob=0.96,
            smoothed_synthetic_prob=0.96,
            raw_speaker_sim=0.88,
            smoothed_speaker_sim=0.88,
            speaker_match=True,
            identity_status="MATCHED",
            transcript="This is David Vance CFO, authorize wire transfer immediately.",
            accumulated_transcript="This is David Vance CFO, authorize wire transfer immediately.",
            intent="PAYMENT_TRANSFER",
            intent_confidence=0.95,
            context_signals=["wire", "transfer"],
            verdict="cloned",
            is_alert=True,
            alert_reason="CRITICAL synthetic voice detected (0.96 >= 0.85)",
            latency_ms=90.0,
            real_time_factor=0.09,
            stage_timings_ms={},
            risk_decision=decision,
        )

    monkeypatch.setattr(ai_adapter, "process_chunk", mock_critical_chunk)

    # Connect organization SOC alert feed
    with ws_client.websocket_connect(f"/ws/org/{org_id}/alerts") as org_ws:
        # Connect user call streaming socket
        with ws_client.websocket_connect(f"/ws/stream/{session_id}") as call_ws:
            # Send chunk
            call_ws.send_bytes(np.zeros(16000, dtype=np.int16).tobytes())

            # 1. User call socket should receive USER_SECURITY_ALERT
            user_msg = json.loads(call_ws.receive_text())
            assert user_msg["event"] == WebSocketEventType.USER_SECURITY_ALERT
            assert user_msg["data"]["severity"] == "CRITICAL"
            assert "WARNING" in user_msg["data"]["warning_message"]

            # User call socket should also receive RISK_UPDATE
            risk_msg = json.loads(call_ws.receive_text())
            assert risk_msg["event"] == WebSocketEventType.RISK_UPDATE
            assert risk_msg["data"]["verdict"] == "cloned"

            # 2. Organization SOC socket should receive ORGANIZATION_SECURITY_ALERT
            org_msg = json.loads(org_ws.receive_text())
            assert org_msg["event"] == WebSocketEventType.ORGANIZATION_SECURITY_ALERT
            assert org_msg["data"]["severity"] == "CRITICAL"
            assert org_msg["data"]["session_id"] == session_id
            assert org_msg["data"]["scenario"] == "AI_CLONE_ENROLLED_SPEAKER"
            assert org_msg["data"]["risk_score"] >= 95.0
