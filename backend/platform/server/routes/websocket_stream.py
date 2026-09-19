"""
backend/platform/server/routes/websocket_stream.py
==================================================
Real-Time WebSocket streaming endpoints:
  1. /ws/stream/{session_id}          -> Live audio stream ingestion from caller browser mic
  2. /ws/org/{organization_id}/alerts -> High-priority real-time security alert feed for SOC console
"""

from __future__ import annotations

import asyncio
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
        try:
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
                        "is_final": True,
                        "is_alert": call.alert_triggered or False,
                        "alert_reason": call.alert_reason or "",
                        "recommended_action": "BLOCK / VERIFY" if call.current_risk_level == "CRITICAL" else ("VERIFY" if call.current_risk_level == "HIGH" else "MONITOR"),
                    },
                }))
        except (WebSocketDisconnect, RuntimeError, Exception) as send_err:
            log.warning("[WS:Stream] Client disconnected during initial state replay for session '%s': %s", session_id, send_err)
            await dispatcher.unregister_call_socket(session_id, websocket)
            db.close()
            return

    chunk_counter = 0

    # Dedicated background ML queue and worker task per streaming session:
    # Completely decouples real-time audio forwarding and transcript broadcasting (< 1ms)
    # from heavy ML inference and ASR processing (which runs concurrently in worker thread).
    ml_queue: asyncio.Queue = asyncio.Queue(maxsize=4)
    worker_db: Session = SessionLocal()
    worker_orchestrator = SecurityOrchestrator(db=worker_db)

    async def ml_worker_loop():
        while True:
            try:
                item = await ml_queue.get()
                if item is None:
                    break
                c_idx, c_raw = item
                try:
                    await worker_orchestrator.process_stream_chunk(
                        session_id=session_id,
                        chunk_data=c_raw,
                        chunk_id=c_idx,
                    )
                except Exception as exc:
                    log.error("[STREAM:ML] Error processing chunk %s for session %s: %s", c_idx, session_id, exc)
                finally:
                    ml_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.error("[STREAM:ML] Unexpected worker exception: %s", e)

    ml_worker_task = asyncio.create_task(ml_worker_loop())

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
                # 1. IMMEDIATELY forward raw audio chunk to recipient / listening call participants (< 1ms)
                await dispatcher.send_binary_to_call(session_id, raw_data, exclude_socket=websocket)

                # 2. Queue chunk for background ML processing without blocking the receive loop
                if ml_queue.full():
                    try:
                        _ = ml_queue.get_nowait()
                        ml_queue.task_done()
                    except (asyncio.QueueEmpty, ValueError):
                        pass
                try:
                    ml_queue.put_nowait((chunk_idx, raw_data))
                except asyncio.QueueFull:
                    pass

            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    continue

                # Handle ping/heartbeat
                if payload.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue

                # Handle client-side Google Speech recognition stream
                if payload.get("type") == "client_transcript":
                    tr_text = payload.get("text", "").strip()
                    is_final = bool(payload.get("is_final", False))
                    speaker = payload.get("speaker", "caller")
                    SecurityOrchestrator.mark_client_transcript_active(session_id)
                    if tr_text:
                        call = db.query(CallSession).filter_by(session_id=session_id).first()
                        if call:
                            if not call.accumulated_transcript:
                                call.accumulated_transcript = tr_text
                            elif is_final and tr_text not in call.accumulated_transcript:
                                call.accumulated_transcript = f"{call.accumulated_transcript} {tr_text}".strip()
                            db.commit()

                            # If caller, check for identity claims
                            if speaker == "caller" and not call.claimed_speaker_id:
                                from backend.intent.identity_claim_extractor import extract_identity_claim
                                claim_res = extract_identity_claim(call.accumulated_transcript, db)
                                if claim_res.has_claim:
                                    if claim_res.protected_identity:
                                        call.claimed_speaker_id = claim_res.protected_identity.speaker_id
                                        call.claimed_identity_id = claim_res.protected_identity.id
                                        call.caller_name = f"{claim_res.protected_identity.full_name} (Claimed)"
                                    elif claim_res.claimed_person:
                                        call.caller_name = f"{claim_res.claimed_person} (Claimed)"
                                    db.commit()

                            # Run ultra-fast intent detection on real-time speech (< 1ms)
                            try:
                                from backend.intent.intent_detector import IntentDetector, IntentType
                                detector = IntentDetector()
                                intent_res = detector.analyze(tr_text)
                                if intent_res.intent in (IntentType.OTP_REQUEST, IntentType.CREDENTIAL_REQUEST):
                                    call.current_risk_score = max(call.current_risk_score or 0.0, 92.0)
                                    call.current_risk_level = "CRITICAL"
                                    call.alert_triggered = True
                                    call.alert_reason = f"Urgent OTP/Credential request detected: '{tr_text[:60]}'"
                                elif intent_res.intent in (IntentType.PAYMENT_TRANSFER, IntentType.URGENT_REQUEST):
                                    call.current_risk_score = max(call.current_risk_score or 0.0, 78.0)
                                    call.current_risk_level = "HIGH"
                                    call.alert_triggered = True
                                    call.alert_reason = f"Suspicious urgency/transfer request detected: '{tr_text[:60]}'"
                                db.commit()
                            except Exception as intent_err:
                                log.debug("[WS:Stream] Fast intent analysis note: %s", intent_err)

                        update_payload = {
                            "session_id": session_id,
                            "chunk_id": chunk_counter,
                            "transcript": tr_text,
                            "accumulated_transcript": call.accumulated_transcript if call else tr_text,
                            "is_final": is_final,
                            "speaker": speaker,
                            "speech_detected": True,
                            "verdict": call.final_verdict if call else "genuine",
                            "risk_score": call.current_risk_score if call else 0.0,
                            "risk_level": call.current_risk_level if call else "SAFE",
                            "identity_status": "MATCHED" if (call and call.claimed_speaker_id) else "UNVERIFIED",
                            "recommended_action": "BLOCK / VERIFY" if (call and call.current_risk_level == "CRITICAL") else ("VERIFY" if (call and call.current_risk_level == "HIGH") else "MONITOR"),
                        }

                        # Dispatch transcript IMMEDIATELY to recipient and caller (< 2ms)
                        await dispatcher.send_to_call(
                            session_id,
                            {
                                "event": WebSocketEventType.RISK_UPDATE,
                                "timestamp": utcnow().isoformat(),
                                "data": update_payload,
                            },
                            exclude_socket=websocket,
                        )

                        # Dispatch to recipient user feed directly
                        if call and call.recipient_user_id:
                            await dispatcher.send_to_user(
                                call.recipient_user_id,
                                {
                                    "event": WebSocketEventType.RISK_UPDATE,
                                    "timestamp": utcnow().isoformat(),
                                    "data": update_payload,
                                },
                            )
                    continue

                chunk_idx = payload.get("chunk_id", chunk_counter + 1)
                chunk_counter = max(chunk_counter, chunk_idx)
                raw_data = payload.get("audio", "")
                log.info("[STREAM] Session '%s' | Received JSON audio chunk #%d", session_id, chunk_idx)
                if ml_queue.full():
                    try:
                        _ = ml_queue.get_nowait()
                        ml_queue.task_done()
                    except (asyncio.QueueEmpty, ValueError):
                        pass
                try:
                    ml_queue.put_nowait((chunk_idx, raw_data))
                except asyncio.QueueFull:
                    pass
            else:
                continue

    except WebSocketDisconnect:
        log.info("[WS:Stream] Client disconnected from session '%s'.", session_id)
    except Exception as exc:
        log.error("[WS:Stream] Unexpected error in session '%s': %s", session_id, exc)
    finally:
        ml_worker_task.cancel()
        try:
            await ml_worker_task
        except asyncio.CancelledError:
            pass
        worker_db.close()
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

    # Only replay if an authoritative call was initiated very recently (< 20 seconds ago)
    recent_cutoff = utcnow().timestamp() - 20.0
    pending_call = db.query(CallSession).filter(
        CallSession.recipient_user_id == effective_user_id,
        CallSession.status == "RINGING",
    ).order_by(CallSession.start_time.desc()).first()

    if pending_call:
        if pending_call.start_time and pending_call.start_time.timestamp() >= recent_cutoff:
            log.info("[WS:UserFeed] Replaying fresh pending RINGING call '%s' to user '%s'.", pending_call.session_id, user.username)
            try:
                await websocket.send_text(json.dumps({
                    "event": WebSocketEventType.INCOMING_CALL,
                    "timestamp": utcnow().isoformat(),
                    "data": pending_call.to_dict(),
                }))
            except Exception as e:
                log.warning("[WS:UserFeed] Failed to replay incoming call: %s", e)
        else:
            # Expire stale ringing session
            pending_call.status = "REJECTED"
            pending_call.end_time = utcnow()
            db.commit()

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

