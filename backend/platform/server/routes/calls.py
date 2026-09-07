"""
backend/platform/server/routes/calls.py
======================================
Call Session orchestration and lifecycle endpoints.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.platform.db.models import AuditLog, CallSession, Organization, RiskEvent, SecurityIncident, User, utcnow
from backend.platform.db.session import get_db
from backend.platform.schemas.calls import (
    CallEndRequest,
    CallSessionDto,
    CallStartRequest,
    CallSummaryDto,
)
from backend.platform.schemas.events import WebSocketEventType
from backend.platform.server.dependencies import get_current_user, get_current_user_optional
from backend.platform.services.alert_dispatcher import AlertDispatcher
from backend.platform.services.orchestrator import SecurityOrchestrator
from backend.utils.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/api/calls", tags=["Call Sessions"])


def _resolve_call_user(user: Optional[User], db: Session) -> User:
    if user:
        return user
    demo_user = db.query(User).filter_by(is_active=True).first()
    if not demo_user:
        org = db.query(Organization).first()
        org_id = org.id if org else "org_demo_001"
        demo_user = User(
            id="user_employee_001",
            org_id=org_id,
            username="employee",
            email="employee@voiceshield.app",
            role="USER",
        )
        db.add(demo_user)
        db.commit()
    return demo_user


@router.post("/start", response_model=CallSessionDto, status_code=status.HTTP_201_CREATED)
async def start_call(
    req: CallStartRequest,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Start an active call session."""
    target_recipient_id = None
    if req.recipient_user_id:
        recipient = db.query(User).filter(
            (User.id == req.recipient_user_id) | (User.username == req.recipient_user_id),
            User.is_active == True,
        ).first()
        if recipient:
            target_recipient_id = recipient.id
        else:
            target_recipient_id = req.recipient_user_id
    elif user and user.role == "USER":
        target_recipient_id = user.id

    caller_user_id = user.id if user else None
    caller_display_name = req.caller_name or (user.full_name if user else "External Caller")

    orchestrator = SecurityOrchestrator(db=db)
    call = orchestrator.start_call_session(
        org_id=req.claimed_org_id or (user.org_id if user else None),
        session_id=req.session_id,
        user_id=caller_user_id,
        recipient_user_id=target_recipient_id,
        caller_number=req.caller_number,
        caller_name=caller_display_name,
        claimed_speaker_id=req.claimed_speaker_id,
        claimed_org_id=req.claimed_org_id,
        claimed_org_name=req.claimed_org_name,
    )

    # If this call is directed to a specific recipient, notify that recipient's personal WebSocket
    if target_recipient_id:
        dispatcher = AlertDispatcher.get_instance()
        await dispatcher.send_to_user(
            target_recipient_id,
            {
                "event": WebSocketEventType.INCOMING_CALL,
                "timestamp": utcnow().isoformat(),
                "data": call.to_dict(),
            },
        )

    return CallSessionDto(**call.to_dict())


@router.get("", response_model=List[CallSessionDto])
def list_calls(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List call sessions for the user or organization."""
    if user.role in ("ADMIN", "SOC_ANALYST", "SECURITY_ANALYST"):
        query = db.query(CallSession).filter_by(org_id=user.org_id)
    else:
        query = db.query(CallSession).filter(
            or_(CallSession.recipient_user_id == user.id, CallSession.user_id == user.id)
        )
    if status_filter:
        query = query.filter_by(status=status_filter)

    calls = query.order_by(CallSession.start_time.desc()).offset(offset).limit(limit).all()
    return [CallSessionDto(**c.to_dict()) for c in calls]


@router.get("/{session_id}", response_model=CallSessionDto)
def get_call(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve details and running risk state of a call session."""
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")
    if user.role == "USER" and call.user_id != user.id and call.recipient_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if user.role in ("ADMIN", "SOC_ANALYST") and call.org_id != user.org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return CallSessionDto(**call.to_dict())


@router.get("/{session_id}/events")
def get_call_events(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve fine-grained forensic RiskEvents for a call session."""
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")
    if user.role == "USER" and call.user_id != user.id and call.recipient_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if user.role in ("ADMIN", "SOC_ANALYST") and call.org_id != user.org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    events = db.query(RiskEvent).filter_by(session_id=session_id).order_by(RiskEvent.chunk_id.asc()).all()
    return [
        {
            "id": e.id,
            "session_id": e.session_id,
            "chunk_id": e.chunk_id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "speech_detected": e.speech_detected,
            "raw_synthetic_prob": e.raw_synthetic_prob,
            "smoothed_synthetic_prob": e.smoothed_synthetic_prob,
            "raw_speaker_sim": e.raw_speaker_sim,
            "smoothed_speaker_sim": e.smoothed_speaker_sim,
            "speaker_match": e.speaker_match,
            "transcript": e.transcript_chunk,
            "intent": e.intent,
            "intent_confidence": e.intent_confidence,
            "verdict": e.verdict,
            "risk_score": e.risk_score,
            "risk_level": e.risk_level,
            "recommended_action": e.recommended_action,
            "is_alert": e.is_alert,
            "alert_reason": e.alert_reason,
        }
        for e in events
    ]


@router.post("/{session_id}/accept", response_model=CallSessionDto)
async def accept_call(
    session_id: str,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Transition ringing call session to ACTIVE and notify all participants."""
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")

    call.status = "ACTIVE"
    db.commit()
    db.refresh(call)

    # Broadcast CALL_ACCEPTED to call stream WebSockets
    dispatcher = AlertDispatcher.get_instance()
    accepted_event = {
        "event": WebSocketEventType.CALL_ACCEPTED,
        "timestamp": utcnow().isoformat(),
        "data": call.to_dict(),
    }
    await dispatcher.send_to_call(session_id, accepted_event)

    # Also notify caller's personal user socket if caller is known
    if call.user_id:
        await dispatcher.send_to_user(call.user_id, accepted_event)

    log.info("[CallsAPI] Call session '%s' accepted. Status: ACTIVE.", session_id)
    return CallSessionDto(**call.to_dict())


@router.post("/{session_id}/end", response_model=CallSummaryDto)
async def end_call(
    session_id: str,
    req: CallEndRequest,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Terminate call session and produce final forensic telemetry summary."""
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")

    effective_user = _resolve_call_user(user, db)
    orchestrator = SecurityOrchestrator(db=db)
    summary = await orchestrator.end_call_session(
        session_id=session_id,
        reason=req.reason or "NORMAL_HANGUP",
        actor_id=effective_user.id,
    )
    if not summary:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed ending call session.")

    # Also notify recipient's personal WebSocket if assigned
    dispatcher = AlertDispatcher.get_instance()
    recipients_to_notify = {uid for uid in [call.recipient_user_id, call.user_id] if uid}
    for uid in recipients_to_notify:
        await dispatcher.send_to_user(
            uid,
            {
                "event": WebSocketEventType.CALL_ENDED,
                "timestamp": utcnow().isoformat(),
                "data": {"session_id": session_id, "reason": req.reason or "NORMAL_HANGUP"},
            },
        )

    return summary


@router.post("/{session_id}/report_risk", status_code=status.HTTP_200_OK)
async def report_call_risk(
    session_id: str,
    payload: dict,
    db: Session = Depends(get_db),
):
    """
    Allow User-Facing client / simulator to report detected risk levels,
    automatically opening a SecurityIncident in the SOC backend when risk >= 65.
    """
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        demo_user = _resolve_call_user(None, db)
        call = CallSession(
            session_id=session_id,
            org_id=demo_user.org_id,
            user_id=demo_user.id,
            status="ACTIVE",
            caller_name=payload.get("claimed_identity", "Simulator Caller"),
        )
        db.add(call)
        db.commit()

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

    active_incident = None
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

        # Dispatch real-time alert to SOC
        dispatcher = AlertDispatcher.get_instance()
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

    return {
        "status": "ok",
        "session_id": session_id,
        "risk_score": call.current_risk_score,
        "risk_level": call.current_risk_level,
        "incident_id": active_incident.incident_id if active_incident else None,
    }

