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

    # Verify session exists in DB (strictly enforce real sessions, no simulation fallbacks)
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        log.warning("[WS:Stream] Session '%s' not found in DB; rejecting unverified connection.", session_id)
        await websocket.send_text(json.dumps({
            "event": WebSocketEventType.ERROR,
            "data": {"error": f"Call session '{session_id}' does not exist."},
        }))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    if call.status in ("ENDED", "TERMINATED", "TERMINATED_BY_SECURITY"):
        log.warning("[WS:Stream] Session '%s' has already ended (status=%s); rejecting connection.", session_id, call.status)
        await websocket.send_text(json.dumps({
            "event": WebSocketEventType.ERROR,
            "data": {"error": f"Call session '{session_id}' has already ended."},
        }))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    await dispatcher.register_call_socket(session_id, websocket)
    log.info("[WS:Stream] Active streaming connected for session '%s' (status=%s).", session_id, call.status)

    # If call session is already accepted/active, immediately notify connecting client
    if call.status == "ACTIVE":
        log.info("[WS:Stream] Session '%s' is ACTIVE; dispatching immediate CALL_ACCEPTED.", session_id)
        await websocket.send_text(json.dumps({
            "event": WebSocketEventType.CALL_ACCEPTED,
            "timestamp": utcnow().isoformat(),
            "data": call.to_dict(),
        }))
        if (call.total_chunks and call.total_chunks > 0) or call.accumulated_transcript:
            log.info("[WS:Stream] Session '%s' has running telemetry; dispatching RISK_UPDATE replay.", session_id)
            await websocket.send_text(json.dumps({
                "event": WebSocketEventType.RISK_UPDATE,
                "timestamp": utcnow().isoformat(),
                "data": {
                    "session_id": call.session_id,
                    "chunk_id": call.total_chunks or 0,
                    "risk_score": call.current_risk_score or 0.0,
                    "risk_level": call.current_risk_level or "SAFE",
                    "verdict": call.final_verdict or "inconclusive",
                    "speech_detected": True,
                    "transcript": call.accumulated_transcript or "",
                    "accumulated_transcript": call.accumulated_transcript or "",
                    "is_alert": call.alert_triggered or False,
                    "alert_reason": call.alert_reason or "",
                    "recommended_action": "BLOCK / VERIFY" if call.current_risk_level == "CRITICAL" else ("VERIFY" if call.current_risk_level == "HIGH" else "MONITOR"),
                },
            }))

    chunk_counter = 0

    try:
        while True:
            # Receive either binary audio bytes or JSON text
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                log.info("[WS:Stream] Clean disconnect received for session '%s'.", session_id)
                break

            if "bytes" in message and message["bytes"]:
                raw_data = message["bytes"]
                chunk_counter += 1
                chunk_idx = chunk_counter
                log.info("[STREAM] Session '%s' | Received binary audio chunk #%d (%d bytes)", session_id, chunk_idx, len(raw_data))
                # Forward raw audio chunk to recipient / listening call participants
                await dispatcher.send_binary_to_call(session_id, raw_data, exclude_socket=websocket)
            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    continue

                # Handle ping/heartbeat
                if payload.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
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

