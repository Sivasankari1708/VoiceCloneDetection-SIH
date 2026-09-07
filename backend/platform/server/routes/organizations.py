"""
backend/platform/server/routes/organizations.py
===============================================
Tenant Organization management endpoints.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.platform.db.models import Organization, User
from backend.platform.db.session import get_db
from backend.platform.schemas.auth import UserDto
from backend.platform.schemas.organizations import OrganizationDto
from backend.platform.server.dependencies import get_current_org, get_current_user

router = APIRouter(prefix="/api/organizations", tags=["Organizations"])


@router.get("/me", response_model=OrganizationDto)
def get_my_organization(
    org: Organization = Depends(get_current_org),
):
    """Retrieve details of the authenticated user's organization."""
    return OrganizationDto(**org.to_dict())


@router.get("/users", response_model=List[UserDto])
def get_my_organization_users(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all users belonging to the authenticated user's organization."""
    users = db.query(User).filter_by(org_id=user.org_id, is_active=True).all()
    return [UserDto(**u.to_dict()) for u in users]
