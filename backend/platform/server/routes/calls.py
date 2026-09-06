"""
backend/platform/server/routes/calls.py
======================================
Call Session orchestration and lifecycle endpoints.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.platform.db.models import AuditLog, CallSession, Organization, SecurityIncident, User, utcnow
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
def start_call(
    req: CallStartRequest,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Start an active call session under the user's organization."""
    effective_user = _resolve_call_user(user, db)
    orchestrator = SecurityOrchestrator(db=db)
    call = orchestrator.start_call_session(
        org_id=effective_user.org_id,
        session_id=req.session_id,
        user_id=effective_user.id,
        caller_number=req.caller_number,
        caller_name=req.caller_name,
        claimed_speaker_id=req.claimed_speaker_id,
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
    """List call sessions for the user's organization."""
    query = db.query(CallSession).filter_by(org_id=user.org_id)
    if user.role == "USER":
        # Regular users only see their own calls
        query = query.filter_by(user_id=user.id)
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
    if user.role == "USER" and call.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
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

