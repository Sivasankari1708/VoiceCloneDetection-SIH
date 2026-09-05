"""
backend/platform/server/routes/auth.py
======================================
Authentication endpoints: login and profile identity.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.platform.config import platform_config
from backend.platform.db.models import User
from backend.platform.db.session import get_db
from backend.platform.schemas.auth import LoginRequest, TokenResponse, UserDto
from backend.platform.server.dependencies import get_current_user
from backend.platform.services.auth_service import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with username and password, returning signed JWT."""
    user = db.query(User).filter(
        (User.username == req.username) | (User.email == req.username)
    ).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=platform_config.access_token_expire_minutes,
        user=UserDto(**user.to_dict()),
    )


@router.get("/me", response_model=UserDto)
def get_me(user: User = Depends(get_current_user)):
    """Return currently authenticated user profile."""
    return UserDto(**user.to_dict())
