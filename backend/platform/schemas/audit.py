"""
backend/platform/schemas/audit.py
=================================
Schemas for Audit Log queries and history.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from pydantic import BaseModel


class AuditLogDto(BaseModel):
    id: str
    org_id: str
    actor_id: Optional[str] = None
    session_id: Optional[str] = None
    event_type: str
    ip_address: Optional[str] = None
    details: Dict[str, Any] = {}
    timestamp: Optional[str] = None
