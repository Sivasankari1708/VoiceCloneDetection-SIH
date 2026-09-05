"""
backend/platform/server/routes/audit.py
======================================
Audit log compliance and forensic retrieval endpoints.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.platform.db.models import AuditLog, User
from backend.platform.db.session import get_db
from backend.platform.schemas.audit import AuditLogDto
from backend.platform.server.dependencies import require_role

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=List[AuditLogDto])
def list_audit_logs(
    session_id: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_role(["SECURITY_OPERATOR", "ADMIN"])),
    db: Session = Depends(get_db),
):
    """List forensic audit trail events for compliance review."""
    query = db.query(AuditLog).filter_by(org_id=user.org_id)
    if session_id:
        query = query.filter_by(session_id=session_id)
    if event_type:
        query = query.filter_by(event_type=event_type)

    logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
    return [AuditLogDto(**l.to_dict()) for l in logs]
