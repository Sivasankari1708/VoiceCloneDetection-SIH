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

from backend.platform.db.models import CallSession, Organization, User
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

    # Verify session exists in DB
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        log.warning("[WS:Stream] Rejecting connection: session '%s' not found.", session_id)
        await websocket.send_text(
            json.dumps({
                "event": WebSocketEventType.ERROR,
                "data": {"error": f"Call session '{session_id}' not found. Start session via POST /api/calls/start first."},
            })
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

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
            else:
                continue

            # Process chunk through Member 1 pipeline and Security Orchestrator
            try:
                await orchestrator.process_stream_chunk(
                    session_id=session_id,
                    chunk_data=raw_data,
                    chunk_id=chunk_idx,
                )
            except Exception as exc:
                log.error("[WS:Stream] Error processing chunk %s for session %s: %s", chunk_idx, session_id, exc)
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
