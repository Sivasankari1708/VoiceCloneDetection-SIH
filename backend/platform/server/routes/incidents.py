"""
backend/platform/server/routes/incidents.py
===========================================
Security Incident triage, investigation, and operator action endpoints.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.platform.db.models import SecurityIncident, User, utcnow
from backend.platform.db.session import get_db
from backend.platform.schemas.incidents import (
    IncidentActionRequest,
    IncidentDto,
    IncidentUpdateDto,
    SecurityActionDto,
)
from backend.platform.server.dependencies import get_current_user, require_role
from backend.platform.services.orchestrator import SecurityOrchestrator

router = APIRouter(prefix="/api/incidents", tags=["Security Incidents"])


@router.get("", response_model=List[IncidentDto])
def list_incidents(
    severity: Optional[str] = Query(None, description="HIGH, CRITICAL"),
    status_filter: Optional[str] = Query(None, alias="status", description="OPEN, UNDER_REVIEW, CONFIRMED_ATTACK, FALSE_POSITIVE, RESOLVED"),
    session_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_role(["SECURITY_OPERATOR", "ADMIN"])),
    db: Session = Depends(get_db),
):
    """List security incidents for the organization's Security Operations Center (SOC)."""
    query = db.query(SecurityIncident).filter_by(org_id=user.org_id)
    if severity:
        query = query.filter_by(severity=severity)
    if status_filter:
        query = query.filter_by(status=status_filter)
    if session_id:
        query = query.filter_by(session_id=session_id)

    incidents = query.order_by(SecurityIncident.created_at.desc()).offset(offset).limit(limit).all()
    results = []
    for inc in incidents:
        d = inc.to_dict()
        d["actions"] = [SecurityActionDto(**a.to_dict()) for a in inc.actions]
        results.append(IncidentDto(**d))
    return results


@router.get("/{incident_id}", response_model=IncidentDto)
def get_incident(
    incident_id: str,
    user: User = Depends(require_role(["SECURITY_OPERATOR", "ADMIN"])),
    db: Session = Depends(get_db),
):
    """Retrieve full incident evidence, acoustic breakdown, and action history."""
    incident = db.query(SecurityIncident).filter_by(incident_id=incident_id, org_id=user.org_id).first()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    d = incident.to_dict()
    d["actions"] = [SecurityActionDto(**a.to_dict()) for a in incident.actions]
    return IncidentDto(**d)


@router.post("/{incident_id}/action", response_model=SecurityActionDto)
async def take_security_action(
    incident_id: str,
    req: IncidentActionRequest,
    user: User = Depends(require_role(["SECURITY_OPERATOR", "ADMIN"])),
    db: Session = Depends(get_db),
):
    """
    Execute a simulated security response action.
    Actions:
      - CONFIRM_ATTACK
      - FALSE_POSITIVE
      - ESCALATE
      - RESOLVE
      - BLOCK_CALL
      - REQUIRE_ADDITIONAL_VERIFICATION
      - DISMISS
    """
    orchestrator = SecurityOrchestrator(db=db)
    try:
        action_dict = await orchestrator.execute_operator_action(
            incident_id=incident_id,
            action_type=req.action_type,
            actor=user,
            notes=req.notes,
        )
        return SecurityActionDto(**action_dict)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/{incident_id}", response_model=IncidentDto)
def update_incident(
    incident_id: str,
    req: IncidentUpdateDto,
    user: User = Depends(require_role(["SECURITY_OPERATOR", "ADMIN"])),
    db: Session = Depends(get_db),
):
    """Update incident investigation status or operator notes."""
    incident = db.query(SecurityIncident).filter_by(incident_id=incident_id, org_id=user.org_id).first()
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    if req.status:
        incident.status = req.status
        if req.status in ("RESOLVED", "FALSE_POSITIVE"):
            incident.resolved_at = utcnow()
    if req.operator_notes:
        incident.operator_notes = req.operator_notes
    incident.updated_at = utcnow()
    db.commit()

    d = incident.to_dict()
    d["actions"] = [SecurityActionDto(**a.to_dict()) for a in incident.actions]
    return IncidentDto(**d)
