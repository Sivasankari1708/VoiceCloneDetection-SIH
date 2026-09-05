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
def start_call(
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Terminate call session and produce final forensic telemetry summary."""
    call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
    if not call:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call session not found.")
    if user.role == "USER" and call.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    orchestrator = SecurityOrchestrator(db=db)
    summary = await orchestrator.end_call_session(
        session_id=session_id,
        reason=req.reason or "NORMAL_HANGUP",
        actor_id=user.id,
    )
    if not summary:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed ending call session.")
    return summary
