"""
backend/platform/server/routes/websocket_stream.py
==================================================
Real-Time WebSocket streaming endpoints:
  1. /ws/stream/{session_id}          -> Live audio stream ingestion from caller browser mic
  2. /ws/org/{organization_id}/alerts -> High-priority real-time security alert feed for SOC console
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from backend.platform.db.models import AuditLog, CallSession, Organization, SecurityIncident, User, utcnow
from backend.platform.db.session import SessionLocal
from backend.platform.schemas.events import WebSocketEventType
from backend.platform.services.alert_dispatcher import AlertDispatcher
from backend.platform.services.auth_service import decode_access_token
from backend.platform.services.orchestrator import SecurityOrchestrator
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter(tags=["Real-Time WebSockets"])


# ─────────────────────────────────────────────────────────────────────────────
# 1. Live Audio Call Streaming WebSocket
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/stream/{session_id}")
async def websocket_audio_stream(websocket: WebSocket, session_id: str):
    """
    Ingests live audio chunks from the caller client (browser mic or streaming simulator).

    Protocol:
      - Client connects to /ws/stream/{session_id}
      - Client sends audio chunks:
          A. Raw binary bytes (16kHz mono PCM or WAV bytes)
          B. JSON text: {"chunk_id": int, "audio": "<base64_string>"}
      - Server responds with per-chunk RISK_UPDATE.
      - If risk reaches HIGH/CRITICAL, server immediately dispatches USER_SECURITY_ALERT
        and broadcasts ORGANIZATION_SECURITY_ALERT to the organization's SOC feed.
    """
    await websocket.accept()

    db: Session = SessionLocal()
    dispatcher = AlertDispatcher.get_instance()
    orchestrator = SecurityOrchestrator(db=db)

    # Verify session exists in DB, or auto-provision for simulator/standalone stream
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        log.info("[WS:Stream] Session '%s' not found in DB; auto-provisioning call session...", session_id)
        demo_user = db.query(User).filter_by(is_active=True).first()
        org_id = demo_user.org_id if demo_user else "org_demo_001"
        user_id = demo_user.id if demo_user else "user_employee_001"
        call = orchestrator.start_call_session(
            org_id=org_id,
            session_id=session_id,
            user_id=user_id,
            caller_name="Live Simulator Audio Stream",
            caller_number="+1-800-VOICESHIELD",
            claimed_speaker_id="LA_0069",
        )

    await dispatcher.register_call_socket(session_id, websocket)
    log.info("[WS:Stream] Active streaming connected for session '%s'.", session_id)

    chunk_counter = 0

    try:
        while True:
            # Receive either binary audio bytes or JSON text
            message = await websocket.receive()
            if "bytes" in message and message["bytes"]:
                raw_data = message["bytes"]
                chunk_counter += 1
                chunk_idx = chunk_counter
                log.info("[STREAM] Session '%s' | Received binary audio chunk #%d (%d bytes)", session_id, chunk_idx, len(raw_data))
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    continue

                # Handle ping/heartbeat
                if payload.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue

                # Handle simulated attack scenario risk events from User Frontend
                if payload.get("type") == "SCENARIO_RISK_UPDATE":
                    risk_data = payload.get("data", payload)
                    scenario = risk_data.get("scenario", "attack_simulation")
                    risk_score = float(risk_data.get("risk_score", 0.0))
                    risk_level = risk_data.get("risk_level", "CRITICAL" if risk_score >= 80 else "HIGH" if risk_score >= 60 else "MEDIUM")
                    claimed_identity = risk_data.get("claimed_identity") or call.caller_name or call.claimed_speaker_id or "Unknown Caller"
                    intent = risk_data.get("intent", "Coercive Impersonation / Social Engineering")
                    synthetic_prob = float(risk_data.get("synthetic_probability", 0.92))
                    speaker_sim = float(risk_data.get("speaker_similarity", 0.85))
                    reasons = risk_data.get("reasons", ["Synthetic voice characteristics detected", "Coercive social engineering pattern"])
                    signals = risk_data.get("signals", [])

                    call.current_risk_score = max(call.current_risk_score or 0.0, risk_score)
                    call.current_risk_level = risk_level
                    db.commit()

                    log.info("[STREAM:ScenarioRisk] Session '%s' | Risk=%.1f (%s) | Caller: %s", session_id, risk_score, risk_level, claimed_identity)

                    # Flag high risks to organization SOC console!
                    if risk_score >= 65:
                        existing_inc = db.query(SecurityIncident).filter_by(
                            session_id=session_id, org_id=call.org_id
                        ).first()

                        if existing_inc:
                            existing_inc.current_risk_score = max(existing_inc.current_risk_score, risk_score)
                            existing_inc.severity = risk_level
                            existing_inc.synthetic_probability = synthetic_prob
                            existing_inc.speaker_similarity = speaker_sim
                            existing_inc.intent = intent
                            existing_inc.reasons_json = json.dumps(reasons)
                            existing_inc.context_signals_json = json.dumps(signals)
                            existing_inc.recommended_action = "BLOCK_CALL" if risk_score >= 80 else "REQUIRE_ADDITIONAL_VERIFICATION"
                            existing_inc.updated_at = utcnow()
                            active_incident = existing_inc
                        else:
                            active_incident = SecurityIncident(
                                org_id=call.org_id,
                                session_id=session_id,
                                severity=risk_level,
                                scenario=scenario,
                                claimed_identity=claimed_identity,
                                current_risk_score=risk_score,
                                synthetic_probability=synthetic_prob,
                                speaker_similarity=speaker_sim,
                                identity_status="MISMATCHED" if speaker_sim < 0.6 else "MATCHED",
                                intent=intent,
                                context_signals_json=json.dumps(signals),
                                reasons_json=json.dumps(reasons),
                                recommended_action="BLOCK_CALL" if risk_score >= 80 else "REQUIRE_ADDITIONAL_VERIFICATION",
                                status="OPEN",
                            )
                            db.add(active_incident)

                            audit = AuditLog(
                                org_id=call.org_id,
                                session_id=session_id,
                                event_type="INCIDENT_CREATED",
                                details_json=json.dumps({
                                    "incident_id": active_incident.incident_id,
                                    "severity": active_incident.severity,
                                    "scenario": active_incident.scenario,
                                    "risk_score": active_incident.current_risk_score,
                                    "source": "SIMULATOR_SCENARIO",
                                }),
                            )
                            db.add(audit)

                        db.commit()

                        # Dispatch real-time ORGANIZATION_SECURITY_ALERT to SOC console!
                        org_alert_data = {
                            "incident_id": active_incident.incident_id,
                            "org_id": call.org_id,
                            "session_id": session_id,
                            "severity": active_incident.severity,
                            "scenario": active_incident.scenario,
                            "risk_score": active_incident.current_risk_score,
                            "claimed_identity": active_incident.claimed_identity,
                            "synthetic_probability": active_incident.synthetic_probability,
                            "speaker_similarity": active_incident.speaker_similarity,
                            "intent": active_incident.intent,
                            "reasons": json.loads(active_incident.reasons_json) if active_incident.reasons_json else [],
                            "recommended_action": active_incident.recommended_action,
                            "timestamp": utcnow().isoformat(),
                        }
                        await dispatcher.send_to_org(
                            call.org_id,
                            {
                                "event": WebSocketEventType.ORGANIZATION_SECURITY_ALERT,
                                "timestamp": utcnow().isoformat(),
                                "data": org_alert_data,
                            },
                        )
                        log.warning("[STREAM] Flagged HIGH RISK incident '%s' to SOC console for org '%s' (Score=%.1f)", active_incident.incident_id, call.org_id, risk_score)

                    continue

                chunk_idx = payload.get("chunk_id", chunk_counter + 1)
                chunk_counter = max(chunk_counter, chunk_idx)
                raw_data = payload.get("audio", "")
                log.info("[STREAM] Session '%s' | Received JSON audio chunk #%d", session_id, chunk_idx)
            else:
                continue

            # Process chunk through Member 1 pipeline and Security Orchestrator
            try:
                log.info("[STREAM] Processing chunk #%d through ML pipeline...", chunk_idx)
                await orchestrator.process_stream_chunk(
                    session_id=session_id,
                    chunk_data=raw_data,
                    chunk_id=chunk_idx,
                )
                log.info("[STREAM] Chunk #%d processed successfully & RISK_UPDATE dispatched", chunk_idx)
            except Exception as exc:
                log.error("[STREAM] Error processing chunk %s for session %s: %s", chunk_idx, session_id, exc)
                await websocket.send_text(
                    json.dumps({
                        "event": WebSocketEventType.ERROR,
                        "data": {"chunk_id": chunk_idx, "error": str(exc)},
                    })
                )

    except WebSocketDisconnect:
        log.info("[WS:Stream] Client disconnected from session '%s'.", session_id)
    except Exception as exc:
        log.error("[WS:Stream] Unexpected error in session '%s': %s", session_id, exc)
    finally:
        await dispatcher.unregister_call_socket(session_id, websocket)
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Organization SOC Real-Time Alert Feed WebSocket
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/org/{organization_id}/alerts")
async def websocket_org_alerts(websocket: WebSocket, organization_id: str):
    """
    Subscribes a security operator console to real-time high-priority alerts
    and incident events strictly isolated to the specified organization.
    """
    await websocket.accept()

    db: Session = SessionLocal()
    dispatcher = AlertDispatcher.get_instance()

    # Verify organization exists
    org = db.query(Organization).filter_by(id=organization_id, is_active=True).first()
    if not org:
        log.warning("[WS:OrgAlerts] Rejecting connection: organization '%s' not found.", organization_id)
        await websocket.send_text(
            json.dumps({
                "event": WebSocketEventType.ERROR,
                "data": {"error": f"Organization '{organization_id}' not found."},
            })
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    await dispatcher.register_org_socket(organization_id, websocket)
    log.info("[WS:OrgAlerts] Operator console connected for org '%s'.", organization_id)

    try:
        while True:
            # Keep-alive loop listening for client pings
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        log.info("[WS:OrgAlerts] Operator console disconnected from org '%s'.", organization_id)
    finally:
        await dispatcher.unregister_org_socket(organization_id, websocket)
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# 3. User-Scoped Notification Feed WebSocket (Incoming Calls & Personal Alerts)
# ─────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/user/{user_id}")
async def websocket_user_feed(websocket: WebSocket, user_id: str):
    """
    Subscribes an authenticated user's client to real-time personal events,
    such as INCOMING_CALL and CALL_ENDED notifications.
    Strictly isolated per user_id.
    """
    await websocket.accept()

    db: Session = SessionLocal()
    dispatcher = AlertDispatcher.get_instance()

    # Verify user exists and is active (lookup by ID or username)
    user = db.query(User).filter(
        (User.id == user_id) | (User.username == user_id),
        User.is_active == True,
    ).first()
    if not user:
        log.warning("[WS:UserFeed] Rejecting connection: user '%s' not found.", user_id)
        await websocket.send_text(
            json.dumps({
                "event": WebSocketEventType.ERROR,
                "data": {"error": f"User '{user_id}' not found."},
            })
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    effective_user_id = user.id
    await dispatcher.register_user_socket(effective_user_id, websocket)
    log.info("[WS:UserFeed] User client connected for '%s' (%s).", user.username, effective_user_id)

    try:
        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        log.info("[WS:UserFeed] User client disconnected for '%s'.", effective_user_id)
    finally:
        await dispatcher.unregister_user_socket(effective_user_id, websocket)
        db.close()

