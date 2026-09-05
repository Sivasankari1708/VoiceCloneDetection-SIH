"""
backend/platform/schemas/organizations.py
=========================================
Organization and multi-tenancy schemas.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class OrganizationCreateDto(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    code: str = Field(..., min_length=2, max_length=64, description="Unique alphanumeric identifier")


class OrganizationDto(BaseModel):
    id: str
    name: str
    code: str
    is_active: bool
    created_at: Optional[str] = None
