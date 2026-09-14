"""
backend/platform/server/routes/calls.py
======================================
Call Session orchestration and lifecycle endpoints.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.platform.db.models import CallSession, User
from backend.platform.db.session import get_db
from backend.platform.schemas.calls import (
    CallEndRequest,
    CallSessionDto,
    CallStartRequest,
    CallSummaryDto,
)
from backend.platform.server.dependencies import get_current_user
from backend.platform.services.orchestrator import SecurityOrchestrator

router = APIRouter(prefix="/api/calls", tags=["Call Sessions"])


@router.post("/start", response_model=CallSessionDto, status_code=status.HTTP_201_CREATED)
async def start_call(
    req: CallStartRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start an active call session under the user's organization."""
    orchestrator = SecurityOrchestrator(db=db)
    call = orchestrator.start_call_session(
        org_id=user.org_id,
        session_id=req.session_id,
        user_id=user.id,
        caller_number=req.caller_number,
        caller_name=req.caller_name,
        claimed_speaker_id=req.claimed_speaker_id,
    )
    
    call_dto = CallSessionDto(**call.to_dict())
    
    if req.recipient_user_id:
        from backend.platform.services.alert_dispatcher import AlertDispatcher
        dispatcher = AlertDispatcher.get_instance()
        event_payload = {
            "event": "INCOMING_CALL",
            "data": call_dto.model_dump()
        }
        await dispatcher.send_to_user(req.recipient_user_id, event_payload)
        
    return call_dto


@router.get("", response_model=List[CallSessionDto])
def list_calls(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List call sessions for the user's organization."""
    query = db.query(CallSession).filter_by(org_id=user.org_id)
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
    call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")
    return CallSessionDto(**call.to_dict())

@router.post("/{session_id}/accept", response_model=CallSessionDto)
async def accept_call(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept an incoming call and notify the caller."""
    call = db.query(CallSession).filter_by(session_id=session_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")
    
    call.status = "ACTIVE"
    db.commit()

    # Notify caller that call was accepted
    from backend.platform.services.alert_dispatcher import AlertDispatcher
    dispatcher = AlertDispatcher.get_instance()
    await dispatcher.send_to_call(session_id, {
        "event": "CALL_ACCEPTED",
        "data": CallSessionDto(**call.to_dict()).model_dump()
    })
    
    return CallSessionDto(**call.to_dict())


@router.post("/{session_id}/end", response_model=CallSummaryDto)
async def end_call(
    session_id: str,
    req: CallEndRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Terminate call session and produce final forensic telemetry summary."""
    call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")

    orchestrator = SecurityOrchestrator(db=db)
    summary = await orchestrator.end_call_session(
        session_id=session_id,
        reason=req.reason or "NORMAL_HANGUP",
        actor_id=user.id,
    )
    if not summary:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed ending call session.")
    return summary


# ── Batch 2B: Verification Workflow ─────────────────────────────────────────

import random
from datetime import datetime, timezone
from backend.platform.schemas.events import VerificationEventPayload, WebSocketEventType
from backend.platform.services.alert_dispatcher import AlertDispatcher
from backend.platform.db.models import AuditLog
import json as _json

_CHALLENGE_ADJECTIVES = ["Blue", "Silent", "Golden", "Swift", "Crimson", "Silver", "Arctic", "Iron", "Storm", "Clear"]
_CHALLENGE_NOUNS = ["River", "Eagle", "Shield", "Mountain", "Forest", "Horizon", "Bridge", "Falcon", "Watch", "Stone"]


@router.post("/{session_id}/verification/start", status_code=status.HTTP_202_ACCEPTED)
async def start_verification(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Batch 2B — Initiate verification workflow for an active call session.

    - Generates a random challenge phrase.
    - Broadcasts VERIFICATION_EVENT (CHALLENGE_PRESENTED) to the call socket.
    - Broadcasts VERIFICATION_EVENT (CHALLENGE_PRESENTED) to the org SOC socket.
    - Writes an audit log entry.

    Audio-matching analysis is not performed server-side (not yet implemented).
    The frontend drives the listening/analyzing simulation and submits the result
    via POST /{session_id}/verification/result when backend matching is available.
    """
    call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")

    if call.status not in ("ACTIVE",):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start verification: call status is '{call.status}'.",
        )

    # Generate unpredictable challenge phrase
    adj = random.choice(_CHALLENGE_ADJECTIVES)
    noun = random.choice(_CHALLENGE_NOUNS)
    number = random.randint(10, 99)
    phrase = f"{adj} {noun} {number}"

    now_iso = datetime.now(timezone.utc).isoformat()
    dispatcher = AlertDispatcher.get_instance()

    # Identity context (caller name only — no ML scores)
    identity_ctx = call.caller_name or call.claimed_speaker_id or "Unknown Caller"

    # Build event payload
    verification_payload = VerificationEventPayload(
        session_id=session_id,
        verification_type="CHALLENGE_PRESENTED",
        challenge_phrase=phrase,
        method="active_challenge",
        triggered_by="USER_INITIATED",
        identity_context=identity_ctx,
        timestamp=now_iso,
    )

    event_envelope = {
        "event": WebSocketEventType.VERIFICATION_EVENT,
        "timestamp": now_iso,
        "data": verification_payload.model_dump(),
    }

    # Send to employee call socket
    await dispatcher.send_to_call(session_id, event_envelope)

    # Send to org SOC socket (security context — no ML metrics)
    await dispatcher.send_to_org(call.org_id, {
        "event": WebSocketEventType.VERIFICATION_EVENT,
        "timestamp": now_iso,
        "data": {
            "session_id": session_id,
            "verification_type": "VERIFICATION_STARTED",
            "method": "active_challenge",
            "triggered_by": "USER_INITIATED",
            "identity_context": identity_ctx,
            "timestamp": now_iso,
        },
    })

    # Audit log
    audit = AuditLog(
        org_id=call.org_id,
        actor_id=user.id,
        session_id=session_id,
        event_type="VERIFICATION_STARTED",
        details_json=_json.dumps({
            "method": "active_challenge",
            "triggered_by": "USER_INITIATED",
        }),
    )
    db.add(audit)
    db.commit()

    return {"session_id": session_id, "challenge_phrase": phrase, "status": "verification_started"}

from pydantic import BaseModel
class VerificationResultRequest(BaseModel):
    outcome: str
    method: str = "active_challenge"
    triggered_by: str = "USER_INITIATED"

@router.post("/{session_id}/verification/result", status_code=status.HTTP_200_OK)
async def submit_verification_result(
    session_id: str,
    req: VerificationResultRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit verification result to broadcast to SOC."""
    call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    dispatcher = AlertDispatcher.get_instance()
    identity_ctx = call.caller_name or call.claimed_speaker_id or "Unknown Caller"

    verification_payload = VerificationEventPayload(
        session_id=session_id,
        verification_type="VERIFICATION_COMPLETED",
        outcome=req.outcome,
        method=req.method,
        triggered_by=req.triggered_by,
        identity_context=identity_ctx,
        timestamp=now_iso,
    )

    event_envelope = {
        "event": WebSocketEventType.VERIFICATION_EVENT,
        "timestamp": now_iso,
        "data": verification_payload.model_dump(),
    }

    await dispatcher.send_to_call(session_id, event_envelope)
    await dispatcher.send_to_org(call.org_id, event_envelope)

    audit = AuditLog(
        org_id=call.org_id,
        actor_id=user.id,
        session_id=session_id,
        event_type="VERIFICATION_COMPLETED",
        details_json=_json.dumps({"outcome": req.outcome, "method": req.method}),
    )
    db.add(audit)
    db.commit()

    return {"status": "success"}

class EmployeeActionRequest(BaseModel):
    action: str
    details: Optional[str] = None

@router.post("/{session_id}/action", status_code=status.HTTP_200_OK)
async def employee_action(
    session_id: str,
    req: EmployeeActionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record employee action and broadcast to SOC."""
    call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")

    now_iso = datetime.now(timezone.utc).isoformat()
    dispatcher = AlertDispatcher.get_instance()
    
    event_payload = {
        "event": WebSocketEventType.SECURITY_ACTION,
        "timestamp": now_iso,
        "data": {
            "session_id": session_id,
            "action_type": req.action,
            "actor": "EMPLOYEE",
            "notes": req.details,
            "timestamp": now_iso
        }
    }
    await dispatcher.send_to_org(call.org_id, event_payload)
    
    audit = AuditLog(
        org_id=call.org_id,
        actor_id=user.id,
        session_id=session_id,
        event_type=f"EMPLOYEE_ACTION_{req.action.upper()}",
        details_json=_json.dumps({"details": req.details}),
    )
    db.add(audit)
    db.commit()
    return {"status": "success"}

