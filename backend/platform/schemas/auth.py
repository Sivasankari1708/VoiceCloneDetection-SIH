"""
backend/platform/schemas/auth.py
================================
Authentication DTOs and role definitions.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class RoleEnum:
    USER = "USER"
    SECURITY_OPERATOR = "SECURITY_OPERATOR"
    ADMIN = "ADMIN"


class LoginRequest(BaseModel):
    username: str = Field(..., description="Username or email")
    password: str = Field(..., min_length=1, description="Password")


class UserDto(BaseModel):
    id: str
    org_id: str
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[str] = None


class UserCreateDto(BaseModel):
    username: str
    email: str
    password: str = Field(..., min_length=6)
    full_name: str
    role: str = "USER"  # USER, SECURITY_OPERATOR, ADMIN


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserDto
